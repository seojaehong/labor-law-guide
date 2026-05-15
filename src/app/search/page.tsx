"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import { Card } from "@/components/decisions-ui/card";
import { Badge } from "@/components/decisions-ui/badge";
import { Input } from "@/components/decisions-ui/input";
import { Button } from "@/components/decisions-ui/button";
import {
  REASON_LABELS,
  RESULT_LABELS,
  LEGAL_FOCUS_LABELS,
  labelize,
  type ReasonCategory,
  type DecisionResult,
} from "@/lib/types";
import { getDecisionDetailHref } from "@/lib/search/source-contracts";
import { stripMarkdownFormatting } from "@/lib/format-holding";
import type { MolabInterpretation, SearchBucket, SearchCard, SearchMode, SearchResponsePayload } from "@/lib/search/types";
import Link from "next/link";
const IS_DEV = process.env.NODE_ENV === "development";
const SEARCH_CACHE_TTL_MS = 30_000;
const responseCache = new Map<string, { payload: SearchResponsePayload; savedAt: number }>();

function isSearchBucket(value: unknown): value is SearchBucket {
  if (!value || typeof value !== "object") return false;
  const bucket = value as Partial<SearchBucket>;
  return Array.isArray(bucket.items) && typeof bucket.total === "number";
}

function normalizeSearchPayload(
  raw: unknown,
  fallback: {
    mode: SearchMode;
    query: string;
    reason: ReasonCategory | "";
    result: DecisionResult | "";
  }
): SearchResponsePayload {
  if (raw && typeof raw === "object") {
    const maybePayload = raw as Partial<SearchResponsePayload> & Record<string, unknown>;

    if (isSearchBucket(maybePayload.candidate) || isSearchBucket(maybePayload.baseline)) {
      return {
        mode: (maybePayload.mode as SearchMode) || fallback.mode,
        query: typeof maybePayload.query === "string" ? maybePayload.query : fallback.query,
        reason: (maybePayload.reason as ReasonCategory | "") ?? fallback.reason,
        result: (maybePayload.result as DecisionResult | "") ?? fallback.result,
        baseline: isSearchBucket(maybePayload.baseline) ? maybePayload.baseline : undefined,
        candidate: isSearchBucket(maybePayload.candidate) ? maybePayload.candidate : undefined,
        molab: Array.isArray(maybePayload.molab) ? maybePayload.molab as MolabInterpretation[] : undefined,
        baselineError: typeof maybePayload.baselineError === "string" ? maybePayload.baselineError : undefined,
        candidateError: typeof maybePayload.candidateError === "string" ? maybePayload.candidateError : undefined,
      };
    }

    if (isSearchBucket(raw)) {
      return {
        ...fallback,
        baseline: fallback.mode === "baseline" ? raw : undefined,
        candidate: fallback.mode === "candidate" ? raw : undefined,
      };
    }
  }

  return {
    ...fallback,
    baseline: fallback.mode === "baseline" || fallback.mode === "compare"
      ? { items: [], total: 0, page: 0, pageSize: 20 }
      : undefined,
    candidate: fallback.mode === "candidate" || fallback.mode === "compare"
      ? { items: [], total: 0, page: 0, pageSize: 5 }
      : undefined,
    baselineError: fallback.mode !== "candidate" ? "search payload format mismatch" : undefined,
    candidateError: fallback.mode !== "baseline" ? "search payload format mismatch" : undefined,
  };
}

const RESULT_COLORS: Record<string, string> = {
  granted: "bg-green-100 text-green-800",
  partial: "bg-yellow-100 text-yellow-800",
  dismissed: "bg-red-100 text-red-800",
  rejected: "bg-gray-100 text-gray-800",
  upheld: "bg-blue-100 text-blue-800",
  overturned: "bg-purple-100 text-purple-800",
  settled: "bg-orange-100 text-orange-800",
};

function SearchModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button variant={active ? "default" : "outline"} onClick={onClick} type="button">
      {children}
    </Button>
  );
}

function SectionPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-1 text-[11px] text-muted-foreground">
      {children}
    </span>
  );
}

