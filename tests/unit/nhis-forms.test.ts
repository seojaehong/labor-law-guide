import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { bannedHits } from '@/lib/tool-kit/banned';
import { lossDateOf, parseYmd, todayKst } from '@/lib/nhis-forms/dates';
import {
  FORM_MAPS,
  PacketError,
  acqValues,
  birthOf,
  buildPacket,
  delayStatementLines,
  lossValues,
  missingGlyphs,
  recipientOf,
  validate,
  type AcqPerson,
  type Business,
  type LossPerson,
  type PacketInput,
} from '@/lib/nhis-forms/build';

const root = process.cwd();
const read = (p: string) => new Uint8Array(readFileSync(path.join(root, p)));
const font = read('public/fonts/llg-forms/LLGFormsSans-Regular.ttf');
const forms = { loss: read('public/forms/nhis/NHIS_8_LOSS.pdf'), acq: read('public/forms/nhis/NHIS_6_ACQ.pdf') };
const build = (input: PacketInput) => buildPacket({ formPdf: forms[input.kind], font }, input);

// 합성 값만 쓴다(실존 인물·주민번호 아님)
const biz: Business = {
  mgmtNo: '12345678900',
  name: '가상상사',
  tel: '043-000-0000',
  fax: '043-000-0001',
  addr: '충청북도 청주시 상당구 상당로81번길 63 (서문동)',
  zip: '28000',
  ownerName: '홍대표',
};
const leaver: LossPerson = {
  name: '김가상',
  rrn: '900101-1000000',
  lastWorkDay: '2026-05-31',
  nhisCode: '01',
  payCur: 12_000_000,
  monthsCur: 5,
  payPrev: 30_000_000,
  monthsPrev: 12,
};
const joiner: AcqPerson = { name: '이가상', rrn: '950505-2000000', acqDate: '2026-03-02', monthlyPay: 2_500_000, nhisCode: '00', ceo: false };
const NOW = new Date('2026-11-02T16:30:00Z'); // KST 11-03 01:30
const lossInput: PacketInput = { kind: 'loss', biz, people: [leaver], reason: '퇴사 처리 과정에서 신고를 빠뜨렸습니다.', branchName: '청주동부지사', now: NOW };
const acqInput: PacketInput = { kind: 'acq', biz, people: [joiner], reason: '입사 후 신고 기한을 놓쳤습니다.', branchName: '청주동부지사', now: NOW };

async function pdfText(bytes: Uint8Array): Promise<string[]> {
  const doc = await getDocument({ data: bytes.slice(), useSystemFonts: false }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    out.push(tc.items.map((x) => ('str' in x ? x.str : '')).join(' '));
  }
  return out;
}

/** 출력 PDF 에 실린 TrueType 글꼴(FontFile2) 바이트들 */
async function embeddedFonts(bytes: Uint8Array): Promise<Uint8Array[]> {
  const doc = await PDFDocument.load(bytes);
  const out: Uint8Array[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict) || obj.get(PDFName.of('Type')) !== PDFName.of('FontDescriptor')) continue;
    const ff = doc.context.lookup(obj.get(PDFName.of('FontFile2')));
    if (ff instanceof PDFRawStream) out.push(decodePDFRawStream(ff).decode());
  }
  return out;
}

/** 무늬가 있는 큰 PNG(압축이 안 되게) — 사용자가 원본 도장 사진을 그대로 고른 경우 */
function noisePng(w: number, h: number): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8bit RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  let s = 12345;
  for (let i = 0; i < raw.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    raw[i] = i % (w * 4 + 1) === 0 ? 0 : s >> 16;
  }
  return new Uint8Array(
    Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]),
  );
}

describe('날짜', () => {
  it('상실일 = 마지막 근무일 다음 날', () => {
    expect(lossDateOf('2026-05-31')).toBe('2026-06-01');
    expect(lossDateOf('2028-02-28')).toBe('2028-02-29');
    expect(lossDateOf('2026-12-31')).toBe('2027-01-01');
  });
  it('없는 날·1900년 이전(달력 입력 0026 등)은 받지 않는다', () => {
    expect(parseYmd('2026-02-30')).toBeNull();
    expect(parseYmd('0026-05-31')).toBeNull();
    expect(parseYmd('')).toBeNull();
    expect(() => lossDateOf('')).toThrow(/날짜/);
  });
  it('작성일은 KST 오늘', () => {
    expect(todayKst(NOW)).toBe('2026-11-03');
  });
});

