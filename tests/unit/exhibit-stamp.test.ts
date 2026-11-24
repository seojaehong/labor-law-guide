// 호증 날인(stamp_exhibit_pdf) — 배치 계산·날인 사각형·도구 입출력. 합성 PDF 만 쓴다(실제 서증 아님).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import { bannedHits } from '@/lib/tool-kit/banned';
import { MM, BAND_MM, paddedBox, stampLayout, stampRect } from '../../tools/k-labor/lib/exhibit-stamp.mjs';
import { registerDocs } from '../../tools/k-labor/groups/docs.mjs';

process.env.LLG_ROOT = process.cwd(); // 도장 글꼴을 저장소 public/fonts 에서 읽는다
const WORDS = ['노무사', '상담', '자문', '진단', '판정', '적법', '확률', '체불', '위법', '승소', '받을 수 있는 금액', '포괄', '대신', '대행', '대리', '지도'];
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
      expect(outBytes.length - input.length).toBeLessThan(30_000);
      const a = await PDFDocument.load(input);
      const b = await PDFDocument.load(outBytes);
      expect(b.getPageCount()).toBe(2);
      const ops = (d: PDFDocument, i: number) => d.getPage(i).node.Contents()!.toString();
      expect(ops(b, 1)).toBe(ops(a, 1));
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
      expect((await call({ file: src, outFile: src })).ok).toBe(false);
      expect((await call({ file: o('없음.pdf'), outFile: o('a.pdf') })).ok).toBe(false);
      fs.writeFileSync(o('txt.pdf'), 'not a pdf');
      expect((await call({ file: o('txt.pdf'), outFile: o('b.pdf') })).ok).toBe(false);
      const rot = o('rot.pdf');
      fs.writeFileSync(rot, await synthPdf(1, { rotate: 90 }));
      const rr = await call({ file: rot, outFile: o('c.pdf') });
      expect(rr.ok).toBe(false);
      expect(rr.error).toMatch(/90도/);
      const bad = await call({ file: src, outFile: o('d.pdf'), prefix: '𠀀' });
      expect(bad.ok).toBe(false);
      expect((await call({ file: src, outFile: o('e.pdf'), sub: 1 })).ok).toBe(false);
      expect((await call({ file: src, outFile: o('900101-1234567.pdf') })).ok).toBe(false);
      for (const n of ['a', 'b', 'c', 'd', 'e']) expect(fs.existsSync(o(`${n}.pdf`))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
