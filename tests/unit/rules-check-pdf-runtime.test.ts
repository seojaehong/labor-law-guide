import { describe, expect, it, vi } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { readFileSync } from 'node:fs';
import { readRulesFile } from '@/app/laws/RulesCheck';

// Real pdf.js parsing, without DOM rendering, OCR, or any provider request.
vi.mock('@/lib/rules-review/pdf-browser', () => ({
  loadPdfLib: async () => import('pdfjs-dist/legacy/build/pdf.mjs'),
}));

async function pdf(pages: string[]) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of pages) {
    const page = doc.addPage();
    if (text) page.drawText(text, { font, size: 12 });
  }
  return new File([new Uint8Array(await doc.save())], 'synthetic.pdf', { type: 'application/pdf' });
}

describe('rules PDF real parser boundary', () => {
  const body = '1234567890 1234567890 1234567890';
  it('reads a text PDF and never offers original-file application', async () => {
    const result = await readRulesFile(await pdf([body]));
    expect(result.text).toContain('1234567890');
    expect(result.source).toBeNull();
    expect(result.rulesOnly).toBe(true);
  });
  it.each([['short cover', '12345'], ['blank page', '']])('rejects %s rather than silently dropping it', async (_, cover) => {
    await expect(readRulesFile(await pdf([cover, body]))).rejects.toThrow('일부만 점검하지 않습니다');
  });
  it('rejects a mixed text and image PDF without OCR', async () => {
    const file = new File([readFileSync('tests/fixtures/laws/sample-rules.pdf')], 'synthetic-mixed.pdf');
    await expect(readRulesFile(file)).rejects.toThrow('기존 입력은 유지됩니다');
  });
});
