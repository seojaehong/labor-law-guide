import Link from "next/link";
import DecisionCategoryNavigation from "@/components/DecisionCategoryNavigation";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { countByReason, getRecent, runSearch, getCategory, decisionRow } from "@/lib/decisions-data";
import { parse, tabHref, pageHref, categoryHref, type Search } from "@/lib/decisions-query";
import { REASON_LABELS, type ReasonCategory } from "@/lib/types";
import { SITE_URL, BRAND_NAME } from "@/lib/constants";
import { ResultRow, type Kind } from "./SearchResults";

// /decisions 상세는 48,000페이지가 있는데 목록(허브) 페이지가 아예 없었다.
// 라우트가 [id] 뿐이라 /decisions 자체가 404 + noindex 였고(2026-08-31 라이브 확인),
// 그 결과 상세 페이지로 들어가는 내부링크가 0개였다.
//
// 2026-09-12 — 여기가 검색의 본체가 된다. /search·/database·/cases 로 흩어져 있던
// 진입로를 하나로 모으고, **서버에서 결과를 그린다.** 기존 /search 는 서버 렌더 본문이
// 240자뿐인 껍데기였다 — 크롤러도 JS 가 늦게 뜨는 폰도 빈 화면을 봤다.
export const dynamic = "force-dynamic";

const REASON_KEYS = Object.keys(REASON_LABELS) as ReasonCategory[];

const TABS: { key: Kind; label: string }[] = [
  { key: "nlrc", label: "노동위 판정례" },
  { key: "court", label: "법원 판례" },
  { key: "admin", label: "행정해석" },
];

export async function generateMetadata(
  { searchParams }: { searchParams: Promise<Search> }
): Promise<Metadata> {
  const { q, reasonProvided } = parse(await searchParams);
  // 검색 결과는 색인시키지 않는다 — 같은 사건이 질의마다 다른 주소로 중복된다.
  return {
    title: q
      ? `${q} 검색 결과 | 노동위 판정례·법원 판례`
      : "노동위 판정례·법원 판례 검색 | 해고·징계 사건 6만건",
    description:
      "부당해고 구제신청, 징계, 전보, 갱신기대권 등 노동위원회 판정례와 법원 판례, 행정해석을 한곳에서 찾습니다. 사건번호·쟁점·판정결과로 유사 사례를 비교해 보세요.",
    alternates: { canonical: `${SITE_URL}/decisions` },
    robots: q || reasonProvided ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      title: "노동위 판정례·법원 판례 검색",
      description: "해고·징계 사건 6만건과 행정해석을 한곳에서.",
      url: `${SITE_URL}/decisions`,
      type: "website",
      locale: "ko_KR",
      siteName: BRAND_NAME,
    },
  };
}

export default async function DecisionsIndexPage(
  { searchParams }: { searchParams: Promise<Search> }
) {
  const { q, type, page, reason, reasonProvided, invalidCombination } = parse(await searchParams);

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
    <main className="layout-list">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <h1 className="mb-2 text-2xl font-bold">판정례 · 판례 · 행정해석 검색</h1>
      <p className="mb-6 text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
        노동위원회 판정례 6만여 건, 법원 판례, 고용노동부 행정해석을 한곳에서 찾습니다.
        비슷한 사건이 어떤 이유로 인정되고 기각됐는지 비교해 보세요.
      </p>

      {/* 자바스크립트 없이 동작하는 GET 폼 — 검색 결과도 서버가 그린다 */}
      {reasonProvided ? <p className="mb-2 text-sm">전체 자료에서 검색</p> : null}
      <form action="/decisions" method="get" className="mb-6 flex gap-2">
        {!reasonProvided && type !== "nlrc" ? <input type="hidden" name="type" value={type} /> : null}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="쟁점, 사건번호로 검색 (예: 징계 절차, 경남2025부해9127)"
          aria-label="판정례 검색"
          className="min-w-0 flex-1 rounded-xl border px-4 py-2.5 text-[14px] outline-none focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2"
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

      {reasonProvided && !reason ? (
        <div><p>지원하지 않는 유형입니다.</p><Link href="/decisions">유형 목록으로</Link></div>
      ) : invalidCombination && reason ? (
        <div>
          <p>유형과 키워드 또는 다른 자료 종류를 함께 지정할 수 없습니다.</p>
          <Link href={categoryHref(reason)}>해당 유형 보기</Link>{" · "}
          <Link href={tabHref(q, type)}>전체 자료 검색</Link>
        </div>
      ) : reason ? <CategoryView reason={reason} page={page} />
        : q ? <SearchView q={q} type={type} page={page} /> : <HubView />}
    </main>
  );
}

async function SearchView({ q, type, page }: { q: string; type: Kind; page: number }) {
  const result = await runSearch(q, type, page);
  if (!result.ok) return <LoadError href={pageHref(q, type, page)} />;
  const { rows, hasMore } = result;

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

// 2026-09-13 — 허브는 요청마다 exact count 16개를 병렬로 날리고 있었다(실측 합 1.2s, 콜드 5s).
// 수집기가 멈춰 있어 숫자는 하루에 한 번도 안 바뀐다. 결과만 6시간 캐시한다 — 페이지는 force-dynamic 그대로.
const getHubData = unstable_cache(
  async () => {
    const [counts, recent] = await Promise.all([
      Promise.all(REASON_KEYS.map(async (r) => ({ reason: r, count: await countByReason(r) }))),
      getRecent(),
    ]);
    return { counts, recent };
  },
  ["decisions-hub-v2"],
  { revalidate: 21600 }
);

async function HubView() {
  let hub;
  try {
    hub = await getHubData();
  } catch {
    return <LoadError href="/decisions" message="유형 집계와 최근 판정례를 불러오지 못했습니다." />;
  }
  const { counts, recent } = hub;
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
              href={categoryHref(reason)}
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
              // 허브는 쟁점 전문을 넉넉히 싣는다.
              row={decisionRow(d, 600)}
            />
          ))}
        </ul>
      </section>
    </>
  );
}

function LoadError({ href, message = "판정례를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }: { href: string; message?: string }) {
  return <div className="py-10 text-sm" style={{ color: "var(--grey-700)" }}>
    <p role="status">{message}</p>
    <a href={href} className="mt-3 inline-block underline" style={{ color: "var(--color-accent-ink)" }}>다시 시도</a>
  </div>;
}

async function CategoryView({ reason, page }: { reason: ReasonCategory; page: number }) {
  const result = await getCategory(reason, page);
  return <section>
    <DecisionCategoryNavigation reason={reason} />
    <h2 className="my-4 text-lg font-semibold">{REASON_LABELS[reason]} 유형별 노동위 판정례</h2>
    {!result.ok ? <LoadError href={categoryHref(reason, page)} /> : <>
      {result.rows.length ? <ul className="border-t" style={{ borderColor: "var(--color-border)" }}>
        {result.rows.map((r) => <ResultRow key={r.href} row={r} />)}
      </ul> : <p className="py-10 text-sm">{page > 1 ? "이 페이지에 결과가 없습니다." : "이 유형에 등록된 판정례가 없습니다."}</p>}
      {(page > 1 || result.hasMore) && <nav aria-label="유형별 판정례 페이지" className="mt-8 flex flex-wrap items-center justify-center gap-4 text-sm">
        {page > 1 && <><Link href={categoryHref(reason)}>첫 페이지</Link><Link href={categoryHref(reason, page - 1)}>← 이전</Link></>}
        <span>{page} 페이지</span>
        {result.hasMore && <Link href={categoryHref(reason, page + 1)}>다음 →</Link>}
      </nav>}
    </>}
  </section>;
}
