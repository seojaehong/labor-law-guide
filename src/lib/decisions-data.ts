import { supabase } from "@/lib/supabase";
import type { ReasonCategory } from "@/lib/types";
import { PAGE_SIZE } from "@/lib/decisions-query";
import { realCaseNumber, headline, reasonLabel, type Row, type Kind } from "@/app/decisions/SearchResults";

export type DecisionResult = { ok: true; rows: Row[]; hasMore: boolean } | { ok: false };

// ── 허브(질의가 없을 때) ────────────────────────────────────────────
type Recent = {
  id: string;
  title: string | null;
  case_number: string | null;
  case_number_real: string | null;
  case_number_qualified: string | null;
  key_issue: string | null;
  decision_date: string | null;
  decision_result: string | null;
  reason_category: string[] | null;
};

export async function countByReason(reason: ReasonCategory): Promise<number> {
  const { count, error } = await supabase
    .from("nlrc_decisions")
    .select("id", { count: "exact", head: true })
    .contains("reason_category", [reason])
    .not("is_non_labor", "is", true);
  if (error || count === null) throw new Error("Category count failed");
  return count;
}

export async function getRecent(): Promise<Recent[]> {
  const { data, error } = await supabase
    .from("nlrc_decisions")
    // 2026-09-02 복구로 실제 번호가 들어왔다. 마스킹된 case_number 만 보면 72%가 빈칸이 된다.
    .select("id, title, case_number, case_number_real, case_number_qualified, key_issue, decision_date, decision_result, reason_category")
    .not("is_non_labor", "is", true)
    .gte("confidence_level", 0.8)
    .not("decision_date", "is", null)
    .order("decision_date", { ascending: false })
    .limit(30);
  if (error) throw new Error("Recent decisions failed");
  return (data as Recent[]) || [];
}

// ── 검색 ────────────────────────────────────────────────────────────
/** 세 표의 전문검색 RPC. 브라우저에서 부르던 것을 서버로 옮겼다. */
export async function runSearch(q: string, type: Kind, page: number): Promise<DecisionResult> {
  const offset = (page - 1) * PAGE_SIZE;
  // RPC 에 넣기 전에 구문 문자를 턴다. 없애도 전문검색 결과는 달라지지 않는다.
  const safe = q.replace(/[%_\\'"();]/g, " ").trim();
  if (safe.length < 2) return { ok: true, rows: [], hasMore: false };

  const fn = type === "court" ? "search_cases" : type === "admin" ? "search_admin" : "search_nlrc";
  try {
    const { data, error } = await supabase.rpc(fn, {
      query: safe,
      result_limit: PAGE_SIZE + 1,
      page_offset: offset,
    });
    if (error) return { ok: false };

    const raw = (data || []) as Record<string, unknown>[];
    const hasMore = raw.length > PAGE_SIZE;
    const rows: Row[] = raw.slice(0, PAGE_SIZE).map((r) => {
      const id = String(r.id ?? "");
      if (type === "admin") {
        return {
          kind: "admin" as const,
          href: `/interpretations/${encodeURIComponent(id)}`,
          title: headline(null, (r.title as string) ?? null, "행정해석"),
          caseNumber: (r.doc_number as string) || null,
          date: (r.decision_date as string) || null,
          tag: null,
          result: null,
        };
      }
      if (type === "court") {
        return {
          kind: "court" as const,
          href: `/cases/${encodeURIComponent(id)}`,
          title: headline(null, (r.title as string) ?? null, "판례"),
          caseNumber: (r.case_number as string) || null,
          date: (r.decision_date as string) || null,
          tag: (r.court as string) || null,
          result: null,
        };
      }
      return {
        kind: "nlrc" as const,
        href: `/decisions/${encodeURIComponent(id)}`,
        title: headline((r.key_issue as string) ?? null, (r.title as string) ?? null, "판정례", 120),
        caseNumber: realCaseNumber(r.case_number as string),
        date: (r.decision_date as string) || null,
        tag: reasonLabel((r.reason_category as string[]) ?? null),
        result: (r.decision_result as string) || null,
      };
    });
    return { ok: true, rows, hasMore };
  } catch {
    return { ok: false };
  }
}


export async function getCategory(reason: ReasonCategory, page: number): Promise<DecisionResult> {
  try {
    const offset = (page - 1) * PAGE_SIZE;
    const { data, error } = await supabase
      .from("nlrc_decisions")
      .select("id,title,case_number,case_number_real,case_number_qualified,key_issue,decision_date,decision_result,reason_category")
      .contains("reason_category", [reason])
      .not("is_non_labor", "is", true)
      .order("decision_date", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE);
    if (error) return { ok: false };
    const raw = (data || []) as Recent[];
    return {
      ok: true,
      hasMore: raw.length > PAGE_SIZE,
      rows: raw.slice(0, PAGE_SIZE).map((r) => ({
        kind: "nlrc",
        href: `/decisions/${encodeURIComponent(r.id)}`,
        title: headline(r.key_issue, r.title, "판정례", 120),
        caseNumber: realCaseNumber(r.case_number_qualified, r.case_number_real, r.case_number),
        date: r.decision_date,
        tag: reasonLabel(r.reason_category),
        result: r.decision_result,
      })),
    };
  } catch {
    return { ok: false };
  }
}
