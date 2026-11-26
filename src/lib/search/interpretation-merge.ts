// 261124 · #213 — 행정해석 두 표(admin_interpretations · molab_interpretations)의 결과를 합치는 자리.
// 🔴 점수로 한 줄 세우지 않는다. 두 검색 함수의 relevance 는 서로 다른 자로 잰 값이다 —
// 실측(2026-11-24, 질의 10개): 행정 0.50~0.63 / molab 0.04~0.14.
// 그래서 합쳐 놓은 search_admin_merged 에서도 molab 이 20칸 안에 7/10 은 아예 안 들어왔다.
// 순서를 못 믿으므로 번갈아 끼운다. 중복은 「번호+제목」으로 읽는 시점에 걷어낸다(지우지 않는다).
import type { MolabInterpretation } from '@/lib/search/types';

export type AdminInterpretationRow = {
  id: string;
  title: string | null;
  doc_number: string | null;
  decision_date: string | null;
  summary: string | null;
  holding_points: string | null;
  keywords_matched: string[] | null;
};

export const MOLAB_COLUMNS =
  'id, title, case_number, decision_date, inquiry_summary, answer_summary, keywords_matched';
export const ADMIN_COLUMNS =
  'id, title, doc_number, decision_date, summary, holding_points, keywords_matched';

// admin_interpretations 는 열 이름이 다르다. 화면이 쓰는 모양으로 맞춘다.
export function toInterpretation(row: AdminInterpretationRow): MolabInterpretation {
  return {
    id: row.id,
    title: row.title ?? '',
    case_number: row.doc_number ?? null,
    decision_date: row.decision_date ?? null,
    inquiry_summary: row.summary ?? null,
    answer_summary: row.holding_points ?? null,
    keywords_matched: row.keywords_matched ?? [],
  };
}

export function interpretationKey(item: MolabInterpretation): string {
  const number = (item.case_number || '').replace(/\s+/g, '');
  const title = (item.title || '').replace(/\s+/g, '');
  return number || title ? `${number}|${title}` : `id:${item.id}`;
}

export function interleaveInterpretations(
  primary: MolabInterpretation[],
  secondary: MolabInterpretation[],
  limit: number
): MolabInterpretation[] {
  const out: MolabInterpretation[] = [];
  const seen = new Set<string>();

  const push = (item: MolabInterpretation | undefined) => {
    if (!item || out.length >= limit) return;
    const key = interpretationKey(item);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  };

  const rounds = Math.max(primary.length, secondary.length);
  for (let i = 0; i < rounds && out.length < limit; i += 1) {
    push(primary[i]);
    push(secondary[i]);
  }
  return out;
}
