// 호증 날인(stamp_exhibit_pdf) — 배치 계산·날인 사각형·도구 입출력. 합성 PDF 만 쓴다(실제 서증 아님).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFString, StandardFonts, decodePDFRawStream, degrees } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { bannedHits } from '@/lib/tool-kit/banned';
import { MM, BAND_MM, paddedBox, planStamp, stampLayout, stampRect } from '../../tools/k-labor/lib/exhibit-stamp.mjs';
import { registerDocs } from '../../tools/k-labor/groups/docs.mjs';

process.env.LLG_ROOT = process.cwd(); // 도장 글꼴을 저장소 public/fonts 에서 읽는다
const WORDS = ['적법', '확률', '체불', '위법', '승소', '받을 수 있는 금액', '포괄', '지도'];
type Reg = { name: string; cfg: { title?: string; description?: string; inputSchema?: Record<string, { description?: string }> }; handler: (a: object) => Promise<{ content: { text: string }[] }> };
const tools: Reg[] = [];
registerDocs({ registerTool: (name: string, cfg: Reg['cfg'], handler: Reg['handler']) => tools.push({ name, cfg, handler }) });
const stamp = () => tools.find((t) => t.name === 'stamp_exhibit_pdf');
const call = async (a: object) => JSON.parse((await stamp()!.handler(a)).content[0].text);

const A4 = { x: 0, y: 0, width: 595.28, height: 841.89 };
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(0.01);

async function synthPdf(pages = 2, opts: { rotate?: number; size?: [number, number] } = {}) {
  const pdf = await PDFDocument.create();
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const p = pdf.addPage(opts.size ?? [595.28, 841.89]);
    p.drawText(`synthetic page ${i + 1}`, { x: 60, y: 700, size: 14, font: f });
    if (opts.rotate && i === 0) p.setRotation(degrees(opts.rotate));
  }
  return pdf.save();
}

// ── 결과 PDF 를 풀어 본다(G4 261124 — 「아무것도 안 그려도 통과」하던 시험을 실제 출력 대조로)
const streamText = (d: PDFDocument, ref: PDFRef) => {
  const s = d.context.lookup(ref);
  const bytes = s instanceof PDFRawStream ? decodePDFRawStream(s).decode() : (s as unknown as { getContents(): Uint8Array }).getContents();
  return Buffer.from(bytes).toString('latin1');
};
const contentRefs = (d: PDFDocument, i: number): PDFRef[] => {
  const c = d.getPage(i).node.Contents();
  return c instanceof PDFArray ? (c.asArray() as PDFRef[]) : [d.getPage(i).node.get(PDFName.of('Contents')) as PDFRef];
};
const pageText = (d: PDFDocument, i: number) => contentRefs(d, i).map((r) => streamText(d, r)).join('\n');
type Pt = [number, number];
/** 내용 스트림을 CTM 까지 따라가 칠한 경로마다 쪽 좌표 점 목록으로 돌려준다(S = 선, B = 채움+선) */
function paintedPaths(src: string) {
  const out: { op: string; pts: Pt[] }[] = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];
  let nums: number[] = [];
  let pts: Pt[] = [];
  const tf = (x: number, y: number): Pt => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]];
  for (const t of src.split(/\s+/).filter(Boolean)) {
    if (/^-?[\d.]+$/.test(t)) { nums.push(Number(t)); continue; }
    if (t === 'q') stack.push(ctm);
    else if (t === 'Q') ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (t === 'cm') {
      const [a, b, c, d, e, f] = nums.slice(-6);
      ctm = [a * ctm[0] + b * ctm[2], a * ctm[1] + b * ctm[3], c * ctm[0] + d * ctm[2], c * ctm[1] + d * ctm[3], e * ctm[0] + f * ctm[2] + ctm[4], e * ctm[1] + f * ctm[3] + ctm[5]];
    } else if (['m', 'l', 'c', 'v', 'y'].includes(t)) {
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push(tf(nums[i], nums[i + 1]));
    } else if (['S', 's', 'f', 'F', 'B', 'b', 'f*', 'B*', 'b*'].includes(t)) {
      out.push({ op: t, pts });
      pts = [];
    } else if (t === 'n') pts = [];
    nums = [];
  }
  return out;
}
const bbox = (pts: Pt[]) => ({ x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), y1: Math.max(...pts.map((p) => p[1])) });
/** 첫 장에 새로 붙은 도장 스트림(마지막 것)의 테두리와 글자 경로 */
const stampPaths = (d: PDFDocument) => {
  const refs = contentRefs(d, 0);
  const paths = paintedPaths(streamText(d, refs[refs.length - 1]));
  return { border: paths.find((p) => p.op === 'S')!, glyphs: paths.filter((p) => p.op === 'B') };
};
const fontEmbedded = (d: PDFDocument) =>
  d.context.enumerateIndirectObjects().some(([, o]) => o instanceof PDFDict && ['FontFile', 'FontFile2', 'FontFile3'].some((k) => o.has(PDFName.of(k))));
