import { describe, expect, it, beforeAll } from 'vitest';
import { pathToFileURL } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { readPdfText, MAX_PDF_PAGES } from '@/lib/laws/pdf-read';

// node 에서는 legacy 빌드를 써야 한다 — 기본 빌드는 DOMMatrix 같은 브라우저 API 를 찾는다.
// 운영(브라우저)은 기본 빌드를 그대로 쓰고, 여기서는 읽는 로직만 같은 코드로 확인한다.
const legacy = () => import('pdfjs-dist/legacy/build/pdf.mjs') as never;
const WORKER = pathToFileURL('node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs').href;

const makePdf = async (lines: string[], pages = 1) => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let p = 0; p < pages; p++) {
    const page = doc.addPage([420, 300]);
    let y = 260;
    for (const l of lines) { page.drawText(l, { x: 30, y, size: 11, font }); y -= 22; }
  }
  return await doc.save();
};

describe('pdf 본문 읽기', () => {
  let pdf: Uint8Array;
  beforeAll(async () => {
    pdf = await makePdf(['Article 1 (Purpose) duties.', 'Article 46 (Family Event Leave)', '20 days paid spouse leave.']);
  });

  it('글자 레이어를 줄 단위로 뽑는다', async () => {
    const text = await readPdfText(pdf, WORKER, legacy);
    expect(text).toContain('Article 1 (Purpose)');
    expect(text).toContain('Article 46 (Family Event Leave)');
    // 조문 머리가 줄 처음에 와야 splitArticles 가 읽는다
    expect(text.split('\n').some(l => l.startsWith('Article 46'))).toBe(true);
  });

  it('PDF 가 아니면 형식부터 막는다 — 파일을 열어 보지 않는다', async () => {
    await expect(readPdfText(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]), WORKER, legacy))
      .rejects.toThrow('PDF 파일 형식이 아닙니다');
  });

  it('10MB 를 넘으면 읽지 않는다', async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set([0x25, 0x50, 0x44, 0x46]);
    await expect(readPdfText(big, WORKER, legacy)).rejects.toThrow('10MB');
  });

  it('쪽이 너무 많으면 멈추고 쪽 수를 말한다', async () => {
    const many = await makePdf(['x'], MAX_PDF_PAGES + 1);
    await expect(readPdfText(many, WORKER, legacy)).rejects.toThrow(`${MAX_PDF_PAGES}쪽 이하`);
  });

  it('글자가 없는 문서는 추측하지 않고 붙여넣으라고 한다', async () => {
    const blank = await (await PDFDocument.create().then(async d => { d.addPage([200, 200]); return d; })).save();
    await expect(readPdfText(blank, WORKER, legacy)).rejects.toThrow(/읽을 수 있는 글자가 없습니다|붙여넣/);
  });

  it('깨진 파일은 내부 오류를 그대로 내보내지 않는다', async () => {
    const broken = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x00, 0x01]);
    await expect(readPdfText(broken, WORKER, legacy)).rejects.toThrow('PDF 본문을 읽지 못했습니다');
  });
});

describe('읽은 글이 조문 분리로 이어진다', () => {
  it('splitArticles 가 조문을 집는다', async () => {
    const { splitArticles } = await import('@/lib/laws/standard-check');
    const pdf = await makePdf(['Article 1 (Purpose) duties.', 'Article 46 (Leave)']);
    const text = (await readPdfText(pdf, WORKER, legacy)).replace(/Article (\d+) \(/g, '제$1조(');
    expect(splitArticles(text).map(a => a.no)).toEqual(['제1조', '제46조']);
  });
});
