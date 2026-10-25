// 판독문 원문 대조 — 스캔 쪽 판독 중 조문이 아닌 줄(표·문서 머리 줄·부칙·별표·장 제목)을 쪽별로 묶는다.
// 조문 본문은 조문 고치기·확인 탭에서 보인다. 표·머리 줄은 어디에도 보이지 않아 담당자가 원문과 맞춰 볼 수 없었다.
// 줄 구분은 model.ts parseRegulation 과 같은 머리 모양을 쓰고, 쪽을 넘어 이어지는 조문은 앞 쪽 상태를 들고 간다.
// 표 줄은 판독 지시(ocr-check.ts)대로 칸 사이가 「 | 」인 줄이다 — 조문 안에 든 표도 따로 모은다.
import { ANNEX_HEAD, CHAPTER, HEAD, SUPP } from './model';
import { anchorsOf, type Flagged, type PageCheck } from './ocr-crosscheck';

export type SegmentKind = '머리' | '표' | '장·절 제목' | '부칙' | '별표·서식';

export interface SegmentLine {
  /** 그 쪽 판독(a)의 줄 번호(1부터) — Flagged.line 과 같다 */
  no: number;
  text: string;
  /** 두 번째 판독에서 찾지 못한 숫자·조 번호(대조한 쪽만) */
  missing: string[];
  /** 숫자·날짜·조 번호가 있어 대조할 거리가 있는 줄 */
  anchored: boolean;
}

export interface Segment {
  page: number;
  kind: SegmentKind;
  lines: SegmentLine[];
  check: PageCheck;
}

export const isTableRow = (t: string) => t.includes(' | ');
const isAnnexHead = (t: string) => {
  const m = t.match(ANNEX_HEAD);
  return !!m && !/^\s*(?:에|의|와|과|을|를|로|에서|및|,)/.test(t.slice(m[0].length));
};

/** 쪽 순서대로 받아 조문이 아닌 줄을 묶는다. 판독문(a)이 없는 쪽(옛 작업)은 건너뛴다 */
export function nonArticleSegments(pages: PageCheck[]): Segment[] {
  const out: Segment[] = [];
  let area: 'head' | 'article' | 'chapter' | 'supp' | 'annex' = 'head';
  for (const check of [...pages].sort((x, y) => x.page - y.page)) {
    if (!check.a) continue;
    const flagged = new Map<number, Flagged>(check.state === 'checked' ? check.flagged.map((f) => [f.line, f]) : []);
    let seg: Segment | null = null;
    check.a.forEach((raw, i) => {
      const t = raw.trim();
      if (!t) return;
      if (isAnnexHead(t)) area = 'annex';
      else if (area !== 'annex') {
        if (SUPP.test(t)) area = 'supp';
        else if (area !== 'supp') {
          if (CHAPTER.test(t)) area = 'chapter';
          else if (HEAD.test(t)) area = 'article';
        }
      }
      const kind: SegmentKind | null = isTableRow(t) ? '표'
        : area === 'head' ? '머리' : area === 'chapter' ? '장·절 제목' : area === 'supp' ? '부칙' : area === 'annex' ? '별표·서식' : null;
      // 장 제목은 그 줄 하나뿐 — 다음 줄부터는 조문 앞의 머리가 아니다
      if (area === 'chapter') area = 'article';
      if (!kind) { seg = null; return; }
      if (!seg || seg.kind !== kind) { seg = { page: check.page, kind, lines: [], check }; out.push(seg); }
      seg.lines.push({ no: i + 1, text: raw, missing: flagged.get(i + 1)?.anchors ?? [], anchored: anchorsOf(raw).length > 0 });
    });
  }
  return out;
}
