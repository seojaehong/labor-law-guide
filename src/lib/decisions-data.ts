import { supabase } from "@/lib/supabase";
import type { ReasonCategory } from "@/lib/types";
import { PAGE_SIZE } from "@/lib/decisions-query";
import { resolveDecisionSourceContract } from "@/lib/search/source-contracts";
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
  issue_type_primary?: string | null;
};

/** 검색·유형·최근 목록 모두 상세 화면과 같은 ID 기반 출처 계약을 따른다. */
export function decisionRow(r: Record<string, unknown>, max = 120): Row {
  const id = String(r.id ?? "");
  const kind = resolveDecisionSourceContract({ id }).provider === "nlrc" ? "nlrc" : "court";
  return {
    kind,
    href: `/decisions/${encodeURIComponent(id)}`,
    title: headline((r.key_issue as string) ?? null, (r.title as string) ?? null, kind === "court" ? "판례" : "판정례", max),
    caseNumber: realCaseNumber(r.case_number_qualified as string, r.case_number_real as string, r.case_number as string),
    date: (r.decision_date as string) || null,
    tag: reasonLabel((r.reason_category as string[]) ?? null, (r.issue_type_primary as string) ?? null),
    // 법원 자료에 저장된 값은 노동위 구제 결과로 해석할 수 없다.
    result: kind === "nlrc" ? (r.decision_result as string) || null : null,
  };
}

export async function countByReason(reason: ReasonCategory): Promise<number> {
  const { count, error } = await supabase
    .from("nlrc_decisions")
    .select("id", { count: "exact", head: true })
    .contains("reason_category", [reason])
    .not("is_non_labor", "is", true);
  if (error || count === null) throw new Error("Category count failed");
  return count;
}

/**
 * 출처별 실제 사건 수 (2026-10-14). 유형별 건수를 더하면 한 사건이 여러 유형에 걸쳐 중복 계산돼
 * 여러 유형에 속한 사건을 중복 합산하지 않는다. 같은 저장 표의 출처별 건수다.
 * 출처 구분은 상세 화면과 같은 ID 접두어 계약(bc_·prec_ = 법원)을 따른다.
 */
export async function countBySource(): Promise<{ nlrc: number; court: number }> {
  const base = () =>
    supabase.from("nlrc_decisions").select("id", { count: "exact", head: true }).not("is_non_labor", "is", true);
  const [all, bc, prec] = await Promise.all([
    base(),
    base().like("id", "bc\\_%"),
    base().like("id", "prec\\_%"),
  ]);
  if ([all,bc,prec].some(r=>r.error||!Number.isSafeInteger(r.count)||r.count===null||r.count<0)) throw new Error("Source count failed");
  const court = bc.count! + prec.count!;
  if(!Number.isSafeInteger(court)||court>all.count!)throw new Error("Inconsistent source counts");
  return { nlrc: all.count! - court, court };
}

export async function getRecent(): Promise<Recent[]> {
  const { data, error } = await supabase
    .from("nlrc_decisions")
    // 2026-09-02 복구로 실제 번호가 들어왔다. 마스킹된 case_number 만 보면 72%가 빈칸이 된다.
    .select("id, title, case_number, case_number_real, case_number_qualified, key_issue, decision_date, decision_result, reason_category, issue_type_primary")
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
    const visible=raw.slice(0,PAGE_SIZE).map(r=>({...r}));
    // Existing search_nlrc RPC omits primary type. Enrich only displayed rows,
    // in one read query, without a migration or one request per result.
    if(type==='nlrc'){
      const ids=[...new Set(visible.filter(r=>r.issue_type_primary===undefined).map(r=>String(r.id??'')))];
      if(ids.length){
        if(ids.some(id=>!id))return {ok:false};
        const lookup=await supabase.from('nlrc_decisions').select('id,issue_type_primary').in('id',ids);
        if(lookup.error)return {ok:false};
        const primary=new Map((lookup.data??[]).map(r=>[String(r.id),r.issue_type_primary??null]));
        if(ids.some(id=>!primary.has(id)))return {ok:false};
        for(const r of visible)if(r.issue_type_primary===undefined)r.issue_type_primary=primary.get(String(r.id));
      }
    }
    const rows: Row[] = visible.map((r) => {
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
      return decisionRow(r);
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
      .select("id,title,case_number,case_number_real,case_number_qualified,key_issue,decision_date,decision_result,reason_category,issue_type_primary")
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
      rows: raw.slice(0, PAGE_SIZE).map((r) => decisionRow(r)),
    };
  } catch {
    return { ok: false };
  }
}
