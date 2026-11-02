import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { bannedHits } from '@/lib/tool-kit/banned';
import {
  lossDateOf,
  todayKst,
  lossValues,
  acqValues,
  buildPacket,
  delayStatementLines,
  missingGlyphs,
  birthOf,
  type Business,
  type LossPerson,
  type AcqPerson,
} from '@/lib/nhis-forms/build';

const root = process.cwd();
const assets = {
  lossPdf: new Uint8Array(readFileSync(path.join(root, 'public/forms/nhis/NHIS_8_LOSS.pdf'))),
  acqPdf: new Uint8Array(readFileSync(path.join(root, 'public/forms/nhis/NHIS_6_ACQ.pdf'))),
  font: new Uint8Array(readFileSync(path.join(root, 'public/fonts/llg-forms/LLGFormsSans-Regular.ttf'))),
};

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
const joiner: AcqPerson = { name: '이가상', rrn: '950505-2000000', acqDate: '2026-03-02', monthlyPay: 2_500_000, nhisCode: '00' };
const NOW = new Date('2026-11-02T16:30:00Z'); // KST 11-03 01:30

async function pdfText(bytes: Uint8Array): Promise<string[]> {
  const doc = await getDocument({ data: bytes.slice(), useSystemFonts: false }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    out.push(tc.items.map((x) => ('str' in x ? x.str : '')).join(' '));
  }
  return out;
}

describe('날짜', () => {
  it('상실일 = 마지막 근무일 다음 날', () => {
    expect(lossDateOf('2026-05-31')).toBe('2026-06-01');
    expect(lossDateOf('2028-02-28')).toBe('2028-02-29');
    expect(lossDateOf('2026-12-31')).toBe('2027-01-01');
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
  it('취득 — 건강보험 체크·대표자 아니오·취득일', () => {
    const v = acqValues(biz, [joiner], NOW);
    expect(v.title_nhis).toBe(true);
    expect(v.nhis_on_1).toBe(true);
    expect(v.ceo_no_1).toBe(true);
    expect(v.acq_date_1).toBe('2026.03.02');
    expect(v.monthly_pay_1).toBe('2,500,000');
    expect(v.nhis_code_1).toBe('00');
  });
  it('한 장에 4명을 넘으면 거부', () => {
    expect(() => lossValues(biz, Array(5).fill(leaver), NOW)).toThrow();
  });
});

describe('지연 사유서', () => {
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
  it('상실 신고서 + 사유서 = 2쪽, 값이 글자로 들어 있다, 1MB 이하', async () => {
    const { bytes, report } = await buildPacket(assets, {
      kind: 'loss',
      biz,
      people: [leaver],
      reason: '퇴사 처리 과정에서 신고를 빠뜨렸습니다.',
      branchName: '청주동부지사',
      now: NOW,
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    const [p1, p2] = await pdfText(bytes);
    expect(p1).toContain('김가상');
    expect(p1).toContain('2026.06.01');
    expect(p2).toContain('청주동부지사');
    expect(report.skipped.filter((k) => k.endsWith('_1') && ['name_1', 'rrn_1', 'loss_date_1'].includes(k))).toEqual([]);
    expect(bytes.length).toBeLessThan(1_000_000);
  });
  it('글꼴에 없는 글자(한자)는 빈칸으로 내보내지 않고 거부한다', async () => {
    await expect(
      buildPacket(assets, { kind: 'acq', biz, people: [{ ...joiner, name: '金가상' }], reason: '사유', now: NOW }),
    ).rejects.toThrow(/金/);
  });
  it('서식 글꼴 — 한글 음절 전부와 숫자가 있다(서브셋 끔 전제)', () => {
    expect(missingGlyphs(assets.font, '똠햏뷁힣가0123456789.,-()√')).toEqual([]);
  });
  // 261102 — pdf-lib 서브셋은 글자를 추출되게 두고 그림만 비웠다. 글자 추출 시험은 그 사고를 못 잡는다.
  // 그래서 글꼴 윤곽이 실제로 있는지 본다(서브셋을 끄고 이 글꼴을 통째로 싣는 것이 전제)
  it('서식 글꼴 — 쓰는 글자의 윤곽이 비어 있지 않다', () => {
    const f = fontkit.create(Buffer.from(assets.font)) as unknown as {
      glyphForCodePoint(c: number): { path: { commands: unknown[] } };
    };
    for (const ch of '가상김홍힣0123456789.-√')
      expect(f.glyphForCodePoint(ch.codePointAt(0)!).path.commands.length, ch).toBeGreaterThan(0);
  });
  it('서식 글꼴 — 수정판이라 OFL 예약 이름(Nanum)을 쓰지 않는다', () => {
    const f = fontkit.create(Buffer.from(assets.font)) as unknown as { familyName: string; postscriptName: string };
    expect(`${f.familyName} ${f.postscriptName}`).not.toMatch(/nanum|나눔/i);
  });
  it('채우기는 서브셋을 끈다', () => {
    expect(readFileSync(path.join(root, 'src/lib/nhis-forms/build.ts'), 'utf8')).toMatch(/subset: false/);
  });
  it('취득 — 구분 번호는 인쇄돼 있어 찍지 않는다', () => {
    expect(acqValues(biz, [joiner], NOW).seq_1).toBeUndefined();
  });
  it('취득 신고서 + 사유서 = 2쪽', async () => {
    const { bytes } = await buildPacket(assets, {
      kind: 'acq',
      biz,
      people: [joiner],
      reason: '입사 후 신고 기한을 놓쳤습니다.',
      branchName: '청주동부지사',
      now: NOW,
    });
    const [p1] = await pdfText(bytes);
    expect(p1).toContain('이가상');
    expect(p1).toContain('2026.03.02');
    expect(bytes.length).toBeLessThan(1_000_000);
  });
});