const withTmp = async (fn: (o: (n: string) => string) => Promise<void>) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exhibit-'));
  try {
    await fn((n) => path.join(dir, n));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};
const font = () => fontkit.create(fs.readFileSync(path.join(process.cwd(), 'public/fonts/NanumGothic-Regular.ttf')));

describe('호증 도장 배치', () => {
  it('세로형: 접두어·제 → 번호칸 → 호·증, 번호 없으면 번호칸 2칸이 빈다', () => {
    const l = stampLayout({ prefix: '사' });
    expect(l.glyphs.map((g) => g.ch)).toEqual(['사', '제', '호', '증']);
    expect(l.label).toBe('사 제__호증');
    const [, je, ho] = l.glyphs;
    // 제와 호 사이 = 빈 번호칸 2칸 + 반 칸씩
    const cell = je.cy - l.glyphs[0].cy;
    near(ho.cy - je.cy, cell * 3);
  });

  it('여러 글자 접두어(소갑)와 가지번호(의 1)', () => {
    const l = stampLayout({ prefix: '소갑', number: 9, sub: 1 });
    expect(l.glyphs.filter((g) => g.kind !== 'num').map((g) => g.ch)).toEqual(['소', '갑', '제', '호', '증', '의', '1']);
    expect(l.label).toBe('소갑 제9호증의 1');
    // 글자가 위에서 아래로 겹치지 않고 내려간다
    const ys = [...l.glyphs].sort((a, b) => a.cy - b.cy).map((g) => g.cy);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1]);
  });

  it('두 자리 번호는 한 자리보다 글자 높이가 작아진다(붙지 않게)', () => {
    const one = stampLayout({ number: 7 }).glyphs.find((g) => g.kind === 'num')!;
    const two = stampLayout({ number: 12 }).glyphs.filter((g) => g.kind === 'num');
    expect(two).toHaveLength(2);
    expect(two[0].boxH).toBeLessThan(one.boxH);
    expect(two[1].cy - two[0].cy).toBeGreaterThan(two[0].boxH);
  });

  it('A4 날인 사각형: 우측 12mm·위 8mm·10×50mm, 좌측은 왼쪽 12mm', () => {
    const r = stampRect(A4, 'right');
    near(r.width, 10 * MM);
    near(r.height, 50 * MM);
    near(A4.width - (r.x + r.width), 12 * MM);
    near(A4.height - (r.y + r.height), 8 * MM);
    near(stampRect(A4, 'left').x, 12 * MM);
  });

  it('보이는 상자 원점이 0 이 아니어도 그 상자 기준으로 잡는다', () => {
    const box = { x: 30, y: 40, width: 500, height: 700 };
    const r = stampRect(box, 'right');
    near(box.x + box.width - (r.x + r.width), 12 * MM);
    near(box.y + box.height - (r.y + r.height), 8 * MM);
  });

  it('작은 쪽(높이의 25% 초과)은 비례 축소', () => {
    const small = { x: 0, y: 0, width: 300, height: 400 };
    const r = stampRect(small, 'right');
    near(r.height, 100);
    near(r.width / r.height, 10 / 50);
  });

  it('여백 띠는 지정한 쪽으로 34mm 넓힌다', () => {
    near(paddedBox(A4, 'right').width, A4.width + BAND_MM * MM);
    expect(paddedBox(A4, 'right').x).toBe(0);
    near(paddedBox(A4, 'left').x, -BAND_MM * MM);
  });
});

