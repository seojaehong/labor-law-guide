import Link from "next/link";
import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import { REASON_LABELS, type ReasonCategory } from "@/lib/types";
import { SITE_URL } from "@/lib/constants";
import { ResultRow, realCaseNumber, headline, reasonLabel, type Row, type Kind } from "./SearchResults";

// /decisions 상세는 48,000페이지가 있는데 목록(허브) 페이지가 아예 없었다.
// 라우트가 [id] 뿐이라 /decisions 자체가 404 + noindex 였고(2026-08-31 라이브 확인),
// 그 결과 상세 페이지로 들어가는 내부링크가 0개였다.
//
// 2026-09-12 — 여기가 검색의 본체가 된다. /search·/database·/cases 로 흩어져 있던
// 진입로를 하나로 모으고, **서버에서 결과를 그린다.** 기존 /search 는 서버 렌더 본문이
// 240자뿐인 껍데기였다 — 크롤러도 JS 가 늦게 뜨는 폰도 빈 화면을 봤다.
export const dynamic = "force-dynamic";

const REASON_KEYS = Object.keys(REASON_LABELS) as ReasonCategory[];
const PAGE_SIZE = 20;

const TABS: { key: Kind; label: string }[] = [
  { key: "nlrc", label: "노동위 판정례" },
  { key: "court", label: "법원 판례" },
  { key: "admin", label: "행정해석" },
];

type Search = { q?: string; type?: string; page?: string };

function parse(sp: Search) {
  const q = (sp.q || "").trim().slice(0, 60);
  const type: Kind = sp.type === "court" ? "court" : sp.type === "admin" ? "admin" : "nlrc";
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);
  return { q, type, page };
}

export async function generateMetadata(
  { searchParams }: { searchParams: Promise<Search> }
): Promise<Metadata> {
  const { q } = parse(await searchParams);
  // 검색 결과는 색인시키지 않는다 — 같은 사건이 질의마다 다른 주소로 중복된다.
  return {
    title: q
      ? `${q} 검색 결과 | 노동위 판정례·법원 판례`
      : "노동위 판정례·법원 판례 검색 | 해고·징계 사건 6만건",
    description:
      "부당해고 구제신청, 징계, 전보, 갱신기대권 등 노동위원회 판정례와 법원 판례, 행정해석을 한곳에서 찾습니다. 사건번호·쟁점·판정결과로 유사 사례를 비교해 보세요.",
    alternates: { canonical: `${SITE_URL}/decisions` },
    robots: q ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      title: "노동위 판정례·법원 판례 검색",
      description: "해고·징계 사건 6만건과 행정해석을 한곳에서.",
      url: `${SITE_URL}/decisions`,
      type: "website",
      locale: "ko_KR",
      siteName: "노란봉투법 가이드",
    },
  };
}

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
    // 2026-09-02 복구로 실제 번호가 들어왔다. 마스킹된 case_number 만 보면 72%가 빈칸이 된다.
    .select("id, title, case_number, case_number_real, case_number_qualified, key_issue, decision_date, decision_result, reason_category")
    .not("is_non_labor", "is", true)
    .gte("confidence_level", 0.8)
    .not("decision_date", "is", null)
    .order("decision_date", { ascending: false })
    .limit(30);
  return (data as Recent[]) || [];
}

// ── 검색 ────────────────────────────────────────────────────────────
/** 세 표의 전문검색 RPC. 브라우저에서 부르던 것을 서버로 옮겼다. */
async function runSearch(q: string, type: Kind, page: number): Promise<{ rows: Row[]; hasMore: boolean }> {
  const offset = (page - 1) * PAGE_SIZE;
  // RPC 에 넣기 전에 구문 문자를 턴다. 없애도 전문검색 결과는 달라지지 않는다.
  const safe = q.replace(/[%_\\'"();]/g, " ").trim();
  if (safe.length < 2) return { rows: [], hasMore: false };

  const fn = type === "court" ? "search_cases" : type === "admin" ? "search_admin" : "search_nlrc";
  const { data, error } = await supabase.rpc(fn, {
    query: safe,
    result_limit: PAGE_SIZE + 1,
    page_offset: offset,
  });
  if (error) {
    console.error(`${fn} 실패:`, error.message);
    return { rows: [], hasMore: false };
  }

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
  return { rows, hasMore };
}

function tabHref(q: string, type: Kind) {
  const sp = new URLSearchParams({ q });
  if (type !== "nlrc") sp.set("type", type);
  return `/decisions?${sp.toString()}`;
}

function pageHref(q: string, type: Kind, page: number) {
  const sp = new URLSearchParams({ q });
  if (type !== "nlrc") sp.set("type", type);
  if (page > 1) sp.set("page", String(page));
  return `/decisions?${sp.toString()}`;
}

export default async function DecisionsIndexPage(
  { searchParams }: { searchParams: Promise<Search> }
) {
  const { q, type, page } = parse(await searchParams);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "홈", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "판정례 검색", item: `${SITE_URL}/decisions` },
        ],
      },
    ],
  };

  return (
    <main className="mx-auto max-w-[820px] px-5 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <h1 className="mb-2 text-2xl font-bold">판정례 · 판례 · 행정해석 검색</h1>
      <p className="mb-6 text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
        노동위원회 판정례 6만여 건, 법원 판례, 고용노동부 행정해석을 한곳에서 찾습니다.
        비슷한 사건이 어떤 이유로 인정되고 기각됐는지 비교해 보세요.
      </p>

      {/* 자바스크립트 없이 동작하는 GET 폼 — 검색 결과도 서버가 그린다 */}
      <form action="/decisions" method="get" className="mb-6 flex gap-2">
        {type !== "nlrc" ? <input type="hidden" name="type" value={type} /> : null}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="쟁점, 사건번호로 검색 (예: 징계 절차, 경남2025부해9127)"
          aria-label="판정례 검색"
          className="flex-1 rounded-xl border px-4 py-2.5 text-[14px] outline-none focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-surface)" }}
        />
        <button
          type="submit"
          className="rounded-xl px-5 py-2.5 text-[14px] font-semibold text-white"
          style={{ backgroundColor: "var(--color-accent-ink)" }}
        >
          검색
        </button>
      </form>

      {q ? <SearchView q={q} type={type} page={page} /> : <HubView />}
    </main>
  );
}

