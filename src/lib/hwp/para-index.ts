// 한글 문서 문단 색인 — 모든 구역의 본문 문단과 표 셀(중첩 셀 포함) 문단을 문서 순서대로 훑어 { text, loc } 목록을 낸다.
// rhwp 0.8.7 의 getTextFileText 는 둘째 구역부터 표 셀 글자를 내지 않는다(본문이 표 안에 든 실제 취업규칙에서 118자만 나왔다).
// 좌표(loc)로 글자를 읽고 고치는 함수도 여기 둔다. 본문 문단과 셀 문단은 API 가 다르므로 한곳에서 갈라 준다.
import type { HwpDocument } from '@rhwp/core';

/** 셀 경로 한 칸: 바깥 문단의 controlIndex 번째 표 → cellIndex 번째 셀 → 그 셀의 cellParaIndex 번째 문단 */
export interface CellStep {
  controlIndex: number;
  cellIndex: number;
  cellParaIndex: number;
}

/** 문단 좌표. path 가 비면 본문 문단(section·para), 있으면 본문 문단 para 안의 표 셀 문단 */
export interface ParaLoc {
  section: number;
  para: number;
  path: CellStep[];
}

export interface IndexedPara {
  text: string;
  loc: ParaLoc;
  /** 문단 안 컨트롤(표·그림·구역 정의 등) 수. 0 이 아니면 글자 위치가 컨트롤과 섞일 수 있어 고치지 않는다 */
  controls: number;
}

type Doc = Pick<HwpDocument,
  | 'getSectionCount' | 'getParagraphCount' | 'getParagraphLength' | 'getTextRange' | 'getControlTextPositions'
  | 'getTableDimensions' | 'getTableDimensionsByPath' | 'getCellParagraphCountByPath' | 'getCellParagraphLengthByPath'
  | 'getTextInCellByPath'>;

const json = (path: CellStep[]) => JSON.stringify(path);
/** 경로 마지막 칸의 문단 번호만 바꾼다 */
export const withPara = (path: CellStep[], k: number): CellStep[] => path.map((e, i) => (i === path.length - 1 ? { ...e, cellParaIndex: k } : e));
/** 같은 목록(본문 구역 또는 같은 셀)의 다음 문단 */
export const nextLoc = (loc: ParaLoc): ParaLoc =>
  loc.path.length ? { ...loc, path: withPara(loc.path, loc.path[loc.path.length - 1].cellParaIndex + 1) } : { ...loc, para: loc.para + 1 };
/** 문단이 든 목록의 열쇠 — 같은 열쇠끼리만 문단을 합치거나 나눈다 */
export const listKey = (loc: ParaLoc): string =>
  loc.path.length ? `${loc.section}:${loc.para}:${json(withPara(loc.path, -1))}` : `${loc.section}`;

type Table = { controlIndex: number; cells: number };

/** 본문 문단의 표. 컨트롤 수만큼 표인지 물어본다 */
function bodyTables(d: Doc, s: number, p: number): { tables: Table[]; controls: number } {
  const controls = (JSON.parse(d.getControlTextPositions(s, p)) as number[]).length;
  const tables: Table[] = [];
  for (let ci = 0; ci < controls; ci++) {
    try {
      tables.push({ controlIndex: ci, cells: (JSON.parse(d.getTableDimensions(s, p, ci)) as { cellCount: number }).cellCount });
    } catch { /* 표가 아닌 컨트롤(구역 정의·그림 등) */ }
  }
  return { tables, controls };
}

/** 셀 문단 안의 중첩 표. 셀 문단의 컨트롤 수를 바로 묻는 API 가 없어 번호를 올려 가며 묻고, 「범위 초과」에서 멈춘다 */
const MAX_CELL_CONTROLS = 64;
function cellTables(d: Doc, s: number, p: number, path: CellStep[]): { tables: Table[]; controls: number } {
  const tables: Table[] = [];
  let controls = 0;
  for (let ci = 0; ci < MAX_CELL_CONTROLS; ci++) {
    try {
      const dim = JSON.parse(d.getTableDimensionsByPath(s, p, json([...path, { controlIndex: ci, cellIndex: 0, cellParaIndex: 0 }]))) as { cellCount: number };
      tables.push({ controlIndex: ci, cells: dim.cellCount });
      controls++;
    } catch (e) {
      if (!/범위\s*초과/.test(String(e))) { controls++; continue; } // 표가 아닌 컨트롤 — 다음 번호를 본다
      break;
    }
  }
  return { tables, controls };
}

export function indexParagraphs(d: Doc): IndexedPara[] {
  const out: IndexedPara[] = [];
  const walkCell = (s: number, p: number, cell: CellStep[]) => {
    const n = d.getCellParagraphCountByPath(s, p, json(cell));
    for (let k = 0; k < n; k++) {
      const path = withPara(cell, k);
      const len = d.getCellParagraphLengthByPath(s, p, json(path));
      const { tables, controls } = cellTables(d, s, p, path);
      out.push({ text: len ? d.getTextInCellByPath(s, p, json(path), 0, len) : '', loc: { section: s, para: p, path }, controls });
      for (const t of tables) for (let c = 0; c < t.cells; c++) walkCell(s, p, [...path, { controlIndex: t.controlIndex, cellIndex: c, cellParaIndex: 0 }]);
    }
  };
  for (let s = 0; s < d.getSectionCount(); s++) {
    for (let p = 0; p < d.getParagraphCount(s); p++) {
      const n = d.getParagraphLength(s, p);
      const { tables, controls } = bodyTables(d, s, p);
      out.push({ text: n ? d.getTextRange(s, p, 0, n) : '', loc: { section: s, para: p, path: [] }, controls });
      for (const t of tables) for (let c = 0; c < t.cells; c++) walkCell(s, p, [{ controlIndex: t.controlIndex, cellIndex: c, cellParaIndex: 0 }]);
    }
  }
  return out;
}

