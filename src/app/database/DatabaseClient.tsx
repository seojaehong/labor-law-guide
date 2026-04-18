'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Loader2, ArrowRight, MessageSquare, Filter, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

import type { TabType, CaseResult, AdminResult, NlrcResult, DatabaseClientProps } from './_components/types';
import { TABS, PAGE_SIZE, SEARCH_LIMIT, SUGGESTED_KEYWORDS, REASON_CATEGORY_LABELS } from './_components/types';
import { dedupeResults } from './_components/utils';

const COURT_LEVELS = [
  { key: '대법원', label: '대법원' },
  { key: '고등법원', label: '고등법원' },
  { key: '지방법원', label: '지방법원' },
] as const;

const NLRC_CASE_TYPES = [
  { key: '부당해고', label: '부당해고' },
  { key: '행정', label: '행정' },
  { key: '민사', label: '민사' },
  { key: '형사', label: '형사' },
  { key: '부당노동', label: '부당노동행위' },
] as const;
import CaseCard from './_components/CaseCard';
import AdminCard from './_components/AdminCard';
import NlrcCard from './_components/NlrcCard';

export default function DatabaseClient(props: DatabaseClientProps) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-accent)' }} /></div>}>
      <DatabaseContent {...props} />
    </Suspense>
  );
}

