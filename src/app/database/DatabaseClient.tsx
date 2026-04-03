'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Scale, FileText, Landmark, ChevronDown, ChevronUp, Loader2, ExternalLink, ArrowRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '@/lib/supabase';

type TabType = 'cases' | 'admin' | 'nlrc';

interface CaseResult {
  id: string;
  case_number: string;
  court: string;
  title: string;
  decision_date: string;
  case_type: string;
  verdict_type?: string | null;
  keywords_matched?: string[] | null;
  reason_category?: string[] | null;
  summary?: string | null;
  summary_short?: string | null;
  key_issue?: string | null;
  holding_summary?: string | null;
  holding_points?: string | null;
  url?: string;
  relevance?: number;
}

interface AdminResult {
  id: string;
  title: string;
  doc_number: string;
  decision_date: string;
  keywords_matched?: string[] | null;
  summary?: string | null;
  summary_short?: string | null;
  key_issue?: string | null;
  holding_points?: string | null;
  url?: string;
}

interface NlrcResult {
  id: string;
  serial_number: string;
  case_number: string;
  title: string;
  department: string;
  decision_date: string;
  case_type: string;
  decision_result: string;
  keywords_matched?: string[] | null;
  reason_category?: string[] | null;
  holding_points?: string | null;
  holding_summary?: string | null;
  summary?: string | null;
  summary_short?: string | null;
  key_issue?: string | null;
  url?: string;
  relevance?: number;
}

interface DatabaseClientProps {
  initialTotalCases: number;
  initialTotalAdmin: number;
  initialTotalNlrc?: number;
}

const TABS: { key: TabType; label: string; icon: React.ReactNode }[] = [
  { key: 'cases', label: '판례', icon: <Scale size={16} /> },
  { key: 'admin', label: '행정해석', icon: <FileText size={16} /> },
  { key: 'nlrc', label: '노동위결정문', icon: <Landmark size={16} /> },
];

const PAGE_SIZE = 20;
const SEARCH_LIMIT = PAGE_SIZE * 3;
const REASON_CATEGORY_LABELS: Record<string, string> = {
  absence: '무단결근/태만',
  workplace_bullying: '직장내괴롭힘',
  probation: '수습해고',
  incompetence: '업무능력부족',
  contract_expiry: '갱신기대권/계약만료',
  transfer: '전보/인사이동',
  violence: '폭언/폭행',
  worker_status: '근로자성',
  sexual_harassment: '성희롱',
  embezzlement: '횡령/배임',
  misconduct: '비위행위',
  redundancy: '경영상해고',
  no_dismissal: '해고부존재/사직',
  discrimination: '차별시정',
  union_activity: '부당노동행위',
  other: '기타',
};
const SUGGESTED_KEYWORDS: Record<TabType, string[]> = {
  cases: ['사용자성', '원청', '단체교섭', '부당노동행위', '파견', '손해배상'],
  admin: ['단체교섭', '교섭창구', '부당노동행위', '파견', '손해배상', '과반수노동조합'],
  nlrc: ['부당노동행위', '단체협약', '교섭거부', '조합활동', '부당해고', '손해배상'],
};

function highlightText(text: string, query: string) {
  if (!query || query.length < 2 || !text) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} style={{ backgroundColor: 'var(--yellow-100, #fef9c3)', color: 'inherit', borderRadius: '2px', padding: '0 1px' }}>{part}</mark>
      : part
  );
}

function scoreResult(item: { decision_date?: string | null; summary?: string | null; holding_points?: string | null; title?: string | null }) {
  const summaryLength = item.summary?.trim().length || 0;
  const holdingLength = item.holding_points?.trim().length || 0;

  return (
    (item.decision_date ? 100 : 0) +
    Math.min(summaryLength, 600) +
    Math.min(holdingLength, 600) +
    (item.title?.trim() ? 20 : 0)
  );
}

function formatDecisionDate(value?: string | null) {
  if (!value) return null;
  const compact = value.replace(/[^\d]/g, '');
  if (compact.length === 8) {
    const year = compact.slice(0, 4);
    const month = compact.slice(4, 6);
    const day = compact.slice(6, 8);
    if (year === '0001') return null;
    return `${year}.${month}.${day}`;
  }

  const sliced = value.slice(0, 10).replace(/-/g, '.');
  return sliced || null;
}

