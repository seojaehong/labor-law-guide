import Link from "next/link";
import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/decisions-ui/card";
import { Badge } from "@/components/decisions-ui/badge";
import { REASON_LABELS, RESULT_LABELS, type ReasonCategory, type DecisionResult } from "@/lib/types";
import { SITE_URL } from "@/lib/constants";
import { stripMarkdownFormatting } from "@/lib/format-holding";

// /decisions 상세는 48,000페이지가 있는데 목록(허브) 페이지가 아예 없었다.
// 라우트가 [id] 뿐이라 /decisions 자체가 404 + noindex 였고(2026-08-31 라이브 확인),
// 그 결과 상세 페이지로 들어가는 내부링크가 0개였다. 크롤러가 사이트맵 말고는
// 진입할 경로가 없으면 색인이 느리고 얕게 잡힌다. 이 페이지가 그 진입점이다.
export const revalidate = 3600;

const REASON_KEYS = Object.keys(REASON_LABELS) as ReasonCategory[];

export const metadata: Metadata = {
  title: "노동위 판정례·법원 판례 검색 | 해고·징계 사건 5만건",
  description:
    "부당해고 구제신청, 징계, 전보, 갱신기대권 등 노동위원회 판정례와 법원 판례를 유형별로 모았습니다. 사건번호·쟁점·판정결과로 유사 사례를 찾아보세요.",
  alternates: { canonical: `${SITE_URL}/decisions` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "노동위 판정례·법원 판례 검색",
    description: "해고·징계 사건 5만건을 유형별로 정리했습니다.",
    url: `${SITE_URL}/decisions`,
    type: "website",
    locale: "ko_KR",
    siteName: "노란봉투법 가이드",
  },
};

type Recent = {
  id: string;
  title: string | null;
  case_number: string | null;
  key_issue: string | null;
  decision_date: string | null;
  decision_result: string | null;
  reason_category: string[] | null;
};

async function countByReason(reason: ReasonCategory): Promise<number> {
  const { count } = await supabase
    .from("nlrc_decisions")
    .select("id", { count: "exact", head: true })
    .contains("reason_category", [reason])
    .not("is_non_labor", "is", true);
  return count ?? 0;
}

async function getRecent(): Promise<Recent[]> {
  const { data } = await supabase
    .from("nlrc_decisions")
    .select("id, title, case_number, key_issue, decision_date, decision_result, reason_category")
    .not("is_non_labor", "is", true)
    .gte("confidence_level", 0.8)
    .not("decision_date", "is", null)
    .order("decision_date", { ascending: false })
    .limit(30);
  return (data as Recent[]) || [];
}

// 사건번호가 2018부해OOO 처럼 마스킹된 행이 노동위 판정례의 72%다.
// 마스킹된 번호는 검색어로도 식별자로도 쓸모가 없으므로 화면에 내보내지 않는다.
function realCaseNumber(n: string | null): string {
  if (!n) return "";
  return n.includes("OOO") ? "" : n;
}

export default async function DecisionsIndexPage() {
  const [counts, recent] = await Promise.all([
    Promise.all(REASON_KEYS.map(async (r) => ({ reason: r, count: await countByReason(r) }))),
    getRecent(),
  ]);
  const visible = counts.filter((c) => c.count > 0).sort((a, b) => b.count - a.count);
  const total = visible.reduce((s, c) => s + c.count, 0);

  return (
    <main className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-2">노동위 판정례 · 법원 판례</h1>
      <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
        부당해고 구제신청과 징계 사건을 중심으로 노동위원회 판정례와 법원 판례를 유형별로 모았습니다.
        비슷한 사건이 어떤 이유로 인정되고 기각됐는지 비교해 보세요.
      </p>

      <section className="mb-12">
        <h2 className="text-lg font-semibold mb-4">유형별로 찾기</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {visible.map(({ reason, count }) => (
            <Link
              key={reason}
              href={`/search?reason=${encodeURIComponent(reason)}`}
              className="block rounded-lg border p-4 hover:bg-muted/50 transition-colors"
            >
              <div className="font-medium text-sm">{REASON_LABELS[reason]}</div>
              <div className="text-xs text-muted-foreground mt-1">{count.toLocaleString()}건</div>
            </Link>
          ))}
        </div>
        {total > 0 ? (
          <p className="text-xs text-muted-foreground mt-4">분류된 사건 {total.toLocaleString()}건</p>
        ) : null}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">최근 판정례</h2>
        <div className="space-y-3">
          {recent.map((d) => {
            const caseNum = realCaseNumber(d.case_number);
            const reason = d.reason_category?.[0] as ReasonCategory | undefined;
            const issue = stripMarkdownFormatting(d.key_issue || "").replace(/\s+/g, " ").trim();
            return (
              <Card key={d.id} className="p-4">
                <Link href={`/decisions/${encodeURIComponent(d.id)}`} className="block">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    {reason && REASON_LABELS[reason] ? (
                      <Badge variant="secondary">{REASON_LABELS[reason]}</Badge>
                    ) : null}
                    {d.decision_result && RESULT_LABELS[d.decision_result as DecisionResult] ? (
                      <Badge variant="outline">{RESULT_LABELS[d.decision_result as DecisionResult]}</Badge>
                    ) : null}
                    {caseNum ? (
                      <span className="text-xs text-muted-foreground">{caseNum}</span>
                    ) : null}
                    {d.decision_date ? (
                      <span className="text-xs text-muted-foreground">{d.decision_date}</span>
                    ) : null}
                  </div>
                  <p className="text-sm leading-relaxed line-clamp-2">
                    {issue || d.title || "판정례"}
                  </p>
                </Link>
              </Card>
            );
          })}
        </div>
      </section>
    </main>
  );
}