function getModeLabel(mode: SearchMode): string {
  if (mode === "baseline") return "기본 검색";
  if (mode === "candidate") return "AI 검색";
  return "비교 보기";
}

function getModeDescription(mode: SearchMode): string {
  if (mode === "baseline") {
    return "기존 reason_category와 검색 인덱스 기준으로 판정례를 보여줍니다.";
  }
  if (mode === "candidate") {
    return "8축 태그 기반 AI 검색 결과를 보여줍니다.";
  }
  return "기본 검색과 AI 검색 결과를 나란히 비교합니다.";
}

function getResultCountLabel(mode: SearchMode, payload: SearchResponsePayload | null): string {
  if (!payload) return "0건";

  if (mode === "compare") {
    const baselineTotal = payload.baseline?.total || 0;
    const candidateTotal = payload.candidate?.total || 0;
    return `기본 ${baselineTotal.toLocaleString()}건 · AI ${candidateTotal.toLocaleString()}건`;
  }

  const total = mode === "candidate" ? payload.candidate?.total || 0 : payload.baseline?.total || 0;
  return `${total.toLocaleString()}건`;
}

function getDebugScenarioLabel(payload: SearchResponsePayload | null): string | null {
  return payload?.debug?.candidate?.scenario || null;
}

function getIssuePreview(item: SearchCard): string {
  const raw =
    item.summary_short?.trim() ||
    item.key_issue?.trim() ||
    item.holding_summary?.trim() ||
    item.holding_points?.trim() ||
    item.title?.trim() ||
    "";
  if (!raw) return "";
  const clean = stripMarkdownFormatting(raw);
  return clean.length > 200 ? `${clean.slice(0, 200)}...` : clean;
}

function getDisplayCaseNumber(caseNumber?: string | null): string {
  if (!caseNumber) return "";
  return /^id_/i.test(caseNumber) ? "" : caseNumber;
}