function translateReasonCategory(code: string) {
  return REASON_CATEGORY_LABELS[code] || code;
}

function getPreferredSummary(item: {
  summary?: string | null;
  summary_short?: string | null;
  holding_summary?: string | null;
  key_issue?: string | null;
}) {
  return item.holding_summary || item.summary || item.summary_short || item.key_issue || '';
}

function getPreferredDetail(item: {
  holding_points?: string | null;
  key_issue?: string | null;
}) {
  return item.holding_points || item.key_issue || '';
}

function normalizeSnippetMarkdown(raw: string): string {
  return raw
    // Strip markdown headers → bold inline text
    .replace(/^#{1,4}\s+(.+)$/gm, '**$1**')
    // Add line break before Korean outline markers that run together (가. 나. 다. / ①②③)
    .replace(/([^\n])([가-힣]\.\s)/g, '$1\n\n$2')
    .replace(/([^\n])(①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩)/g, '$1\n$2')
    // Add line break before □ markers (used in nlrc decisions)
    .replace(/([^\n])(□\s)/g, '$1\n\n$2')
    // Collapse triple+ newlines to double
    .replace(/\n{3,}/g, '\n\n')
    // Remove leading/trailing whitespace per line (spacing fix)
    .replace(/^[ \t]+/gm, '')
    .trim();
}

function MarkdownSnippet({ value }: { value: string }) {
  const cleaned = normalizeSnippetMarkdown(value);
  return (
    <div className="break-words text-[13px] leading-6 [&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_li]:ml-4 [&_li]:list-disc [&_ol]:ml-4 [&_ol]:list-decimal">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--color-accent)' }} />,
          p: ({ children }) => <p>{children}</p>,
          ul: ({ children }) => <ul className="space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="space-y-1">{children}</ol>,
          h1: ({ children }) => <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{children}</p>,
          h2: ({ children }) => <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{children}</p>,
          h3: ({ children }) => <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{children}</p>,
          h4: ({ children }) => <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{children}</p>,
          strong: ({ children }) => <strong className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{children}</strong>,
          hr: () => <hr className="my-2 border-t" style={{ borderColor: 'var(--color-border)' }} />,
        }}
      >
        {cleaned}
      </ReactMarkdown>
    </div>
  );
}

function TagRow({ reasonCategory, keywordsMatched }: { reasonCategory?: string[] | null; keywordsMatched?: string[] | null }) {
  const translatedReasons = (reasonCategory || []).map(translateReasonCategory);
  const filteredKeywords = (keywordsMatched || []).filter((keyword) => !translatedReasons.includes(keyword));
  const visibleReasons = translatedReasons.slice(0, 4);
  const visibleKeywords = filteredKeywords.slice(0, 4);
  const hiddenCount = (translatedReasons.length - visibleReasons.length) + (filteredKeywords.length - visibleKeywords.length);

  if (visibleReasons.length === 0 && visibleKeywords.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {visibleReasons.map((label) => (
        <span key={`reason-${label}`} className="rounded-full px-2 py-0.5 text-[11px]" style={{ backgroundColor: 'var(--blue-50)', color: 'var(--blue-600)' }}>
          {label}
        </span>
      ))}
      {visibleKeywords.map((keyword) => (
        <span key={`keyword-${keyword}`} className="rounded-full px-2 py-0.5 text-[11px]" style={{ backgroundColor: 'var(--grey-100)', color: 'var(--grey-600)' }}>
          {keyword}
        </span>
      ))}
      {hiddenCount > 0 && (
        <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ backgroundColor: 'var(--grey-50)', color: 'var(--grey-400)' }}>
          +{hiddenCount}
        </span>
      )}
    </div>
  );
}