describe('칸 값', () => {
  it('상실 — 건강보험만 체크, 상실일·부호·보수총액·작성일', () => {
    const v = lossValues(biz, [leaver], NOW);
    expect(v.title_nhis).toBe(true);
    expect(v.title_nps).toBeUndefined();
    expect(v.name_1).toBe('김가상');
    expect(v.loss_date_1).toBe('2026.06.01');
    expect(v.nhis_code_1).toBe('01');
    expect(v.nhis_pay_cur_1).toBe('12,000,000');
    expect([v.date_y, v.date_m, v.date_d]).toEqual(['2026', '11', '3']);
    expect(v.reporter_name).toBe('홍대표');
  });
  it('취득 — 건강보험 체크·대표자 여부는 입력대로·취득일', () => {
    const v = acqValues(biz, [joiner], NOW);
    expect(v.title_nhis).toBe(true);
    expect(v.nhis_on_1).toBe(true);
    expect([v.ceo_yes_1, v.ceo_no_1]).toEqual([false, true]);
    expect(acqValues(biz, [{ ...joiner, ceo: true }], NOW)).toMatchObject({ ceo_yes_1: true, ceo_no_1: false });
    expect(v.acq_date_1).toBe('2026.03.02');
    expect(v.monthly_pay_1).toBe('2,500,000');
    expect(v.nhis_code_1).toBe('00');
  });
  it('취득 — 구분 번호는 인쇄돼 있어 찍지 않는다', () => {
    expect(acqValues(biz, [joiner], NOW).seq_1).toBeUndefined();
  });
  it('만드는 칸 이름은 전부 서식 지도에 있다', () => {
    for (const k of Object.keys(lossValues(biz, Array(4).fill(leaver), NOW))) expect(FORM_MAPS.loss.slots, k).toHaveProperty(k);
    for (const k of Object.keys(acqValues(biz, Array(4).fill(joiner), NOW))) expect(FORM_MAPS.acq.slots, k).toHaveProperty(k);
  });
  it('지도의 원본 해시 = 싣는 서식 PDF', () => {
    for (const k of ['loss', 'acq'] as const)
      expect(createHash('sha256').update(forms[k]).digest('hex'), k).toBe(FORM_MAPS[k].source_sha256);
  });
});

describe('입력 검사', () => {
  it('정상 입력은 문제 없음', () => {
    expect(validate(lossInput)).toEqual([]);
    expect(validate(acqInput)).toEqual([]);
  });
  it('빈 칸을 하나씩 짚는다', () => {
    const p = validate({
      ...acqInput,
      biz: { ...biz, mgmtNo: '123', ownerName: ' ', addr: '' },
      reason: '',
      people: [{ ...joiner, rrn: '', acqDate: '', monthlyPay: 0 }],
    });
    for (const w of ['사업장관리번호', '대표자 성명', '사업장 주소', '늦어진 이유', '주민등록번호', '자격취득일', '월 보수액']) expect(p.join(' ')).toContain(w);
  });
  it('한 장에 4명을 넘으면 거부', async () => {
    await expect(build({ ...lossInput, people: Array(5).fill(leaver) })).rejects.toBeInstanceOf(PacketError);
  });
  it('숫자 아닌 보수·12 넘는 개월수는 거부', () => {
    expect(validate({ ...lossInput, people: [{ ...leaver, payCur: NaN }] }).join()).toContain('숫자만');
    expect(validate({ ...lossInput, people: [{ ...leaver, monthsCur: 13 }] }).join()).toContain('12 이하');
  });
});

describe('사업주확인서(지연사유)', () => {
  const lines = delayStatementLines({
    kind: 'loss',
    biz,
    people: [{ name: leaver.name, rrn: leaver.rrn, date: lossDateOf(leaver.lastWorkDay) }],
    reason: '퇴사 처리 과정에서 신고를 빠뜨렸습니다.',
    branchName: '청주동부지사',
    now: NOW,
  });
  const t = lines.join('\n');
  it('요건 — 정본 구성(사업주확인서·지연사유)·수신 지사장·사유·사업주 책임 문구·작성일', () => {
    expect(lines[0]).toBe('사 업 주 확 인 서');
    expect(t).toContain('자격상실 신고 지연사유');
    expect(t).toContain('수신 : 국민건강보험공단 청주동부지사장');
    expect(t).toContain('퇴사 처리 과정에서 신고를 빠뜨렸습니다.');
    expect(t).toContain('위 내용이 사실임을 확인하며, 신고 지연에 대한 책임은 사업주에게 있습니다.');
    expect(t).toContain('2026년 11월 3일');
    expect(t).toContain('상실일 2026.06.01');
  });
  it('수신 — 「지사장」까지 적어도 「지사장장」이 되지 않는다', () => {
    expect(recipientOf('청주동부지사장')).toBe('수신 : 국민건강보험공단 청주동부지사장');
    expect(recipientOf('')).toBe('수신 : 국민건강보험공단 관할 지사장');
  });
  it('주민등록번호 대신 생년월일만 싣는다', () => {
    expect(t).not.toContain('900101');
    expect(t).toContain('생년월일 1990.01.01');
  });
  it('생년월일 — 세기 구분(1·2=1900, 3·4=2000, 9·0=1800)', () => {
    expect(birthOf('900101-1000000')).toBe('1990.01.01');
    expect(birthOf('050505-4000000')).toBe('2005.05.05');
    expect(birthOf('9905051000000')).toBe('1999.05.05');
    expect(birthOf('아무글자')).toBe('');
  });
  it('금지어 없음', () => {
    expect(bannedHits(t)).toEqual([]);
  });
});

