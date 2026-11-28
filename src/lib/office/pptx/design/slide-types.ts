// 부품 그리기에 필요한 만큼만 적은 슬라이드 모양 — 라이브러리(pptxgenjs) 타입을 묶음 타입 선언에 드러내지 않으려고 따로 둔다.
export type DeckShapeName = 'rect' | 'roundRect' | 'ellipse' | 'line' | 'triangle';
export interface DeckPptx {
  ShapeType: Record<DeckShapeName, unknown>;
}
export interface DeckSlide {
  background?: unknown;
  addText(text: unknown, options: Record<string, unknown>): unknown;
  addShape(shape: unknown, options: Record<string, unknown>): unknown;
  addTable(rows: unknown, options: Record<string, unknown>): unknown;
}
