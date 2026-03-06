'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Scale, FileText, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type TabType = 'cases' | 'admin';

interface CaseResult {
  id: string;
  case_number: string;
  court: string;
  title: string;
  decision_date: string;
  case_type: string;
  keywords_matched: string[];
  summary: string;
  holding_points: string;
  relevance?: number;
}

interface AdminResult {
  id: string;
  title: string;
  doc_number: string;
  decision_date: string;
  keywords_matched: string[];
  summary: string;
  holding_points: string;
}

const TABS: { key: TabType; label: string; icon: React.ReactNode }[] = [
  { key: 'cases', label: '판례', icon: <Scale size={16} /> },
  { key: 'admin', label: '행정해석', icon: <FileText size={16} /> },
];

const PAGE_SIZE = 20;

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

export default function DatabasePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-accent)' }} /></div>}>
      <DatabaseContent />
    </Suspense>
  );
}

function DatabaseContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [activeTab, setActiveTab] = useState<TabType>((searchParams.get('tab') as TabType) || 'cases');
  const [loading, setLoading] = useState(false);
  const [cases, setCases] = useState<CaseResult[]>([]);
  const [admins, setAdmins] = useState<AdminResult[]>([]);
  const [page, setPage] = useState(Number(searchParams.get('p')) || 1);
  const [hasMore, setHasMore] = useState(false);
  const [searched, setSearched] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [totalCases, setTotalCases] = useState<number | null>(null);
  const [totalAdmin, setTotalAdmin] = useState<number | null>(null);

  // 초기 건수 로드
  useEffect(() => {
    supabase.from('cases').select('id', { count: 'exact', head: true }).then(({ count }) => setTotalCases(count));
    supabase.from('admin_interpretations').select('id', { count: 'exact', head: true }).then(({ count }) => setTotalAdmin(count));
  }, []);

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
    const offset = (p - 1) * PAGE_SIZE;

    try {
      if (tab === 'cases') {
        const { data, error } = await supabase.rpc('search_cases', {
          query: q, result_limit: PAGE_SIZE + 1, page_offset: offset,
        });
        if (!error && data) {
          setHasMore(data.length > PAGE_SIZE);
          setCases(data.slice(0, PAGE_SIZE));
        }
      } else if (tab === 'admin') {
        const { data, error } = await supabase.rpc('search_admin', {
          query: q, result_limit: PAGE_SIZE + 1, page_offset: offset,
        });
        if (!error && data) {
          setHasMore(data.length > PAGE_SIZE);
          setAdmins(data.slice(0, PAGE_SIZE));
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // URL 파라미터로 초기 검색
  useEffect(() => {
    const q = searchParams.get('q');
    const tab = (searchParams.get('tab') as TabType) || 'cases';
    const p = Number(searchParams.get('p')) || 1;
    if (q && q.length >= 2) {
      search(q, tab, p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handlePage = (p: number) => {
    setPage(p);
    setExpandedIds(new Set());
    updateUrl(query, activeTab, p);
    search(query, activeTab, p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const currentResults = activeTab === 'cases' ? cases : admins;

  return (
    <div className="mx-auto max-w-[1000px] px-5 py-10">
      <h1 className="text-2xl font-bold md:text-3xl" style={{ color: 'var(--color-text-primary)' }}>
        판례·행정해석 검색
      </h1>
      <p className="mt-2 text-[15px]" style={{ color: 'var(--color-text-secondary)' }}>
        노동조합법 관련 판례 {totalCases !== null ? totalCases.toLocaleString() : '...'}건, 행정해석 {totalAdmin !== null ? totalAdmin.toLocaleString() : '...'}건을 검색하세요.
      </p>

      {/* 검색바 */}
      <form onSubmit={handleSearch} className="mt-6">
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--grey-400)' }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="검색어를 입력하세요 (예: 사용자성, 단체교섭, 파견)"
            className="w-full rounded-xl border py-3 pl-11 pr-4 text-[15px] outline-none transition-colors focus:border-[var(--color-accent)]"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}
          />
        </div>
      </form>

      {/* 탭 */}
      <div className="mt-5 flex gap-2">
        {TABS.map((tab) => {
          const count = tab.key === 'cases' ? totalCases : totalAdmin;
          return (
            <button
              key={tab.key}
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

      {/* 결과 */}
      <div className="mt-6">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-20">
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
            <span style={{ color: 'var(--color-text-secondary)' }}>검색 중...</span>
          </div>
        )}

        {!loading && searched && currentResults.length === 0 && (
          <div className="py-20 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
            <p className="text-lg">검색 결과가 없습니다.</p>
            <p className="mt-2 text-sm">다른 검색어를 시도해보세요.</p>
          </div>
        )}

        {!loading && !searched && (
          <div className="py-20 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
            <Search size={40} className="mx-auto mb-3 opacity-30" />
            <p>검색어를 입력하고 Enter를 눌러주세요.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {['사용자성', '단체교섭', '부당노동행위', '파견', '손해배상'].map((kw) => (
                <button
                  key={kw}
                  onClick={() => { setQuery(kw); setPage(1); updateUrl(kw, activeTab, 1); search(kw, activeTab, 1); }}
                  className="rounded-full border px-3 py-1 text-sm transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  {kw}
                </button>
              ))}
            </div>
          </div>
        )}

        {!loading && searched && currentResults.length > 0 && (
          <p className="mb-3 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
            {page > 1 && `${page}페이지 · `}검색 결과 {currentResults.length}건{hasMore ? '+' : ''} 표시
          </p>
        )}

        {!loading && currentResults.length > 0 && (
          <div className="space-y-3">
            {activeTab === 'cases' && cases.map((c) => (
              <CaseCard key={c.id} item={c} query={query} expanded={expandedIds.has(c.id)} onToggle={() => toggleExpand(c.id)} />
            ))}
            {activeTab === 'admin' && admins.map((a) => (
              <AdminCard key={a.id} item={a} query={query} expanded={expandedIds.has(a.id)} onToggle={() => toggleExpand(a.id)} />
            ))}
          </div>
        )}

        {/* 페이지네이션 */}
        {!loading && currentResults.length > 0 && (
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              disabled={page <= 1}
              onClick={() => handlePage(page - 1)}
              className="rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-[var(--grey-50)] disabled:opacity-40"
              style={{ borderColor: 'var(--color-border)' }}
            >
              이전
            </button>
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {page} 페이지
            </span>
            <button
              disabled={!hasMore}
              onClick={() => handlePage(page + 1)}
              className="rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-[var(--grey-50)] disabled:opacity-40"
              style={{ borderColor: 'var(--color-border)' }}
            >
              다음
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 판례 카드 ── */
function CaseCard({ item, query, expanded, onToggle }: { item: CaseResult; query: string; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-xl border p-4 transition-shadow hover:shadow-md" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md px-2 py-0.5 font-medium" style={{ backgroundColor: 'var(--blue-50)', color: 'var(--blue-600)' }}>
              {item.court}
            </span>
            <span style={{ color: 'var(--color-text-tertiary)' }}>{item.case_number}</span>
            <span style={{ color: 'var(--color-text-tertiary)' }}>{item.decision_date?.slice(0, 10)}</span>
            {item.case_type && <span style={{ color: 'var(--color-text-tertiary)' }}>{item.case_type}</span>}
          </div>
          <h3 className="mt-1.5 text-[15px] font-semibold leading-snug" style={{ color: 'var(--color-text-primary)' }}>
            {highlightText(item.title, query)}
          </h3>
        </div>
      </div>

      {/* 키워드 태그 */}
      {item.keywords_matched && item.keywords_matched.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {item.keywords_matched.slice(0, 5).map((kw) => (
            <span key={kw} className="rounded-full px-2 py-0.5 text-[11px]" style={{ backgroundColor: 'var(--grey-100)', color: 'var(--grey-600)' }}>
              {kw}
            </span>
          ))}
        </div>
      )}

      {/* 요지 펼치기 */}
      {(item.summary || item.holding_points) && (
        <>
          <button onClick={onToggle} className="mt-2 flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--color-accent)' }}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? '접기' : '요지 보기'}
          </button>

          {expanded && (
            <div className="mt-2 space-y-2 rounded-lg p-3 text-[13px] leading-relaxed" style={{ backgroundColor: 'var(--grey-50)', color: 'var(--color-text-secondary)' }}>
              {item.summary && <p><strong>요지:</strong> {highlightText(item.summary, query)}</p>}
              {item.holding_points && <p><strong>판시사항:</strong> {highlightText(item.holding_points, query)}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── 행정해석 카드 ── */
function AdminCard({ item, query, expanded, onToggle }: { item: AdminResult; query: string; expanded: boolean; onToggle: () => void }) {
  const hasContent = !!(item.summary || item.holding_points);
  return (
    <div className="rounded-xl border p-4 transition-shadow hover:shadow-md" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-md px-2 py-0.5 font-medium" style={{ backgroundColor: 'var(--color-accent-light)', color: 'var(--color-accent)' }}>
          행정해석
        </span>
        {item.doc_number && <span style={{ color: 'var(--color-text-tertiary)' }}>{item.doc_number}</span>}
        <span style={{ color: 'var(--color-text-tertiary)' }}>{item.decision_date?.slice(0, 10)}</span>
      </div>
      <h3 className="mt-1.5 text-[15px] font-semibold leading-snug" style={{ color: 'var(--color-text-primary)' }}>
        {highlightText(item.title, query)}
      </h3>

      {hasContent && (
        <>
          <button onClick={onToggle} className="mt-2 flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--color-accent)' }}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? '접기' : '요약 보기'}
          </button>

          {expanded && (
            <div className="mt-2 rounded-lg p-3 text-[13px] leading-relaxed" style={{ backgroundColor: 'var(--grey-50)', color: 'var(--color-text-secondary)' }}>
              {item.summary && <p><strong>요약:</strong> {highlightText(item.summary, query)}</p>}
              {item.holding_points && <p className="mt-1"><strong>판단요지:</strong> {highlightText(item.holding_points, query)}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