function SearchResultCard({ item }: { item: SearchCard }) {
  const sourceBadge =
    item.source_provider === "lawgo" ? (
      <Badge variant="outline" className="text-[10px]">법제처 판례</Badge>
    ) : item.source_provider === "bigcase" ? (
      <Badge variant="outline" className="text-[10px]">법원 판례</Badge>
    ) : item.source_provider === "nlrc" ? (
      <Badge variant="outline" className="text-[10px]">노동위 판정례</Badge>
    ) : null;

  const tierBadge = item.tier === 'high_demand' ? (
    <Badge variant="destructive" className="text-[10px]">괴롭힘·성희롱</Badge>
  ) : null;

  const legalFocusBadges = item.legal_focus?.filter(f => f !== '불명').slice(0, 2).map(f => (
    <Badge key={f} variant="outline" className="text-[10px]">{labelize(f, LEGAL_FOCUS_LABELS)}</Badge>
  ));

  const caseNum = getDisplayCaseNumber(item.case_number);

  return (
    <Link key={item.id} href={getDecisionDetailHref(item)}>
      <Card className="p-4 hover:border-primary transition-colors cursor-pointer mb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium text-sm line-clamp-2">{item.title}</h3>
              {sourceBadge}
              {tierBadge}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {item.department || "-"} | {item.decision_date || "-"}
            </p>
            {caseNum && (
              <p className="text-xs font-semibold text-foreground mt-0.5">
                사건번호: {caseNum}
              </p>
            )}
            <p className="text-xs mt-2 text-muted-foreground line-clamp-3">
              {getIssuePreview(item)}
            </p>
            {legalFocusBadges && legalFocusBadges.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {legalFocusBadges}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1 items-end shrink-0">
            <Badge className={RESULT_COLORS[item.decision_result] || ""}>
              {RESULT_LABELS[item.decision_result as DecisionResult] || item.decision_result}
            </Badge>
          </div>
        </div>
      </Card>
    </Link>
  );
}

function SearchBucketSection({
  title,
  bucket,
  source,
  summary,
  error,
}: {
  title: string;
  bucket?: SearchBucket;
  source: "baseline" | "candidate";
  summary: string;
  error?: string;
}) {
  return (
    <div className="rounded-2xl border bg-card/40 p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground mt-1">{summary}</p>
        </div>
        <span className="text-sm text-muted-foreground">{bucket?.total?.toLocaleString() || 0}건</span>
      </div>
      {error && (
        <Card className="p-3 mb-3 text-xs text-amber-700 border-amber-200 bg-amber-50">
          {source === "candidate" ? "AI 검색" : "기본 검색"} 경고: {error}
        </Card>
      )}
      <div className="space-y-3">
        {(bucket?.items || []).map((item) => (
          <SearchResultCard key={`${source}-${item.id}`} item={item} />
        ))}
        {(!bucket || bucket.items.length === 0) && (
          <Card className="p-4 text-sm text-muted-foreground">
            {source === "candidate"
              ? "AI 검색 결과가 없습니다. 현재는 질의 기반 검색 비중이 높아 검색어 없이 사유만 고르면 비어 있을 수 있습니다."
              : "결과가 없습니다."}
          </Card>
        )}
      </div>
    </div>
  );
}

function SearchContentInner({
  initialParamsString,
  initialQuery,
  initialReason,
  initialResult,
  initialMode,
  initialPage,
}: {
  initialParamsString: string;
  initialQuery: string;
  initialReason: ReasonCategory | "";
  initialResult: DecisionResult | "";
  initialMode: SearchMode;
  initialPage: number;
}) {
  const router = useRouter();

  const [queryInput, setQueryInput] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [reason, setReason] = useState<ReasonCategory | "">(initialReason);
  const [result, setResult] = useState<DecisionResult | "">(initialResult);
  const [mode, setMode] = useState<SearchMode>(initialMode);
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [payload, setPayload] = useState<SearchResponsePayload | null>(null);

  function syncUrl(next: {
    q?: string;
    reason?: ReasonCategory | "";
    result?: DecisionResult | "";
    mode?: SearchMode;
    page?: number;
  }) {
    const params = new URLSearchParams(initialParamsString);
    const q = next.q ?? query;
    const nextReason = next.reason ?? reason;
    const nextResult = next.result ?? result;
    const nextMode = next.mode ?? mode;
    const nextPage = next.page ?? page;

    if (q) params.set("q", q);
    else params.delete("q");
    if (nextReason) params.set("reason", nextReason);
    else params.delete("reason");
    if (nextResult) params.set("result", nextResult);
    else params.delete("result");
    params.set("mode", nextMode);
    if (nextPage > 0) params.set("page", String(nextPage));
    else params.delete("page");

    router.replace(`/search?${params.toString()}`);
  }

  useEffect(() => {
    let aborted = false;

    async function fetchSearch() {
      const requestContext = {
        mode,
        query,
        reason,
        result,
      };
      const params = new URLSearchParams({
        q: query,
        mode,
        page: String(page),
      });
      if (reason) params.set("reason", reason);
      if (result) params.set("result", result);
      const cacheKey = params.toString();
      const cached = responseCache.get(cacheKey);
      const isCacheFresh = cached && Date.now() - cached.savedAt < SEARCH_CACHE_TTL_MS;

      if (isCacheFresh) {
        setPayload(cached.payload);
        setLoading(false);
        setIsRefreshing(true);
      } else {
        setLoading(true);
        setIsRefreshing(false);
      }

      const resp = await fetch(`/api/search?${params.toString()}`, { cache: "no-store" });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(
          typeof data?.error === "string" ? data.error : `search request failed (${resp.status})`
        );
      }

      const normalized = normalizeSearchPayload(data, requestContext);
      if (!aborted) {
        responseCache.set(cacheKey, { payload: normalized, savedAt: Date.now() });
        setPayload(normalized);
        setLoading(false);
        setIsRefreshing(false);
      }
    }

    fetchSearch().catch((error) => {
      if (!aborted) {
        setPayload(
          normalizeSearchPayload(
            {
              baselineError: mode !== "candidate" ? (error instanceof Error ? error.message : "search failed") : undefined,
              candidateError: mode !== "baseline" ? (error instanceof Error ? error.message : "search failed") : undefined,
            },
            { mode, query, reason, result }
          )
        );
        setLoading(false);
        setIsRefreshing(false);
      }
    });
    return () => {
      aborted = true;
    };
  }, [query, reason, result, page, mode]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(0);
    setQuery(queryInput);
    syncUrl({ q: queryInput, page: 0 });
  }

  function handleModeChange(nextMode: SearchMode) {
    setMode(nextMode);
    setPage(0);
    syncUrl({ mode: nextMode, page: 0 });
  }

  const baselineBucket = payload?.baseline;
  const candidateBucket = payload?.candidate;
  const hasActiveFilters = Boolean(query || reason || result || page > 0 || mode !== "baseline");

  function resetSearch() {
    setQueryInput("");
    setQuery("");
    setReason("");
    setResult("");
    setMode("baseline");
    setPage(0);
    router.replace("/search");
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <Link href="/" className="text-sm text-muted-foreground hover:text-primary mb-4 inline-block">
          &larr; 홈으로
        </Link>

        <h1 className="text-2xl font-bold mb-3">판정례 검색</h1>
        <p className="text-sm text-muted-foreground mb-6">
          키워드 또는 사유를 선택하여 판정례를 검색합니다.
        </p>

        <div className="flex gap-2 mb-6">
          <SearchModeButton active={mode === "baseline"} onClick={() => handleModeChange("baseline")}>
            기본 검색
          </SearchModeButton>
          <SearchModeButton active={mode === "candidate"} onClick={() => handleModeChange("candidate")}>
            AI 검색
          </SearchModeButton>
          <SearchModeButton active={mode === "compare"} onClick={() => handleModeChange("compare")}>
            비교
          </SearchModeButton>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2 mb-6">
          <Input
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="키워드 검색 (예: 무단결근 절차위반, 괴롭힘 신고 보복, 정규직 저성과)"
            className="flex-1"
          />
          <Button type="submit">검색</Button>
          <Button type="button" variant="outline" onClick={resetSearch} disabled={!hasActiveFilters}>
            초기화
          </Button>
        </form>

        <div className="flex flex-wrap gap-4 mb-6">
          <div>
            <label className="text-sm font-medium mb-1 block">사유</label>
            <select
              className="border rounded px-3 py-2 text-sm"
              value={reason}
              onChange={(e) => {
                const next = e.target.value as ReasonCategory | "";
                setReason(next);
                setPage(0);
                syncUrl({ reason: next, page: 0 });
              }}
            >
              <option value="">전체</option>
              {Object.entries(REASON_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">판정결과</label>
            <select
              className="border rounded px-3 py-2 text-sm"
              value={result}
              onChange={(e) => {
                const next = e.target.value as DecisionResult | "";
                setResult(next);
                setPage(0);
                syncUrl({ result: next, page: 0 });
              }}
            >
              <option value="">전체</option>
              {Object.entries(RESULT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <p className="text-sm text-muted-foreground">
            {loading
              ? "검색 중..."
              : isRefreshing
                ? `${getResultCountLabel(mode, payload)} · 최신 결과 확인 중...`
                : getResultCountLabel(mode, payload)}
          </p>
          {hasActiveFilters ? (
            <p className="text-xs text-muted-foreground">
              현재 조건: {query ? `검색어 \"${query}\"` : "검색어 없음"}
              {reason ? ` · 사유 ${REASON_LABELS[reason]}` : ""}
              {result ? ` · 결과 ${RESULT_LABELS[result]}` : ""}
              {mode !== "baseline" ? ` · ${getModeLabel(mode)}` : ""}
            </p>
          ) : null}
        </div>

        {IS_DEV ? (
          <div className="rounded-2xl border bg-muted/30 p-4 mb-6">
            <div className="flex flex-wrap gap-2 mb-3">
              <SectionPill>{getModeLabel(mode)}</SectionPill>
              <SectionPill>검색어: {query || "없음"}</SectionPill>
              <SectionPill>사유: {reason ? REASON_LABELS[reason] : "전체"}</SectionPill>
              <SectionPill>판정결과: {result ? RESULT_LABELS[result] : "전체"}</SectionPill>
              {getDebugScenarioLabel(payload) ? <SectionPill>시나리오: {getDebugScenarioLabel(payload)}</SectionPill> : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {getModeDescription(mode)}
            </p>
            {payload?.debug ? (
              <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
                {payload.debug.baseline ? (
                  <div>baseline top ids: {payload.debug.baseline.top_ids.join(", ") || "없음"}</div>
                ) : null}
                {payload.debug.candidate ? (
                  <div>
                    candidate top ids: {payload.debug.candidate.top_ids.join(", ") || "없음"} / primary:{" "}
                    {payload.debug.candidate.intended_primary.join(", ") || "없음"}
                  </div>
                ) : null}
                {payload.debug.candidate?.top_score_reasons?.length ? (
                  <div>candidate score reasons: {payload.debug.candidate.top_score_reasons.join(" | ")}</div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {mode === "compare" ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SearchBucketSection
              title="기본 검색"
              bucket={baselineBucket}
              source="baseline"
              summary="사유 분류 기반 검색"
              error={payload?.baselineError}
            />
            <SearchBucketSection
              title="AI 검색"
              bucket={candidateBucket}
              source="candidate"
              summary="AI 정밀 분류 기반 검색"
              error={payload?.candidateError}
            />
          </div>
        ) : mode === "candidate" ? (
          <SearchBucketSection
            title="AI 검색"
            bucket={candidateBucket}
            source="candidate"
            summary="AI 정밀 분류 기반 검색"
            error={payload?.candidateError}
          />
        ) : (
          <SearchBucketSection
            title="기본 검색"
            bucket={baselineBucket}
            source="baseline"
            summary="사유 분류 기반 검색"
            error={payload?.baselineError}
          />
        )}

        {payload?.molab && payload.molab.length > 0 && (
          <div className="mt-8 rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
            <h2 className="text-sm font-semibold text-blue-800 mb-3">
              관련 행정해석 ({payload.molab.length}건)
            </h2>
            <div className="space-y-3">
              {payload.molab.map((item) => (
                <Card key={item.id} className="p-4 bg-white border-blue-100">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm line-clamp-2">{item.title}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {item.case_number || ""} {item.decision_date ? `· ${item.decision_date}` : ""}
                      </p>
                      {item.inquiry_summary && (
                        <p className="text-xs text-muted-foreground mt-2">
                          <span className="font-medium text-blue-700">질의</span>{" "}
                          {item.inquiry_summary.length > 150 ? `${item.inquiry_summary.slice(0, 150)}...` : item.inquiry_summary}
                        </p>
                      )}
                      {item.answer_summary && (
                        <p className="text-xs mt-1">
                          <span className="font-medium text-blue-700">회시</span>{" "}
                          {item.answer_summary.length > 200 ? `${item.answer_summary.slice(0, 200)}...` : item.answer_summary}
                        </p>
                      )}
                    </div>
                  </div>
                  {item.keywords_matched && item.keywords_matched.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {item.keywords_matched.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </div>
        )}

        {mode === "baseline" && baselineBucket && baselineBucket.total > baselineBucket.pageSize && (
          <div className="flex justify-center gap-2 mt-8">
            <Button
              variant="outline"
              disabled={page === 0}
              onClick={() => {
                const next = page - 1;
                setPage(next);
                syncUrl({ page: next });
              }}
            >
              이전
            </Button>
            <span className="flex items-center text-sm text-muted-foreground">
              {page + 1} / {Math.ceil(baselineBucket.total / baselineBucket.pageSize)}
            </span>
            <Button
              variant="outline"
              disabled={(page + 1) * baselineBucket.pageSize >= baselineBucket.total}
              onClick={() => {
                const next = page + 1;
                setPage(next);
                syncUrl({ page: next });
              }}
            >
              다음
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}

function SearchContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const initialReason = (searchParams.get("reason") as ReasonCategory) || "";
  const initialResult = (searchParams.get("result") as DecisionResult) || "";
  const initialMode = (searchParams.get("mode") as SearchMode) || "baseline";
  const initialPage = Number(searchParams.get("page") || "0");

  return (
    <SearchContentInner
      key={searchParams.toString()}
      initialParamsString={searchParams.toString()}
      initialQuery={initialQuery}
      initialReason={initialReason}
      initialResult={initialResult}
      initialMode={initialMode}
      initialPage={initialPage}
    />
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-8">로딩 중...</div>}>
      <SearchContent />
    </Suspense>
  );
}
