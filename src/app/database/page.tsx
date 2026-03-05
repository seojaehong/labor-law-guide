'use client';

import { useState, useCallback } from 'react';
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

export default function DatabasePage() {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('cases');
  const [loading, setLoading] = useState(false);
  const [cases, setCases] = useState<CaseResult[]>([]);
  const [admins, setAdmins] = useState<AdminResult[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [searched, setSearched] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setExpandedIds(new Set());
    search(query, activeTab, 1);
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setPage(1);
    setExpandedIds(new Set());
    if (query.length >= 2) search(query, tab, 1);
  };

  const handlePage = (p: number) => {
    setPage(p);
    setExpandedIds(new Set());
    search(query, activeTab, p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const formatDate = (d: string | null) => {
    if (!d) return '';
    return d.slice(0, 10);
  };

  const currentResults = activeTab === 'cases' ? cases : admins;

  return (
    <div className="mx-auto max-w-[1000px] px-5 py-10">
      <h1 className="text-2xl font-bold md:text-3xl" style={{ color: 'var(--color-text-primary)' }}>
        판례·행정해석·뉴스 검색
      </h1>
      <p className="mt-2 text-[15px]" style={{ color: 'var(--color-text-secondary)' }}>
        노동조합법 관련 판례 2,900+건, 행정해석 890+건을 검색하세요.
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
        {TABS.map((tab) => (
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
          </button>
        ))}
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
            검색 결과가 없습니다.
          </div>
        )}

        {!loading && !searched && (
          <div className="py-20 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
            검색어를 입력하고 Enter를 눌러주세요.
          </div>
        )}

        {!loading && currentResults.length > 0 && (
          <div className="space-y-3">
            {activeTab === 'cases' && cases.map((c) => (
              <CaseCard key={c.id} item={c} expanded={expandedIds.has(c.id)} onToggle={() => toggleExpand(c.id)} />
            ))}
            {activeTab === 'admin' && admins.map((a) => (
              <AdminCard key={a.id} item={a} expanded={expandedIds.has(a.id)} onToggle={() => toggleExpand(a.id)} />
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
function CaseCard({ item, expanded, onToggle }: { item: CaseResult; expanded: boolean; onToggle: () => void }) {
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
            {item.title}
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
      <button onClick={onToggle} className="mt-2 flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--color-accent)' }}>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {expanded ? '접기' : '요지 보기'}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 rounded-lg p-3 text-[13px] leading-relaxed" style={{ backgroundColor: 'var(--grey-50)', color: 'var(--color-text-secondary)' }}>
          {item.summary && <p><strong>요지:</strong> {item.summary}</p>}
          {item.holding_points && <p><strong>판시사항:</strong> {item.holding_points}</p>}
        </div>
      )}
    </div>
  );
}

/* ── 행정해석 카드 ── */
function AdminCard({ item, expanded, onToggle }: { item: AdminResult; expanded: boolean; onToggle: () => void }) {
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
        {item.title}
      </h3>

      <button onClick={onToggle} className="mt-2 flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--color-accent)' }}>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {expanded ? '접기' : '요약 보기'}
      </button>

      {expanded && (
        <div className="mt-2 rounded-lg p-3 text-[13px] leading-relaxed" style={{ backgroundColor: 'var(--grey-50)', color: 'var(--color-text-secondary)' }}>
          {item.summary && <p><strong>요약:</strong> {item.summary}</p>}
          {item.holding_points && <p className="mt-1"><strong>판단요지:</strong> {item.holding_points}</p>}
        </div>
      )}
    </div>
  );
}