describe('stamp_exhibit_pdf 도구', () => {
  it('docs 묶음에 등록되고, 글에 금지어·em dash 가 없다', () => {
    const t = stamp();
    expect(t).toBeDefined();
    const schema = Object.values(t!.cfg.inputSchema ?? {}).map((v) => v.description ?? '').join('\n');
    const all = `${t!.cfg.title}\n${t!.cfg.description}\n${schema}`;
    expect(bannedHits(all, WORDS)).toEqual([]);
    expect(all).not.toContain('—');
  });

  it('첫 장에만 그리고, 쪽 수·2쪽 내용은 그대로, 글꼴을 넣지 않아 작다, 덮어쓰지 않는다', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exhibit-'));
    try {
      const src = path.join(dir, 'in.pdf');
      const input = await synthPdf(2);
      fs.writeFileSync(src, input);
      const out = path.join(dir, 'out.pdf');
      const r = await call({ file: src, outFile: out, prefix: '사', number: 19 });
      expect(r.ok).toBe(true);
      expect(r).toMatchObject({ label: '사 제19호증', side: 'right', padded: false, pages: 2, overlapChecked: false });
      expect(r.notice).toMatch(/눈으로/);
      const outBytes = fs.readFileSync(out);
      expect(outBytes.length - input.length).toBeLessThan(8_000);
      const a = await PDFDocument.load(input);
      const b = await PDFDocument.load(outBytes);
      expect(b.getPageCount()).toBe(2);
      // 2쪽은 참조 번호가 아니라 풀어 낸 내용 바이트까지 같다
      expect(pageText(b, 1)).toBe(pageText(a, 1));
      expect(contentRefs(b, 1)).toHaveLength(contentRefs(a, 1).length);
      expect(fontEmbedded(b)).toBe(false);
      // 1쪽에 실제로 그렸다: 테두리 = 날인 사각형, 글자 5개(사·제·호·증·1·9 중 번호 2) 모두 그 안
      const rect = stampRect(b.getPage(0).getCropBox(), 'right');
      const { border, glyphs } = stampPaths(b);
      const bb = bbox(border.pts);
      expect(bb.x0).toBeGreaterThan(rect.x - 0.01);
      expect(bb.x1).toBeLessThan(rect.x + rect.width + 0.01);
      expect(bb.y1).toBeLessThan(rect.y + rect.height + 0.01);
      expect(rect.y + rect.height - bb.y1).toBeLessThan(1);
      expect(glyphs).toHaveLength(6);
      for (const g of glyphs) {
        const gb = bbox(g.pts);
        expect(gb.x0).toBeGreaterThan(rect.x);
        expect(gb.x1).toBeLessThan(rect.x + rect.width);
        expect(gb.y0).toBeGreaterThan(rect.y);
        expect(gb.y1).toBeLessThan(rect.y + rect.height);
      }
      // 위에서 아래로: 사(첫 글자)가 증(넷째)보다 위
      expect(bbox(glyphs[0].pts).y0).toBeGreaterThan(bbox(glyphs[3].pts).y1);
      expect(bannedHits(JSON.stringify(r), WORDS)).toEqual([]);
      const again = await call({ file: src, outFile: out, prefix: '사', number: 19 });
      expect(again.ok).toBe(false);
      expect(fs.readFileSync(out).equals(outBytes)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('pad=always 면 첫 장만 34mm 넓어지고, 왼쪽도 된다', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exhibit-'));
    try {
      const src = path.join(dir, 'in.pdf');
      fs.writeFileSync(src, await synthPdf(2));
      for (const side of ['right', 'left'] as const) {
        const out = path.join(dir, `pad-${side}.pdf`);
        const r = await call({ file: src, outFile: out, prefix: '갑', number: 3, side, pad: 'always' });
        expect(r).toMatchObject({ ok: true, padded: true, side });
        const d = await PDFDocument.load(fs.readFileSync(out));
        near(d.getPage(0).getCropBox().width, 595.28 + BAND_MM * MM);
        near(d.getPage(1).getCropBox().width, 595.28);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('멈추는 경우: 같은 경로·없는 파일·PDF 아님·회전된 첫 장·글꼴에 없는 접두어·가지번호만·주민번호 모양', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exhibit-'));
    try {
      const src = path.join(dir, 'in.pdf');
      fs.writeFileSync(src, await synthPdf(1));
      const o = (n: string) => path.join(dir, n);
      expect((await call({ file: src, outFile: src })).error).toMatch(/원본|덮어쓰지/);
      expect((await call({ file: o('없음.pdf'), outFile: o('a.pdf') })).error).toMatch(/없습니다/);
      fs.writeFileSync(o('txt.pdf'), 'not a pdf');
      expect((await call({ file: o('txt.pdf'), outFile: o('b.pdf') })).error).toMatch(/PDF 파일이 아닙니다/);
      const rot = o('rot.pdf');
      fs.writeFileSync(rot, await synthPdf(1, { rotate: 90 }));
      const rr = await call({ file: rot, outFile: o('c.pdf') });
      expect(rr.ok).toBe(false);
      expect(rr.error).toMatch(/90도/);
      const bad = await call({ file: src, outFile: o('d.pdf'), prefix: '𠀀' });
      expect(bad.error).toMatch(/글꼴에 없는 글자/);
      expect((await call({ file: src, outFile: o('e.pdf'), sub: 1 })).error).toMatch(/가지번호/);
      expect((await call({ file: src, outFile: o('900101-1234567.pdf') })).error).toMatch(/주민등록번호/);
      for (const n of ['a', 'b', 'c', 'd', 'e']) expect(fs.existsSync(o(`${n}.pdf`))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// G4(261124) 적대 리뷰 1~9 — 페이블·오푸스·아스트라가 합성 PDF 로 재현한 경계 입력
describe('stamp_exhibit_pdf 경계 입력(G4)', () => {
  /** 1쪽을 원하는 모양으로 만든 합성 PDF */
  async function shaped(edit: (pdf: PDFDocument) => void, pages = 1, opts: { save?: { useObjectStreams?: boolean } } = {}) {
    const pdf = await PDFDocument.create();
    const f = await pdf.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < pages; i++) pdf.addPage([595.28, 841.89]).drawText(`synthetic page ${i + 1}`, { x: 60, y: 700, size: 14, font: f });
    edit(pdf);
    return pdf.save(opts.save);
  }

  it('① pad: 잘라 두었던 영역이 새 여백에 드러나지 않게 원본 내용을 옛 보이는 상자로 자른다', async () => {
    await withTmp(async (o) => {
      // 보이는 상자(CropBox) x 50~490, 그 밖 x 500~590 에 검은 사각형(잘라서 숨긴 내용)
      const input = await shaped((pdf) => {
        const p = pdf.getPage(0);
        p.drawRectangle({ x: 500, y: 600, width: 90, height: 230 });
        p.setCropBox(50, 0, 440, 841.89);
        p.node.set(PDFName.of('TrimBox'), pdf.context.obj([50, 0, 490, 841.89]));
      });
      fs.writeFileSync(o('in.pdf'), input);
      for (const side of ['right', 'left'] as const) {
        const r = await call({ file: o('in.pdf'), outFile: o(`pad-${side}.pdf`), side, pad: 'always', number: 2 });
        expect(r).toMatchObject({ ok: true, padded: true });
        const d = await PDFDocument.load(fs.readFileSync(o(`pad-${side}.pdf`)));
        const p = d.getPage(0);
        const want = paddedBox({ x: 50, y: 0, width: 440, height: 841.89 }, side);
        for (const b of [p.getCropBox(), p.getMediaBox()]) {
          near(b.x, want.x);
          near(b.width, want.width);
        }
        expect(p.node.has(PDFName.of('TrimBox'))).toBe(false);
        // 맨 앞 스트림이 옛 보이는 상자로 자르는 경로(re W n)다
        const first = streamText(d, contentRefs(d, 0)[0]);
        expect(first).toMatch(/50 0 440 841\.89 re\s+W\s+n/);
        // 도장은 새 여백 안(옛 보이는 상자 밖)
        const bb = bbox(stampPaths(d).border.pts);
        if (side === 'right') expect(bb.x0).toBeGreaterThan(490);
        else expect(bb.x1).toBeLessThan(50);
      }
    });
  });

  it('② 여러 쪽이 내용 목록을 함께 쓰는 PDF 도 2쪽에는 찍히지 않는다', async () => {
    await withTmp(async (o) => {
      const input = await shaped((pdf) => {
        const sref = pdf.context.register(pdf.context.flateStream('0 0 m 100 100 l S'));
        const arr = pdf.context.register(pdf.context.obj([sref]));
        for (const p of pdf.getPages()) p.node.set(PDFName.of('Contents'), arr);
      }, 2);
      fs.writeFileSync(o('in.pdf'), input);
      expect((await call({ file: o('in.pdf'), outFile: o('out.pdf'), number: 4 })).ok).toBe(true);
      const a = await PDFDocument.load(input);
      const b = await PDFDocument.load(fs.readFileSync(o('out.pdf')));
      expect(pageText(b, 1)).toBe(pageText(a, 1));
      expect(contentRefs(b, 1)).toHaveLength(1);
      expect(stampPaths(b).glyphs.length).toBeGreaterThan(0);
    });
  });

  it('③ 확대 배율(UserUnit)·도장이 안 들어가는 작은 쪽은 멈추고, 뒤집힌 상자·쪽보다 큰 CropBox 는 바로잡아 찍는다', async () => {
    await withTmp(async (o) => {
      const cases: [string, (pdf: PDFDocument) => void][] = [
        ['unit', (pdf) => pdf.getPage(0).node.set(PDFName.of('UserUnit'), PDFNumber.of(2))],
        ['narrow', (pdf) => pdf.getPage(0).setSize(30, 400)],
        ['low', (pdf) => pdf.getPage(0).setSize(400, 20)],
      ];
      for (const [n, edit] of cases) {
        fs.writeFileSync(o(`${n}.pdf`), await shaped(edit));
        const r = await call({ file: o(`${n}.pdf`), outFile: o(`${n}-out.pdf`) });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(n === 'unit' ? /배율/ : /작아/);
        expect(fs.existsSync(o(`${n}-out.pdf`))).toBe(false);
      }
      fs.writeFileSync(o('inv.pdf'), await shaped((pdf) => pdf.getPage(0).node.set(PDFName.of('MediaBox'), pdf.context.obj([0, 841.89, 595.28, 0]))));
      const inv = await call({ file: o('inv.pdf'), outFile: o('inv-out.pdf'), number: 1 });
      expect(inv.ok).toBe(true);
      near(inv.firstPageMm.height, 297);
      const ib = bbox(stampPaths(await PDFDocument.load(fs.readFileSync(o('inv-out.pdf')))).border.pts);
      near(595.28 - ib.x1, (12 + 0.225) * MM); // 오른쪽 12mm + 테두리 두께(0.45mm)의 절반
      expect(ib.y1).toBeLessThan(841.89);
      expect(ib.y0).toBeGreaterThan(0);
      fs.writeFileSync(o('big.pdf'), await shaped((pdf) => pdf.getPage(0).setCropBox(-100, -100, 895.28, 1141.89)));
      const big = await call({ file: o('big.pdf'), outFile: o('big-out.pdf'), number: 1 });
      expect(big.ok).toBe(true);
      near(big.firstPageMm.width, 210);
      const bb = bbox(stampPaths(await PDFDocument.load(fs.readFileSync(o('big-out.pdf')))).border.pts);
      expect(bb.x1).toBeLessThan(595.28);
      expect(bb.y1).toBeLessThan(841.89);
    });
  });

  it('④ 전자서명 값이 있는 PDF 는 멈추고, 빈 서명란만 있는 양식은 찍는다', async () => {
    await withTmp(async (o) => {
      const withSig = (signed: boolean) => (pdf: PDFDocument) => {
        const field: Record<string, unknown> = { FT: 'Sig', T: PDFString.of('sig1') };
        if (signed) field.V = pdf.context.register(pdf.context.obj({ Type: 'Sig', Filter: 'Adobe.PPKLite', ByteRange: [0, 10, 20, 30], Contents: PDFHexString.of('00') }));
        const fref = pdf.context.register(pdf.context.obj(field as never));
        pdf.catalog.set(PDFName.of('AcroForm'), pdf.context.register(pdf.context.obj({ Fields: [fref], SigFlags: signed ? 3 : 0 })));
      };
      fs.writeFileSync(o('signed.pdf'), await shaped(withSig(true)));
      const s = await call({ file: o('signed.pdf'), outFile: o('s-out.pdf') });
      expect(s.ok).toBe(false);
      expect(s.error).toMatch(/전자서명/);
      fs.writeFileSync(o('blank.pdf'), await shaped(withSig(false)));
      expect((await call({ file: o('blank.pdf'), outFile: o('b-out.pdf') })).ok).toBe(true);
    });
  });

  it('⑤ 객체 압축을 쓴 300쪽 PDF 도 거의 커지지 않는다(다시 풀어 쓰지 않는다)', async () => {
    await withTmp(async (o) => {
      const input = await synthPdf(300);
      fs.writeFileSync(o('in.pdf'), input);
      const r = await call({ file: o('in.pdf'), outFile: o('out.pdf'), number: 300 });
      expect(r.ok).toBe(true);
      expect(r.file.bytes - input.length).toBeLessThan(10_000);
    });
  });

  it('⑥ 빈칸이 든 접두어는 한국어로 멈추고, 풀어 쓴 자모(사)는 합쳐 찍는다', async () => {
    await withTmp(async (o) => {
      fs.writeFileSync(o('in.pdf'), await synthPdf(1));
      for (const [i, prefix] of ['소 갑', '\t', '갑　'].entries()) {
        const r = await call({ file: o('in.pdf'), outFile: o(`w${i}.pdf`), prefix });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/빈칸/);
      }
      const r = await call({ file: o('in.pdf'), outFile: o('nfc.pdf'), prefix: '사', number: 7 });
      expect(r).toMatchObject({ ok: true, label: '사 제7호증' });
    });
  });

  it('⑦ 망가진 PDF·암호 PDF 는 라이브러리 영어 오류 대신 정해진 한국어로 멈춘다', async () => {
    await withTmp(async (o) => {
      fs.writeFileSync(o('cut.pdf'), '%PDF-');
      const cut = await call({ file: o('cut.pdf'), outFile: o('c-out.pdf') });
      expect(cut.ok).toBe(false);
      expect(cut.error).toMatch(/읽지 못했습니다/);
      expect(cut.error).not.toMatch(/[A-Za-z]{5,}/);
      const enc = await shaped((pdf) => {
        pdf.context.trailerInfo.Encrypt = pdf.context.register(pdf.context.obj({ Filter: 'Standard', V: 1, R: 2 }));
      });
      fs.writeFileSync(o('enc.pdf'), enc);
      const e = await call({ file: o('enc.pdf'), outFile: o('e-out.pdf') });
      expect(e.ok).toBe(false);
      expect(e.error).toMatch(/암호/);
      expect(fs.existsSync(o('c-out.pdf')) || fs.existsSync(o('e-out.pdf'))).toBe(false);
    });
  });

  it('⑨ 한 도장 안의 글자는 한 크기(머리·꼬리 글자 한 배율, 숫자 한 배율)', () => {
    const f = font();
    const rect = stampRect(A4, 'right');
    for (const prefix of ['노', '사', '소갑']) {
      const plan = planStamp(f, stampLayout({ prefix, number: 19, sub: 2 }), rect);
      const words = new Set(plan.glyphs.filter((g: { kind: string }) => g.kind !== 'num').map((g: { s: number }) => g.s.toFixed(6)));
      const nums = new Set(plan.glyphs.filter((g: { kind: string }) => g.kind === 'num').map((g: { s: number }) => g.s.toFixed(6)));
      expect(words.size).toBe(1);
      expect(nums.size).toBe(1);
    }
  });
});