async function SearchView({ q, type, page }: { q: string; type: Kind; page: number }) {
  const { rows, hasMore } = await runSearch(q, type, page);

  return (
    <>
      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={tabHref(q, t.key)}
            className="rounded-full border px-4 py-1.5 text-[13px] font-medium"
            style={
              t.key === type
                ? { backgroundColor: "var(--color-accent)", color: "#fff", borderColor: "var(--color-accent)" }
                : { backgroundColor: "var(--color-bg-surface)", color: "var(--grey-600)", borderColor: "var(--color-border)" }
            }
          >
            {t.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="py-16 text-center text-sm" style={{ color: "var(--color-text-tertiary)" }}>
          <p className="mb-1">「{q}」에 해당하는 결과가 없습니다.</p>
          <p>다른 낱말로 찾거나 위 탭에서 다른 자료를 보세요.</p>
        </div>
      ) : (
        <ul className="border-t" style={{ borderColor: "var(--color-border)" }}>
          {rows.map((r) => <ResultRow key={r.href} row={r} />)}
        </ul>
      )}

      {(page > 1 || hasMore) && (
        <div className="mt-8 flex items-center justify-center gap-4 text-sm">
          {page > 1 ? (
            <Link href={pageHref(q, type, page - 1)} style={{ color: "var(--color-accent-ink)" }}>← 이전</Link>
          ) : <span style={{ color: "var(--color-text-tertiary)" }}>← 이전</span>}
          <span style={{ color: "var(--color-text-tertiary)" }}>{page} 페이지</span>
          {hasMore ? (
            <Link href={pageHref(q, type, page + 1)} style={{ color: "var(--color-accent-ink)" }}>다음 →</Link>
          ) : <span style={{ color: "var(--color-text-tertiary)" }}>다음 →</span>}
        </div>
      )}
    </>
  );
}

async function HubView() {
  const [counts, recent] = await Promise.all([
    Promise.all(REASON_KEYS.map(async (r) => ({ reason: r, count: await countByReason(r) }))),
    getRecent(),
  ]);
  const visible = counts.filter((c) => c.count > 0).sort((a, b) => b.count - a.count);
  const total = visible.reduce((s, c) => s + c.count, 0);

  return (
    <>
      <section className="mb-12">
        <h2 className="mb-4 text-lg font-semibold">유형별로 찾기</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {visible.map(({ reason, count }) => (
            <Link
              key={reason}
              href={`/decisions?q=${encodeURIComponent(REASON_LABELS[reason])}`}
              className="block rounded-lg border p-4 transition-colors hover:bg-muted/50"
              style={{ borderColor: "var(--color-border)" }}
            >
              <div className="text-sm font-medium">{REASON_LABELS[reason]}</div>
              <div className="mt-1 text-xs" style={{ color: "var(--color-text-tertiary)" }}>
                {count.toLocaleString()}건
              </div>
            </Link>
          ))}
        </div>
        {total > 0 ? (
          <p className="mt-4 text-xs" style={{ color: "var(--color-text-tertiary)" }}>
            분류된 사건 {total.toLocaleString()}건
          </p>
        ) : null}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">최근 판정례</h2>
        <ul className="border-t" style={{ borderColor: "var(--color-border)" }}>
          {recent.map((d) => (
            <ResultRow
              key={d.id}
              row={{
                kind: "nlrc",
                href: `/decisions/${encodeURIComponent(d.id)}`,
                title: headline(d.key_issue, d.title, "판정례"),
                caseNumber: realCaseNumber(d.case_number_qualified, d.case_number_real, d.case_number),
                date: d.decision_date,
                tag: reasonLabel(d.reason_category),
                result: d.decision_result,
              }}
            />
          ))}
        </ul>
      </section>
    </>
  );
}
