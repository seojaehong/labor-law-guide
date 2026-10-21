// 브라우저 안 한글 문서 열기·쪽 그리기·찾아 바꾸기·저장. 엔진 = rhwp(MIT) WASM.
// 원본 바이트는 건드리지 않는다. 되돌리기는 원본에서 바꾸기 기록을 다시 적용해 만든다.
import type { InitInput } from '@rhwp/core';
import { loadRhwp, RHWP_WASM_URL } from '@/lib/laws/hwp-read';
import { indexParagraphs, paraOps, type IndexedPara, type ParaOps } from './para-index';

export const MAX_EDIT_BYTES = 20 * 1024 * 1024;
export type HwpKind = 'hwp' | 'hwpx';
export type Replacement = { find: string; replace: string; caseSensitive: boolean };

const CFB = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** 머리 바이트로 형식을 가린다. 확장자는 믿지 않는다 */
export function sniffKind(bytes: Uint8Array): HwpKind | null {
  if (CFB.every((b, i) => bytes[i] === b)) return 'hwp';
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return 'hwpx';
  return null;
}

/** hwp 안에 ViewText 저장소가 있으면 변경 내용 추적 또는 배포용 문서다.
 *  rhwp 0.8.7 은 이 기록을 다시 쓰지 못해 저장본을 한글이 거부한다(이음오피스 tracked-changes.ts 주석·판정) — 저장을 막는다 */
export function hasViewText(bytes: Uint8Array): boolean {
  if (sniffKind(bytes) !== 'hwp') return false;
  const needle = [...'ViewText'].flatMap((c) => [c.charCodeAt(0), 0]); // CFB 디렉터리 이름은 UTF-16LE
  outer: for (let i = 0; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

type Engine = Awaited<ReturnType<typeof loadRhwp>>;
type Doc = InstanceType<Engine['HwpDocument']>;

export class HwpEditDoc {
  private constructor(private doc: Doc, readonly kind: HwpKind, readonly saveBlocked: boolean) {}

  static async open(data: ArrayBuffer | Uint8Array, wasm: InitInput = RHWP_WASM_URL): Promise<HwpEditDoc> {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (bytes.byteLength > MAX_EDIT_BYTES) throw new Error('파일은 20MB 이하만 엽니다');
    const kind = sniffKind(bytes);
    if (!kind) throw new Error('한글(hwp·hwpx) 파일 형식이 아닙니다');
    const { HwpDocument } = await loadRhwp(wasm);
    try {
      return new HwpEditDoc(new HwpDocument(bytes), kind, hasViewText(bytes));
    } catch {
      throw new Error('문서를 열지 못했습니다. 암호가 걸렸거나 손상된 파일일 수 있습니다');
    }
  }

  /** 원본에서 바꾸기 기록을 차례로 다시 적용한 새 문서. 실행 취소에 쓴다 */
  static async replay(original: ArrayBuffer | Uint8Array, steps: Replacement[], wasm: InitInput = RHWP_WASM_URL) {
    const doc = await HwpEditDoc.open(original, wasm);
    const counts = steps.map((s) => doc.replaceAll(s));
    return { doc, counts };
  }

  get pageCount(): number { return this.doc.pageCount(); }
  pageSvg(page: number): string { return this.doc.renderPageSvg(page); }

  text(): string {
    const raw = this.doc.getTextFileText();
    return raw.startsWith('"') ? JSON.parse(raw) : raw;
  }

  /** 바꾼 개수를 돌려준다. 빈 검색어는 거부한다 */
  replaceAll({ find, replace, caseSensitive }: Replacement): number {
    if (!find) throw new Error('찾을 글자를 넣으세요');
    const res = JSON.parse(this.doc.replaceAll(find, replace, caseSensitive)) as { ok?: boolean; count?: number; error?: string };
    if (res.ok === false) throw new Error(res.error || '바꾸지 못했습니다');
    return res.count ?? 0;
  }

  export(kind: HwpKind): Uint8Array {
    if (this.saveBlocked) throw new Error('변경 내용 추적 또는 배포용 문서는 저장할 수 없습니다. 보기와 글자 복사만 됩니다');
    return kind === 'hwp' ? this.doc.exportHwp() : this.doc.exportHwpx();
  }

  /** 저장 + 손실 보고. 손실(count)이 있으면 저장본에서 빠진 내용이 있다는 뜻이다 */
  exportWithReport(kind: HwpKind): { bytes: Uint8Array; loss: number } {
    if (this.saveBlocked) throw new Error('변경 내용 추적 또는 배포용 문서는 저장할 수 없습니다. 보기와 글자 복사만 됩니다');
    const r = kind === 'hwp' ? this.doc.exportHwpWithReport() : this.doc.exportHwpxWithReport();
    try {
      const loss = (JSON.parse(r.contentLoss()) as { count?: number }).count ?? 0;
      return { bytes: r.takeBytes(), loss };
    } finally {
      r.free();
    }
  }

  /** 모든 구역의 본문 문단과 표 셀(중첩 포함) 문단 — 문서 순서. text() 는 표 셀 글자를 빠뜨릴 수 있다 */
  paragraphs(): IndexedPara[] { return indexParagraphs(this.doc); }

  /** 문단 좌표로 글자를 고치는 함수 묶음. 여러 번 고칠 때는 batch 로 감싸 쪽 다시 나누기를 한 번만 한다 */
  ops(): ParaOps { return paraOps(this.doc); }

  batch<T>(fn: () => T): T {
    this.doc.beginBatch();
    try { return fn(); } finally { this.doc.endBatch(); }
  }

  free() { this.doc.free(); }
}

/** 내려받을 파일 이름: 원래 이름 + _수정 + 형식 확장자 */
export function editedName(name: string, kind: HwpKind): string {
  const base = name.replace(/\.(hwpx?|HWPX?)$/, '') || '문서';
  return `${base}_수정.${kind}`;
}