/** 색인 → 점검용 글자. 문단 안 줄바꿈도 줄로 나누고 빈 줄은 버린다(hwpx 경로 doc-io 의 paras() 와 같은 모양) */
export function indexText(index: IndexedPara[]): string {
  return index.flatMap((e) => e.text.split(/\r\n|\r|\n/)).map((l) => l.trim()).filter(Boolean).join('\n');
}

type EditDoc = Doc & Pick<HwpDocument,
  | 'insertText' | 'insertTextInCellByPath' | 'deleteText' | 'deleteTextInCellByPath' | 'splitParagraph' | 'splitParagraphInCellByPath'
  | 'mergeParagraph' | 'mergeParagraphInCellByPath' | 'getCharPropertiesAt' | 'getCellCharPropertiesAtByPath'
  | 'setCharShapeId' | 'setCharShapeIdInCellByPath'>;

const ok = (res: string) => {
  const r = JSON.parse(res) as { ok?: boolean; error?: string };
  if (r.ok === false) throw new Error(r.error || '문서를 고치지 못했습니다');
};

/** 좌표 하나로 본문·셀 문단을 같은 모양으로 읽고 고친다 */
export function paraOps(d: EditDoc) {
  const cell = (loc: ParaLoc) => [loc.section, loc.para, json(loc.path)] as const;
  const ops = {
    length: (loc: ParaLoc) => (loc.path.length ? d.getCellParagraphLengthByPath(...cell(loc)) : d.getParagraphLength(loc.section, loc.para)),
    text(loc: ParaLoc): string {
      const n = ops.length(loc);
      if (!n) return '';
      return loc.path.length ? d.getTextInCellByPath(...cell(loc), 0, n) : d.getTextRange(loc.section, loc.para, 0, n);
    },
    insert: (loc: ParaLoc, at: number, text: string) =>
      ok(loc.path.length ? d.insertTextInCellByPath(...cell(loc), at, text) : d.insertText(loc.section, loc.para, at, text)),
    remove: (loc: ParaLoc, at: number, count: number) => {
      if (count > 0) ok(loc.path.length ? d.deleteTextInCellByPath(...cell(loc), at, count) : d.deleteText(loc.section, loc.para, at, count));
    },
    /** 문단 끝에서 나눠 바로 뒤에 빈 문단을 만든다. 새 문단은 이 문단의 끝 글자 모양·문단 모양을 물려받는다 */
    splitAtEnd(loc: ParaLoc): ParaLoc {
      const n = ops.length(loc);
      ok(loc.path.length ? d.splitParagraphInCellByPath(...cell(loc), n) : d.splitParagraph(loc.section, loc.para, n));
      return nextLoc(loc);
    },
    /** 이 문단을 앞 문단에 붙여 없앤다(글자는 먼저 지운다) */
    drop(loc: ParaLoc) {
      ops.remove(loc, 0, ops.length(loc));
      ok(loc.path.length ? d.mergeParagraphInCellByPath(...cell(loc)) : d.mergeParagraph(loc.section, loc.para));
    },
    charShape(loc: ParaLoc, at: number): { charShapeId: number; bold: boolean; fontSize: number } {
      return JSON.parse(loc.path.length ? d.getCellCharPropertiesAtByPath(...cell(loc), at) : d.getCharPropertiesAt(loc.section, loc.para, at));
    },
    setCharShape: (loc: ParaLoc, start: number, end: number, id: number) =>
      ok(loc.path.length ? d.setCharShapeIdInCellByPath(...cell(loc), start, end, id) : d.setCharShapeId(loc.section, loc.para, start, end, id)),
    /** [at, at+count) 를 text 로 바꾼다. 새 글자는 **바뀌는 첫 글자**의 모양을 물려받는다.
     *  rhwp 는 끼운 글자에 앞 글자 모양을 준다 — 조문 머리 바로 뒤에서 바꾸면 머리의 굵은 글씨가 본문으로 번진다.
     *  그래서 바뀌는 첫 글자 하나를 남겨 그 뒤에 끼우고, 남긴 글자와 옛 글자를 지운다 */
    replace(loc: ParaLoc, at: number, count: number, text: string) {
      if (!count) {
        if (!text) return;
        // 지울 글자가 없으면 뒤 글자의 모양을 따른다(머리와 본문 사이에 끼울 때 머리 모양이 번지지 않게)
        const follow = at < ops.length(loc) ? ops.charShape(loc, at).charShapeId : null;
        ops.insert(loc, at, text);
        if (follow !== null) ops.setCharShape(loc, at, at + text.length, follow);
        return;
      }
      if (text) ops.insert(loc, at + 1, text);
      ops.remove(loc, at, 1);
      ops.remove(loc, at + text.length, count - 1);
    },
    /** 문단 글자를 next 로 — 앞뒤 같은 부분은 두고 가운데만 바꾼다(그 부분의 글자 모양이 그대로 남는다) */
    rewrite(loc: ParaLoc, next: string) {
      const old = ops.text(loc);
      if (old === next) return;
      let a = 0;
      while (a < old.length && a < next.length && old[a] === next[a]) a++;
      let b = 0;
      while (b < old.length - a && b < next.length - a && old[old.length - 1 - b] === next[next.length - 1 - b]) b++;
      ops.replace(loc, a, old.length - a - b, next.slice(a, next.length - b));
    },
  };
  return ops;
}
export type ParaOps = ReturnType<typeof paraOps>;
