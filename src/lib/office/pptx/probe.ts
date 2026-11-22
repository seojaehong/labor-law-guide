// pptxgenjs 번들 스파이크 — 빈 1장 덱을 바이트로 만든다. fs·네트워크 없음.
// k-labor dist(esbuild 번들)에서 pptxgenjs 가 도는지 확인하려고 둔 가장 작은 진입점이다.
import PptxGenJS from 'pptxgenjs';

export async function makeProbePptx(): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  pptx.addSlide();
  const out = await pptx.write({ outputType: 'arraybuffer' });
  return new Uint8Array(out as ArrayBuffer);
}