function DatabaseContent({ initialTotalCases, initialTotalAdmin, initialTotalNlrc }: DatabaseClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [activeTab, setActiveTab] = useState<TabType>((searchParams.get('tab') as TabType) || 'cases');
  const [loading, setLoading] = useState(false);
  const [cases, setCases] = useState<CaseResult[]>([]);
  const [admins, setAdmins] = useState<AdminResult[]>([]);
  const [nlrcResults, setNlrcResults] = useState<NlrcResult[]>([]);
  const [page, setPage] = useState(Number(searchParams.get('p')) || 1);
  const [hasMore, setHasMore] = useState(false);
  const [searchTotal, setSearchTotal] = useState<number | null>(null);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [totalCases, setTotalCases] = useState<number | null>(initialTotalCases);
  const [totalAdmin, setTotalAdmin] = useState<number | null>(initialTotalAdmin);
  const [totalNlrc, setTotalNlrc] = useState<number | null>(initialTotalNlrc ?? null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterCourt, setFilterCourt] = useState<string | null>(null);
  const [filterCaseType, setFilterCaseType] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false);

  useEffect(() => {
    if (totalCases === null) {
      supabase.from('cases').select('id', { count: 'exact', head: true }).then(({ count }) => setTotalCases(count));
    }
    if (totalAdmin === null) {
      supabase.from('admin_interpretations').select('id', { count: 'exact', head: true }).then(({ count }) => setTotalAdmin(count));
    }
    if (totalNlrc === null) {
      supabase.from('nlrc_decisions').select('id', { count: 'exact', head: true }).then(({ count }) => setTotalNlrc(count));
    }
  }, [totalAdmin, totalCases, totalNlrc]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateUrl = useCallback((q: string, tab: TabType, p: number) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (tab !== 'cases') params.set('tab', tab);
    if (p > 1) params.set('p', String(p));
    const qs = params.toString();
    router.replace(qs ? `/database?${qs}` : '/database', { scroll: false });
  }, [router]);

  const search = useCallback(async (q: string, tab: TabType, p: number) => {
    const trimmed = q.trim();
    if (!trimmed || trimmed.length < 2 || /^[%_\\]+$/.test(trimmed)) return;
    setLoading(true);
    setSearched(true);
    setSearchTotal(null);
    const offset = (p - 1) * PAGE_SIZE;

    const tableMap = { cases: 'cases', admin: 'admin_interpretations', nlrc: 'nlrc_decisions' } as const;
    const safeQ = trimmed.replace(/[%_\\,().]/g, '');
    const countFilter = tab === 'nlrc'
      ? `title.ilike.%${safeQ}%,holding_summary.ilike.%${safeQ}%,key_issue.ilike.%${safeQ}%`
      : `title.ilike.%${safeQ}%,summary.ilike.%${safeQ}%,holding_points.ilike.%${safeQ}%`;
    const countPromise = supabase
      .from(tableMap[tab])
      .select('id', { count: 'exact', head: true })
      .or(countFilter)
      .then(({ count }) => setSearchTotal(count));

    try {
      setSearchError(null);
      const rpcQuery = trimmed.replace(/[%_\\'"();]/g, '');
      if (!rpcQuery || rpcQuery.length < 2) return;

      if (tab === 'cases') {
        const { data, error } = await supabase.rpc('search_cases', {
          query: rpcQuery, result_limit: SEARCH_LIMIT + 1, page_offset: offset,
        });
        if (error) throw error;
        if (data) {
          const typed = data as unknown as CaseResult[];
          const deduped = dedupeResults(typed, (item) => item.case_number || item.id);
          setHasMore(typed.length > SEARCH_LIMIT || deduped.length > PAGE_SIZE);
          setCases(deduped.slice(0, PAGE_SIZE));
        }
      } else if (tab === 'admin') {
        const { data, error } = await supabase.rpc('search_admin', {
          query: rpcQuery, result_limit: SEARCH_LIMIT + 1, page_offset: offset,
        });
        if (error) throw error;
        if (data) {
          const typed = data as unknown as AdminResult[];
          const deduped = dedupeResults(typed, (item) => item.doc_number || item.id);
          setHasMore(typed.length > SEARCH_LIMIT || deduped.length > PAGE_SIZE);
          setAdmins(deduped.slice(0, PAGE_SIZE));
        }
      } else {
        const { data, error } = await supabase.rpc('search_nlrc', {
          query: rpcQuery, result_limit: SEARCH_LIMIT + 1, page_offset: offset,
        });
        if (error) throw error;
        if (data) {
          const typed = data as unknown as NlrcResult[];
          const deduped = dedupeResults(typed, (item) => item.case_number || item.id);
          setHasMore(typed.length > SEARCH_LIMIT || deduped.length > PAGE_SIZE);
          setNlrcResults(deduped.slice(0, PAGE_SIZE));
        }
      }
      await countPromise;
    } catch {
      setSearchError('검색 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  }, []);

  const browse = useCallback(async (tab: TabType, p: number, opts: { category?: string | null; court?: string | null; caseType?: string | null } = {}) => {
    setLoading(true);
    setBrowsing(true);
    setSearched(true);
    setSearchTotal(null);
    setSearchError(null);
    const offset = (p - 1) * PAGE_SIZE;

    try {
      if (tab === 'nlrc') {
        let q = supabase.from('nlrc_decisions')
          .select('id, case_number, title, department, decision_date, case_type, decision_result, reason_category, holding_points, holding_summary, summary_short, key_issue', { count: 'exact' })
          .order('decision_date', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);
        if (opts.category) q = q.contains('reason_category', [opts.category]);
        if (opts.caseType) q = q.eq('case_type', opts.caseType);
        const { data, count, error } = await q;
        if (error) throw error;
        setNlrcResults((data || []) as unknown as NlrcResult[]);
        setSearchTotal(count);
        setHasMore((count || 0) > offset + PAGE_SIZE);
      } else if (tab === 'cases') {
        let q = supabase.from('cases')
          .select('id, case_number, court, title, decision_date, case_type, verdict_type, summary, summary_short, key_issue, holding_summary, holding_points', { count: 'exact' })
          .order('decision_date', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);
        if (opts.court) q = q.ilike('court', `%${opts.court}%`);
        const { data, count, error } = await q;
        if (error) throw error;
        setCases((data || []) as unknown as CaseResult[]);
        setSearchTotal(count);
        setHasMore((count || 0) > offset + PAGE_SIZE);
      } else {
        let q = supabase.from('admin_interpretations')
          .select('id, title, doc_number, decision_date, summary, summary_short, key_issue, holding_points', { count: 'exact' })
          .order('decision_date', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);
        const { data, count, error } = await q;
        if (error) throw error;
        setAdmins((data || []) as unknown as AdminResult[]);
        setSearchTotal(count);
        setHasMore((count || 0) > offset + PAGE_SIZE);
      }
    } catch {
      setSearchError('조회 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const q = searchParams.get('q');
    const tab = (searchParams.get('tab') as TabType) || 'cases';
    const currentPage = Number(searchParams.get('p')) || 1;
    if (q && q.length >= 2) {
      search(q, tab, currentPage);
    }
  }, [search, searchParams]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setExpandedIds(new Set());
    updateUrl(query, activeTab, 1);
    search(query, activeTab, 1);
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setPage(1);
    setExpandedIds(new Set());
    setFilterCategory(null);
    setFilterCourt(null);
    setFilterCaseType(null);
    setBrowsing(false);
    setSearched(false);
    updateUrl(query, tab, 1);
    if (query.length >= 2) search(query, tab, 1);
  };

  const handleFilterCategory = (cat: string) => {
    const next = filterCategory === cat ? null : cat;
    setFilterCategory(next);
    setPage(1);
    setExpandedIds(new Set());
    if (next || filterCaseType) {
      browse(activeTab, 1, { category: next, caseType: filterCaseType });
    } else {
      setSearched(false);
      setBrowsing(false);
    }
  };

  const handleFilterCourt = (court: string) => {
    const next = filterCourt === court ? null : court;
    setFilterCourt(next);
    setPage(1);
    setExpandedIds(new Set());
    if (next) {
      browse(activeTab, 1, { court: next });
    } else {
      setSearched(false);
      setBrowsing(false);
    }
  };

  const handleFilterCaseType = (ct: string) => {
    const next = filterCaseType === ct ? null : ct;
    setFilterCaseType(next);
    setPage(1);
    setExpandedIds(new Set());
    if (next || filterCategory) {
      browse(activeTab, 1, { category: filterCategory, caseType: next });
    } else {
      setSearched(false);
      setBrowsing(false);
    }
  };

  const clearFilters = () => {
    setFilterCategory(null);
    setFilterCourt(null);
    setFilterCaseType(null);
    setBrowsing(false);
    setSearched(false);
  };

  const handlePage = (nextPage: number) => {
    setPage(nextPage);
    setExpandedIds(new Set());
    if (browsing) {
      browse(activeTab, nextPage, { category: filterCategory, court: filterCourt, caseType: filterCaseType });
    } else {
      updateUrl(query, activeTab, nextPage);
      search(query, activeTab, nextPage);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const currentResults = activeTab === 'cases' ? cases : activeTab === 'admin' ? admins : nlrcResults;
  const suggestedKeywords = SUGGESTED_KEYWORDS[activeTab];

  const handleKeywordClick = (keyword: string) => {
    setQuery(keyword);
    setPage(1);
    updateUrl(keyword, activeTab, 1);
    search(keyword, activeTab, 1);
  };

  return (
    <section className="mt-8 rounded-3xl border p-5 md:p-7" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>실시간 검색</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            판례 {totalCases !== null ? totalCases.toLocaleString() : '...'}건, 행정해석 {totalAdmin !== null ? totalAdmin.toLocaleString() : '...'}건, 노동위결정문 {totalNlrc !== null ? totalNlrc.toLocaleString() : '...'}건을 바로 찾아보세요.
          </p>
        </div>
        <Link
          href="/cases"
          className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--grey-50)]"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          핵심판례 6선 보기 <ArrowRight size={14} />
        </Link>
      </div>

      <form onSubmit={handleSearch} className="mt-6">
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--grey-400)' }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="검색어를 입력하세요 (예: 사용자성, 단체교섭, 파견)"
            aria-label="판례·행정해석·노동위결정문 검색"
            className="w-full rounded-xl border py-3 pl-11 pr-4 text-[15px] outline-none transition-all focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2 focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}
          />
        </div>
      </form>

      <div className="mt-5 flex gap-2" role="tablist" aria-label="검색 데이터 유형">
        {TABS.map((tab) => {
          const count = tab.key === 'cases' ? totalCases : tab.key === 'admin' ? totalAdmin : totalNlrc;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              aria-controls={`tabpanel-${tab.key}`}
              onClick={() => handleTabChange(tab.key)}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              style={{
                backgroundColor: activeTab === tab.key ? 'var(--color-accent)' : 'var(--color-bg-surface)',
                color: activeTab === tab.key ? '#fff' : 'var(--color-text-secondary)',
                border: activeTab === tab.key ? 'none' : '1px solid var(--color-border)',
              }}
            >
              {tab.icon}
              {tab.label}
              {count !== null && (
                <span className="ml-1 text-xs opacity-80">
                  {count.toLocaleString()}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === 'nlrc' && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
              <Filter size={12} /> 유형별
            </span>
            {Object.entries(REASON_CATEGORY_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => handleFilterCategory(key)}
                className="rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: filterCategory === key ? 'var(--color-accent)' : 'transparent',
                  color: filterCategory === key ? '#fff' : 'var(--color-text-secondary)',
                  border: `1px solid ${filterCategory === key ? 'var(--color-accent)' : 'var(--color-border)'}`,
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
              <Filter size={12} /> 사건유형
            </span>
            {NLRC_CASE_TYPES.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => handleFilterCaseType(key)}
                className="rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: filterCaseType === key ? 'var(--color-accent)' : 'transparent',
                  color: filterCaseType === key ? '#fff' : 'var(--color-text-secondary)',
                  border: `1px solid ${filterCaseType === key ? 'var(--color-accent)' : 'var(--color-border)'}`,
                }}
              >
                {label}
              </button>
            ))}
            {(filterCategory || filterCaseType) && (
              <button onClick={clearFilters} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
                <X size={12} /> 초기화
              </button>
            )}
          </div>
        </div>
      )}

      {activeTab === 'cases' && (
        <div className="mt-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
              <Filter size={12} /> 법원급
            </span>
            {COURT_LEVELS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => handleFilterCourt(key)}
                className="rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: filterCourt === key ? 'var(--color-accent)' : 'transparent',
                  color: filterCourt === key ? '#fff' : 'var(--color-text-secondary)',
                  border: `1px solid ${filterCourt === key ? 'var(--color-accent)' : 'var(--color-border)'}`,
                }}
              >
                {label}
              </button>
            ))}
            {filterCourt && (
              <button onClick={clearFilters} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
                <X size={12} /> 초기화
              </button>
            )}
          </div>
        </div>
      )}

      {activeTab === 'admin' && (
        <p className="mt-3 text-sm leading-6" style={{ color: 'var(--color-text-secondary)' }}>
          공개 행정해석은 현재 제도 중심 자료가 많아 &apos;사용자성&apos;, &apos;원청&apos;보다 &apos;단체교섭&apos;, &apos;교섭창구&apos;, &apos;부당노동행위&apos; 같은 키워드에서 더 안정적으로 결과가 나옵니다.
        </p>
      )}
      {activeTab === 'nlrc' && (
        <p className="mt-3 text-sm leading-6" style={{ color: 'var(--color-text-secondary)' }}>
          노동위원회 결정문 중 노사관계 관련 판정사례입니다. 부당노동행위, 단체협약, 교섭 관련 결정문을 검색할 수 있습니다.
        </p>
      )}

      <div className="mt-6">
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-xl border p-4" style={{ borderColor: 'var(--color-border)' }}>
                <div className="h-4 w-3/4 rounded" style={{ backgroundColor: 'var(--grey-100)' }} />
                <div className="mt-3 h-3 w-1/2 rounded" style={{ backgroundColor: 'var(--grey-50)' }} />
                <div className="mt-2 h-3 w-full rounded" style={{ backgroundColor: 'var(--grey-50)' }} />
                <div className="mt-2 h-3 w-5/6 rounded" style={{ backgroundColor: 'var(--grey-50)' }} />
                <div className="mt-3 flex gap-1">
                  <div className="h-5 w-16 rounded-full" style={{ backgroundColor: 'var(--grey-100)' }} />
                  <div className="h-5 w-12 rounded-full" style={{ backgroundColor: 'var(--grey-100)' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {searchError && (
          <div className="py-12 text-center">
            <p className="text-lg" style={{ color: 'var(--color-text-secondary)' }}>{searchError}</p>
            <button
              onClick={() => search(query, activeTab, page)}
              className="mt-4 rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: 'var(--color-accent)' }}
            >
              다시 시도
            </button>
          </div>
        )}

        {!loading && !searchError && searched && currentResults.length === 0 && (
          <div className="py-20 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
            <p className="text-lg">검색 결과가 없습니다.</p>
            <p className="mt-2 text-sm">
              {activeTab === 'admin'
                ? '행정해석은 제도 키워드 위주로 다시 검색해보세요.'
                : '다른 검색어를 시도해보세요.'}
            </p>
            <KeywordSuggestions keywords={suggestedKeywords} onClick={handleKeywordClick} />
          </div>
        )}

        {!loading && !searched && (
          <div className="py-16 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
            <Search size={40} className="mx-auto mb-3 opacity-30" />
            <p>검색어를 입력하거나 위 필터를 선택해 탐색하세요.</p>
            <KeywordSuggestions keywords={suggestedKeywords} onClick={handleKeywordClick} />
          </div>
        )}

        {!loading && searched && currentResults.length > 0 && (
          <p className="mb-3 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
            {searchTotal !== null ? (
              <>총 <strong>{searchTotal.toLocaleString()}</strong>건 중 {((page - 1) * PAGE_SIZE + 1)}~{((page - 1) * PAGE_SIZE + currentResults.length)}건 표시</>
            ) : (
              <>검색 결과 {currentResults.length}건 표시</>
            )}
          </p>
        )}

        {!loading && currentResults.length > 0 && (
          <div className="space-y-3">
            {activeTab === 'cases' && cases.map((item) => (
              <CaseCard key={item.id} item={item} query={query} expanded={expandedIds.has(item.id)} onToggle={() => toggleExpand(item.id)} />
            ))}
            {activeTab === 'admin' && admins.map((item) => (
              <AdminCard key={item.id} item={item} query={query} expanded={expandedIds.has(item.id)} onToggle={() => toggleExpand(item.id)} />
            ))}
            {activeTab === 'nlrc' && nlrcResults.map((item) => (
              <NlrcCard key={item.id} item={item} query={query} expanded={expandedIds.has(item.id)} onToggle={() => toggleExpand(item.id)} />
            ))}
          </div>
        )}

        {!loading && currentResults.length > 0 && (page > 1 || hasMore) && (
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              disabled={page <= 1}
              onClick={() => handlePage(page - 1)}
              className="rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-[var(--grey-50)] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ borderColor: 'var(--color-border)' }}
            >
              ← 이전
            </button>
            <span className="text-sm tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
              {page}{searchTotal !== null && ` / ${Math.max(1, Math.ceil(searchTotal / PAGE_SIZE))}`} 페이지
            </span>
            <button
              disabled={!hasMore}
              onClick={() => handlePage(page + 1)}
              className="rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-[var(--grey-50)] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ borderColor: 'var(--color-border)' }}
            >
              다음 →
            </button>
          </div>
        )}

        {searched && currentResults.length > 0 && (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <Link
              href={`/ai?q=${encodeURIComponent(query)}`}
              className="flex items-center gap-3 rounded-xl border p-5 transition-shadow hover:shadow-md"
              style={{ borderColor: 'var(--color-accent)', backgroundColor: 'var(--blue-50)' }}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--color-accent)' }}>
                <MessageSquare size={18} style={{ color: 'white' }} />
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>AI에게 해석 물어보기</p>
                <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>검색 결과를 기반으로 AI가 쉽게 풀어드립니다</p>
              </div>
            </Link>
            <Link
              href="/contact"
              className="flex items-center gap-3 rounded-xl border p-5 transition-shadow hover:shadow-md"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: '#191f28' }}>
                <ArrowRight size={18} style={{ color: 'white' }} />
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>전문가에게 직접 상담</p>
                <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>구체적인 사안은 노무법인 위너스가 직접 봅니다</p>
              </div>
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

function KeywordSuggestions({ keywords, onClick }: { keywords: string[]; onClick: (kw: string) => void }) {
  return (
    <div className="mt-4 flex flex-wrap justify-center gap-2">
      {keywords.map((keyword) => (
        <button
          key={keyword}
          onClick={() => onClick(keyword)}
          className="rounded-full border px-3 py-1 text-sm transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          {keyword}
        </button>
      ))}
    </div>
  );
}
