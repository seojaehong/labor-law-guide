import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { makeProbePptx } from '@/lib/office/pptx/probe';

describe('office pptx probe (pptxgenjs 번들 스파이크)', () => {
  it('빈 1장 덱을 zip 바이트로 만든다', async () => {
    const bytes = await makeProbePptx();
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes[0]).toBe(0x50); // P
    expect(bytes[1]).toBe(0x4b); // K
    const zip = await JSZip.loadAsync(bytes);
    expect(zip.file('ppt/slides/slide1.xml')).not.toBeNull();
    expect(zip.file('ppt/slides/slide2.xml')).toBeNull();
  });
});