describe('PDF 묶음', () => {
  it('상실 신고서 + 확인서 = 2쪽, 값이 글자로 들어 있다, 1MB 이하', async () => {
    const { bytes, report, withinLimit } = await build(lossInput);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
    const [p1, p2] = await pdfText(bytes);
    expect(p1).toContain('김가상');
    expect(p1).toContain('2026.06.01');
    expect(p2).toContain('청주동부지사');
    expect(report.skipped.filter((k) => ['name_1', 'rrn_1', 'loss_date_1', 'nhis_code_1'].includes(k) || k.startsWith('st_'))).toEqual([]);
    expect(withinLimit).toBe(true);
  });
  it('취득 신고서 + 확인서 = 2쪽', async () => {
    const { bytes, withinLimit } = await build(acqInput);
    const [p1] = await pdfText(bytes);
    expect(p1).toContain('이가상');
    expect(p1).toContain('2026.03.02');
    expect(withinLimit).toBe(true);
  });
  it('글꼴에 없는 글자(한자)는 빈칸으로 내보내지 않고 거부한다', async () => {
    await expect(build({ ...acqInput, people: [{ ...joiner, name: '金가상' }] })).rejects.toThrow(/金/);
  });
  it('칸보다 긴 이름은 옆 칸으로 넘기지 않고 거부한다', async () => {
    await expect(build({ ...lossInput, people: [{ ...leaver, name: '가'.repeat(40) }] })).rejects.toBeInstanceOf(PacketError);
  });
  it('확인서 칸을 넘는 사유는 잘라 내지 않고 거부한다', async () => {
    await expect(build({ ...lossInput, reason: '신고를 빠뜨렸습니다.\n'.repeat(20) })).rejects.toThrow(/늦어진 이유/);
  });
  it('조합형(NFD)으로 들어온 이름도 완성형으로 싣는다', async () => {
    const { bytes } = await build({ ...lossInput, people: [{ ...leaver, name: '김가상'.normalize('NFD') }] });
    expect((await pdfText(bytes))[0]).toContain('김가상');
  });
  it('원본 크기 도장 그림을 그대로 넣으면 한도 초과로 알린다', async () => {
    const { withinLimit } = await build({ ...lossInput, stamp: noisePng(900, 900) });
    expect(withinLimit).toBe(false);
  });
  it('줄인 도장(300px)이면 한도 안이다', async () => {
    const { withinLimit } = await build({ ...lossInput, stamp: noisePng(300, 300) });
    expect(withinLimit).toBe(true);
  });
});

describe('서식 글꼴', () => {
  it('한글 음절 전부와 숫자가 있다', () => {
    expect(missingGlyphs(font, '똠햏뷁힣가0123456789.,-()√')).toEqual([]);
  });
  // 261102 — pdf-lib 서브셋은 글자를 추출되게 두고 그림만 비웠다. 글자 추출 시험은 그 사고를 못 잡는다.
  // 그래서 출력 PDF 에 실제로 실린 글꼴을 꺼내 쓴 글자의 윤곽이 있는지 본다
  it('출력 PDF 에 실린 글꼴 — 쓴 글자의 윤곽이 비어 있지 않다', async () => {
    const { bytes } = await build(lossInput);
    const embedded = await embeddedFonts(bytes);
    expect(embedded.length).toBeGreaterThan(0);
    const f = fontkit.create(Buffer.from(embedded.sort((a, b) => b.length - a.length)[0]));
    for (const ch of '김가상홍대표청주동부지사확인서0123456789.')
      expect(f.glyphForCodePoint(ch.codePointAt(0)!).path.toSVG().length, ch).toBeGreaterThan(0);
  });
  it('수정판이라 OFL 예약 이름(Nanum)을 쓰지 않는다', () => {
    const f = fontkit.create(font);
    expect(`${f.familyName} ${f.postscriptName}`).not.toMatch(/nanum|나눔/i);
  });
});