function dedupeResults<T extends { id: string; summary?: string | null; holding_points?: string | null; decision_date?: string | null; title?: string | null }>(
  items: T[],
  getKey: (item: T) => string,
) {
  const deduped: T[] = [];
  const indexByKey = new Map<string, number>();

  items.forEach((item) => {
    const key = getKey(item).trim();
    if (!key) {
      deduped.push(item);
      return;
    }

    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, deduped.length);
      deduped.push(item);
      return;
    }

    if (scoreResult(item) > scoreResult(deduped[existingIndex])) {
      deduped[existingIndex] = item;
    }
  });

  return deduped;
}

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
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [totalCases, setTotalCases] = useState<number | null>(initialTotalCases);
  const [totalAdmin, setTotalAdmin] = useState<number | null>(initialTotalAdmin);
  const [totalNlrc, setTotalNlrc] = useState<number | null>(initialTotalNlrc ?? null);

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
    if (!q || q.length < 2) return;
    setLoading(true);
    setSearched(true);
    setSearchTotal(null);
    const offset = (p - 1) * PAGE_SIZE;

    // 총 건수 조회 (ILIKE 기반, 병렬 실행)
    const tableMap = { cases: 'cases', admin: 'admin_interpretations', nlrc: 'nlrc_decisions' } as const;
    const summaryCol = tab === 'nlrc' ? 'holding_summary' : 'summary';
    const safeQ = q.replace(/[%_\\,().]/g, '');
    const countPromise = supabase
      .from(tableMap[tab])
      .select('id', { count: 'exact', head: true })
      .or(`title.ilike.%${safeQ}%,${summaryCol}.ilike.%${safeQ}%,holding_points.ilike.%${safeQ}%`)
      .then(({ count }) => setSearchTotal(count));

    try {
      if (tab === 'cases') {
        const { data, error } = await supabase.rpc('search_cases', {
          query: q, result_limit: SEARCH_LIMIT + 1, page_offset: offset,
        });
        if (!error && data) {
          const typed = data as unknown as CaseResult[];
          const deduped = dedupeResults(typed, (item) => item.case_number || item.id);
          setHasMore(typed.length > SEARCH_LIMIT || deduped.length > PAGE_SIZE);
          setCases(deduped.slice(0, PAGE_SIZE));
        }
      } else if (tab === 'admin') {
        const { data, error } = await supabase.rpc('search_admin', {
          query: q, result_limit: SEARCH_LIMIT + 1, page_offset: offset,
        });
        if (!error && data) {
          const typed = data as unknown as AdminResult[];
          const deduped = dedupeResults(typed, (item) => item.doc_number || item.id);
          setHasMore(typed.length > SEARCH_LIMIT || deduped.length > PAGE_SIZE);
          setAdmins(deduped.slice(0, PAGE_SIZE));
        }
      } else {
        const { data, error } = await supabase.rpc('search_nlrc', {
          query: q, result_limit: SEARCH_LIMIT + 1, page_offset: offset,
        });
        if (!error && data) {
          const typed = data as unknown as NlrcResult[];
          const deduped = dedupeResults(typed, (item) => item.case_number || item.id);
          setHasMore(typed.length > SEARCH_LIMIT || deduped.length > PAGE_SIZE);
          setNlrcResults(deduped.slice(0, PAGE_SIZE));
        }
      }
      await countPromise;
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
    updateUrl(query, tab, 1);
    if (query.length >= 2) search(query, tab, 1);
  };

  const handlePage = (nextPage: number) => {
    setPage(nextPage);
    setExpandedIds(new Set());
    updateUrl(query, activeTab, nextPage);
    search(query, activeTab, nextPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const currentResults = activeTab === 'cases' ? cases : activeTab === 'admin' ? admins : nlrcResults;
  const suggestedKeywords = SUGGESTED_KEYWORDS[activeTab];

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
            className="w-full rounded-xl border py-3 pl-11 pr-4 text-[15px] outline-none transition-all focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'white' }}
          />
        </div>
      </form>

      <div className="mt-5 flex gap-2">
        {TABS.map((tab) => {
          const count = tab.key === 'cases' ? totalCases : tab.key === 'admin' ? totalAdmin : totalNlrc;
          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              style={{
                backgroundColor: activeTab === tab.key ? 'var(--color-accent)' : 'white',
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

        {!loading && searched && currentResults.length === 0 && (
          <div className="py-20 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
            <p className="text-lg">검색 결과가 없습니다.</p>
            <p className="mt-2 text-sm">
              {activeTab === 'admin'
                ? '행정해석은 제도 키워드 위주로 다시 검색해보세요.'
                : '다른 검색어를 시도해보세요.'}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {suggestedKeywords.map((keyword) => (
                <button
                  key={keyword}
                  onClick={() => {
                    setQuery(keyword);
                    setPage(1);
                    updateUrl(keyword, activeTab, 1);
                    search(keyword, activeTab, 1);
                  }}
                  className="rounded-full border px-3 py-1 text-sm transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  {keyword}
                </button>
              ))}
            </div>
          </div>
        )}

        {!loading && !searched && (
          <div className="py-16 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
            <Search size={40} className="mx-auto mb-3 opacity-30" />
            <p>검색어를 입력하고 Enter를 눌러주세요.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {suggestedKeywords.map((keyword) => (
                <button
                  key={keyword}
                  onClick={() => {
                    setQuery(keyword);
                    setPage(1);
                    updateUrl(keyword, activeTab, 1);
                    search(keyword, activeTab, 1);
                  }}
                  className="rounded-full border px-3 py-1 text-sm transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  {keyword}
                </button>
              ))}
            </div>
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
      </div>
    </section>
  );
}

function CaseCard({ item, query, expanded, onToggle }: { item: CaseResult; query: string; expanded: boolean; onToggle: () => void }) {
  const formattedDate = formatDecisionDate(item.decision_date);
  const summaryText = getPreferredSummary(item);
  const detailText = getPreferredDetail(item);
  const hasContent = !!(summaryText || detailText);

  return (
    <div className="rounded-xl border p-4 transition-shadow hover:shadow-md" style={{ borderColor: 'var(--color-border)', backgroundColor: 'white' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md px-2 py-0.5 font-medium" style={{ backgroundColor: 'var(--blue-50)', color: 'var(--blue-600)' }}>
              {item.court || '법원 미상'}
            </span>
            {item.case_number && <span style={{ color: 'var(--color-text-tertiary)' }}>{item.case_number}</span>}
            {formattedDate && <span style={{ color: 'var(--color-text-tertiary)' }}>{formattedDate}</span>}
            {item.case_type && <span style={{ color: 'var(--color-text-tertiary)' }}>{item.case_type}</span>}
            {item.verdict_type && <span style={{ color: 'var(--color-text-tertiary)' }}>{item.verdict_type}</span>}
          </div>
          <h3 className="mt-1.5 text-[15px] font-semibold leading-snug" style={{ color: 'var(--color-text-primary)' }}>
            {highlightText(item.title, query)}
          </h3>
        </div>
      </div>

      <TagRow reasonCategory={item.reason_category} keywordsMatched={item.keywords_matched} />

      <div className="mt-2 flex items-center gap-3">
        {hasContent && (
          <button onClick={onToggle} className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--color-accent)' }}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? '접기' : '요지 보기'}
          </button>
        )}
        {item.url && (
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
            <ExternalLink size={12} /> 원문 참고
          </a>
        )}
      </div>

      {expanded && hasContent && (
        <div className="mt-2 space-y-3 rounded-lg p-3 text-[13px] leading-relaxed" style={{ backgroundColor: 'var(--grey-50)', color: 'var(--color-text-secondary)' }}>
          {summaryText ? (
            <div>
              <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>요지</p>
              <MarkdownSnippet value={summaryText} />
            </div>
          ) : null}
          {detailText ? (
            <div>
              <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>판시사항</p>
              <MarkdownSnippet value={detailText} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function AdminCard({ item, query, expanded, onToggle }: { item: AdminResult; query: string; expanded: boolean; onToggle: () => void }) {
  const formattedDate = formatDecisionDate(item.decision_date);
  const summaryText = getPreferredSummary(item);
  const detailText = getPreferredDetail(item);
  const hasContent = !!(summaryText || detailText);

  return (
    <div className="rounded-xl border p-4 transition-shadow hover:shadow-md" style={{ borderColor: 'var(--color-border)', backgroundColor: 'white' }}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-md px-2 py-0.5 font-medium" style={{ backgroundColor: 'var(--color-accent-light)', color: 'var(--color-accent)' }}>
          행정해석
        </span>
        {item.doc_number && <span style={{ color: 'var(--color-text-tertiary)' }}>{item.doc_number}</span>}
        {formattedDate && <span style={{ color: 'var(--color-text-tertiary)' }}>{formattedDate}</span>}
      </div>
      <h3 className="mt-1.5 text-[15px] font-semibold leading-snug" style={{ color: 'var(--color-text-primary)' }}>
        {highlightText(item.title, query)}
      </h3>

      <TagRow keywordsMatched={item.keywords_matched} />

      <div className="mt-2 flex items-center gap-3">
        {hasContent && (
          <button onClick={onToggle} className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--color-accent)' }}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? '접기' : '요약 보기'}
          </button>
        )}
        {item.url && (
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
            <ExternalLink size={12} /> 원문 참고
          </a>
        )}
      </div>

      {expanded && hasContent && (
        <div className="mt-2 space-y-3 rounded-lg p-3 text-[13px] leading-relaxed" style={{ backgroundColor: 'var(--grey-50)', color: 'var(--color-text-secondary)' }}>
          {summaryText ? (
            <div>
              <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>요약</p>
              <MarkdownSnippet value={summaryText} />
            </div>
          ) : null}
          {detailText ? (
            <div>
              <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>판단요지</p>
              <MarkdownSnippet value={detailText} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function NlrcCard({ item, query, expanded, onToggle }: { item: NlrcResult; query: string; expanded: boolean; onToggle: () => void }) {
  const formattedDate = formatDecisionDate(item.decision_date);
  const summaryText = getPreferredSummary(item);
  const detailText = getPreferredDetail(item);
  const hasContent = !!(summaryText || detailText);

  const resultColor = item.decision_result?.includes('인정')
    ? { bg: 'var(--blue-50)', fg: 'var(--blue-600)' }
    : item.decision_result?.includes('기각') || item.decision_result?.includes('각하')
    ? { bg: 'var(--grey-100)', fg: 'var(--grey-600)' }
    : { bg: 'var(--color-accent-light)', fg: 'var(--color-accent)' };

  return (
    <div className="rounded-xl border p-4 transition-shadow hover:shadow-md" style={{ borderColor: 'var(--color-border)', backgroundColor: 'white' }}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-md px-2 py-0.5 font-medium" style={{ backgroundColor: 'var(--color-accent-light)', color: 'var(--color-accent)' }}>
          {item.case_type}
        </span>
        {item.decision_result && (
          <span className="rounded-md px-2 py-0.5 font-medium" style={{ backgroundColor: resultColor.bg, color: resultColor.fg }}>
            {item.decision_result}
          </span>
        )}
        {item.case_number && <span style={{ color: 'var(--color-text-tertiary)' }}>{item.case_number}</span>}
        {formattedDate && <span style={{ color: 'var(--color-text-tertiary)' }}>{formattedDate}</span>}
        {item.department && <span style={{ color: 'var(--color-text-tertiary)' }}>{item.department}</span>}
      </div>
      <h3 className="mt-1.5 text-[15px] font-semibold leading-snug" style={{ color: 'var(--color-text-primary)' }}>
        {highlightText(item.title, query)}
      </h3>

      <TagRow reasonCategory={item.reason_category} keywordsMatched={item.keywords_matched} />

      <div className="mt-2 flex items-center gap-3">
        {hasContent && (
          <button onClick={onToggle} className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--color-accent)' }}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? '접기' : '판정요지 보기'}
          </button>
        )}
        {item.url && (
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
            <ExternalLink size={12} /> 원문 참고
          </a>
        )}
      </div>

      {expanded && hasContent && (
        <div className="mt-2 space-y-3 rounded-lg p-3 text-[13px] leading-relaxed" style={{ backgroundColor: 'var(--grey-50)', color: 'var(--color-text-secondary)' }}>
          {detailText ? (
            <div>
              <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>판정사항</p>
              <MarkdownSnippet value={detailText} />
            </div>
          ) : null}
          {summaryText ? (
            <div>
              <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>판정요지</p>
              <MarkdownSnippet value={summaryText} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
