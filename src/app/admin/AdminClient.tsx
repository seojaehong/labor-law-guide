'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  FileText,
  Trash2,
  ExternalLink,
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
  Check,
  Pencil,
  Lock,
} from 'lucide-react';

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('admin_token') || '';
}

function adminFetch(url: string, opts: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(opts.headers);
  if (token) headers.set('x-admin-token', token);
  return fetch(url, { ...opts, headers });
}

/* ───── types ───── */
interface Article {
  slug: string;
  title: string;
  subtitle: string | null;
  category: string;
  author: string;
  published_at: string;
  updated_at: string;
  tags: string[];
}

interface ArticleFull extends Article {
  content: string;
  summary: string | null;
  seo_title: string | null;
  seo_description: string | null;
}

interface Stats {
  total: number;
  today: number;
  byCategory: Record<string, number>;
  trend: { date: string; count: number }[];
  recent: { slug: string; title: string; category: string; author: string; published_at: string }[];
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  '노동법': { bg: '#e8f3ff', text: '#1b64da' },
  '판례분석': { bg: '#f5f3ff', text: '#6d28d9' },
  '뉴스해설': { bg: '#fef3c7', text: '#92400e' },
  '뉴스브리핑': { bg: '#fff7ed', text: '#c2410c' },
  '실무가이드': { bg: '#ecfdf5', text: '#065f46' },
  general: { bg: '#f2f4f6', text: '#6b7684' },
};

function Badge({ category }: { category: string }) {
  const c = CATEGORY_COLORS[category] || CATEGORY_COLORS.general;
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {category}
    </span>
  );
}

function fmtDate(s: string) {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s.slice(0, 10);
  return `${m[2]}/${m[3]}`;
}

function fmtDateFull(s: string) {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s.slice(0, 10);
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/* ───── main ───── */
export default function AdminClient() {
  const [authed, setAuthed] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [tab, setTab] = useState<'dashboard' | 'articles'>('dashboard');
  const [stats, setStats] = useState<Stats | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('all');
  const [author, setAuthor] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [editArticle, setEditArticle] = useState<ArticleFull | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  /* auth check on mount */
  useEffect(() => {
    const saved = localStorage.getItem('admin_token');
    if (saved) {
      adminFetch('/api/admin/stats').then((r) => {
        if (r.ok) setAuthed(true);
        else localStorage.removeItem('admin_token');
      });
    }
  }, []);

  const handleLogin = async () => {
    localStorage.setItem('admin_token', tokenInput);
    const res = await adminFetch('/api/admin/stats');
    if (res.ok) {
      setAuthed(true);
      setAuthError('');
    } else {
      localStorage.removeItem('admin_token');
      setAuthError('잘못된 토큰입니다');
    }
  };

  /* fetch stats */
  const loadStats = useCallback(async () => {
    if (!authed) return;
    const res = await adminFetch('/api/admin/stats');
    const data = await res.json();
    setStats(data);
  }, [authed]);

  /* fetch articles */
  const loadArticles = useCallback(async () => {
    if (!authed) return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (category !== 'all') params.set('category', category);
    if (author !== 'all') params.set('author', author);
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    if (search) params.set('search', search);
    const res = await adminFetch(`/api/admin/articles?${params}`);
    const data = await res.json();
    setArticles(data.articles || []);
    setTotal(data.total || 0);
    setLoading(false);
  }, [authed, page, category, author, dateFrom, dateTo, search]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadArticles(); }, [loadArticles]);

  /* actions */
  const deleteArticle = async (article: Article) => {
    if (!confirm(`"${article.title}" 글을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    const res = await adminFetch(`/api/admin/articles?slug=${article.slug}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('삭제됨');
      loadArticles();
      loadStats();
    }
  };

  const openEditor = async (slug: string) => {
    const res = await adminFetch(`/api/admin/articles/${slug}`);
    const data = await res.json();
    setEditArticle(data.article);
  };

  const saveEdit = async () => {
    if (!editArticle) return;
    setSaving(true);
    const { slug, title, subtitle, content, summary, category: cat, tags, seo_title, seo_description } = editArticle;
    const res = await adminFetch('/api/admin/articles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, title, subtitle, content, summary, category: cat, tags, seo_title, seo_description }),
    });
    setSaving(false);
    if (res.ok) {
      showToast('저장 완료');
      setEditArticle(null);
      loadArticles();
      loadStats();
    }
  };

  const totalPages = Math.ceil(total / 20);
  const categories = stats ? Object.keys(stats.byCategory) : [];
  const maxTrend = stats ? Math.max(...stats.trend.map(t => t.count), 1) : 1;

  if (!authed) {
    return (
      <div className="mx-auto max-w-[400px] px-5 py-20">
        <div
          className="rounded-2xl border p-8 text-center"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}
        >
          <Lock size={32} className="mx-auto mb-4" style={{ color: 'var(--color-text-tertiary)' }} />
          <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>어드민 로그인</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--color-text-tertiary)' }}>관리자 토큰을 입력하세요</p>
          <input
            type="password"
            className="w-full rounded-lg border px-4 py-2.5 text-sm outline-none mb-3"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            placeholder="토큰 입력"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
          {authError && <p className="text-xs mb-3" style={{ color: '#dc2626' }}>{authError}</p>}
          <button
            onClick={handleLogin}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--blue-500)' }}
          >
            로그인
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            블로그 어드민
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
            글 관리 & 발행 현황
          </p>
        </div>
        <button
          onClick={() => { loadStats(); loadArticles(); }}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-[var(--grey-100)]"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          <RefreshCw size={14} /> 새로고침
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 rounded-lg p-1" style={{ backgroundColor: 'var(--grey-100)' }}>
        {[
          { key: 'dashboard' as const, label: '대시보드', icon: BarChart3 },
          { key: 'articles' as const, label: '글 관리', icon: FileText },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium flex-1 justify-center transition-all"
            style={{
              backgroundColor: tab === key ? 'white' : 'transparent',
              color: tab === key ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
              boxShadow: tab === key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* ═══ DASHBOARD ═══ */}
      {tab === 'dashboard' && stats && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: '전체 글', value: stats.total, color: 'var(--blue-500)' },
              { label: '오늘 발행', value: stats.today, color: '#059669' },
              { label: '카테고리', value: categories.length, color: '#7c3aed' },
              { label: '7일 평균', value: (stats.trend.reduce((s, t) => s + t.count, 0) / 7).toFixed(1), color: '#ea580c' },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                className="rounded-xl border p-4"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}
              >
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-tertiary)' }}>{label}</p>
                <p className="text-2xl font-bold" style={{ color }}>{value}</p>
              </div>
            ))}
          </div>

          {/* 7-Day Trend */}
          <div
            className="rounded-xl border p-5"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}
          >
            <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--color-text-primary)' }}>
              7일 발행 추이
            </h3>
            <div className="flex items-end gap-2 h-24">
              {stats.trend.map((t) => (
                <div key={t.date} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                    {t.count}
                  </span>
                  <div
                    className="w-full rounded-t-md transition-all"
                    style={{
                      height: `${Math.max((t.count / maxTrend) * 72, 4)}px`,
                      backgroundColor: t.count > 0 ? 'var(--blue-400)' : 'var(--grey-200)',
                    }}
                  />
                  <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                    {t.date.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Category Breakdown */}
          <div
            className="rounded-xl border p-5"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}
          >
            <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--color-text-primary)' }}>
              카테고리별 현황
            </h3>
            <div className="space-y-2">
              {Object.entries(stats.byCategory)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, count]) => {
                  const pct = Math.round((count / stats.total) * 100);
                  const c = CATEGORY_COLORS[cat] || CATEGORY_COLORS.general;
                  return (
                    <div key={cat} className="flex items-center gap-3">
                      <span className="w-20 text-xs font-medium truncate" style={{ color: c.text }}>{cat}</span>
                      <div className="flex-1 h-5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--grey-100)' }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: c.text, opacity: 0.7 }}
                        />
                      </div>
                      <span className="text-xs font-semibold w-12 text-right" style={{ color: 'var(--color-text-secondary)' }}>
                        {count}건
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Recent Articles */}
          <div
            className="rounded-xl border p-5"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}
          >
            <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--color-text-primary)' }}>
              최근 발행
            </h3>
            <div className="space-y-2">
              {stats.recent.map((a) => (
                <div
                  key={a.slug}
                  className="flex items-center gap-3 rounded-lg px-3 py-2"
                  style={{ backgroundColor: 'var(--grey-50)' }}
                >
                  <Badge category={a.category} />
                  <span
                    className="flex-1 text-sm font-medium truncate"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {a.title}
                  </span>
                  <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--color-text-tertiary)' }}>
                    {fmtDate(a.published_at)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ ARTICLES ═══ */}
      {tab === 'articles' && (
        <div className="space-y-4">
          {/* Filters */}
          <div
            className="rounded-xl border p-4 space-y-3"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}
          >
            {/* Row 1: Search + Category + Author */}
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-1 rounded-lg border px-3 py-1.5 flex-1 min-w-[200px]" style={{ borderColor: 'var(--color-border)' }}>
                <Search size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                <input
                  className="flex-1 text-sm outline-none bg-transparent"
                  placeholder="제목 또는 slug 검색..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setSearch(searchInput);
                      setPage(1);
                    }
                  }}
                  style={{ color: 'var(--color-text-primary)' }}
                />
                {searchInput && (
                  <button onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }}>
                    <X size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                  </button>
                )}
              </div>
              <select
                className="rounded-lg border px-3 py-1.5 text-sm outline-none"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                value={category}
                onChange={(e) => { setCategory(e.target.value); setPage(1); }}
              >
                <option value="all">전체 카테고리</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select
                className="rounded-lg border px-3 py-1.5 text-sm outline-none"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                value={author}
                onChange={(e) => { setAuthor(e.target.value); setPage(1); }}
              >
                <option value="all">전체 필자</option>
                {['뉴스룸', '위너스 에디터', '판례 분석팀', '실무 가이드', '데일리 브리핑', '노무법인 위너스'].map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            {/* Row 2: Date filters + Quick buttons */}
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>날짜:</span>
              {[
                { label: '오늘', fn: () => { const t = new Date(); t.setHours(t.getHours()+9); const s = t.toISOString().slice(0,10); setDateFrom(s); setDateTo(s); setPage(1); }},
                { label: '어제', fn: () => { const t = new Date(); t.setHours(t.getHours()+9); t.setDate(t.getDate()-1); const s = t.toISOString().slice(0,10); setDateFrom(s); setDateTo(s); setPage(1); }},
                { label: '이번 주', fn: () => { const t = new Date(); t.setHours(t.getHours()+9); const to = t.toISOString().slice(0,10); t.setDate(t.getDate()-t.getDay()); const from = t.toISOString().slice(0,10); setDateFrom(from); setDateTo(to); setPage(1); }},
                { label: '최근 7일', fn: () => { const t = new Date(); t.setHours(t.getHours()+9); const to = t.toISOString().slice(0,10); t.setDate(t.getDate()-6); const from = t.toISOString().slice(0,10); setDateFrom(from); setDateTo(to); setPage(1); }},
                { label: '최근 30일', fn: () => { const t = new Date(); t.setHours(t.getHours()+9); const to = t.toISOString().slice(0,10); t.setDate(t.getDate()-29); const from = t.toISOString().slice(0,10); setDateFrom(from); setDateTo(to); setPage(1); }},
                { label: '전체', fn: () => { setDateFrom(''); setDateTo(''); setPage(1); }},
              ].map(({ label, fn }) => (
                <button
                  key={label}
                  onClick={fn}
                  className="rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors hover:bg-[var(--blue-50)]"
                  style={{
                    color: label === '전체' && !dateFrom ? 'var(--blue-500)' : 'var(--color-text-secondary)',
                    backgroundColor: label === '전체' && !dateFrom ? 'var(--blue-50)' : 'transparent',
                  }}
                >
                  {label}
                </button>
              ))}
              <div className="flex items-center gap-1 ml-2">
                <input
                  type="date"
                  className="rounded-md border px-2 py-1 text-[12px] outline-none"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                />
                <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>~</span>
                <input
                  type="date"
                  className="rounded-md border px-2 py-1 text-[12px] outline-none"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                />
              </div>
              <span className="text-xs ml-auto" style={{ color: 'var(--color-text-tertiary)' }}>
                {total}건
              </span>
            </div>
          </div>

          {/* Article List */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
            {loading ? (
              <div className="p-10 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                로딩 중...
              </div>
            ) : articles.length === 0 ? (
              <div className="p-10 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                글이 없습니다
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--grey-50)' }}>
                    <th className="text-left px-4 py-2.5 font-semibold" style={{ color: 'var(--color-text-secondary)' }}>글</th>
                    <th className="text-left px-3 py-2.5 font-semibold w-24 hidden md:table-cell" style={{ color: 'var(--color-text-secondary)' }}>카테고리</th>
                    <th className="text-left px-3 py-2.5 font-semibold w-20 hidden md:table-cell" style={{ color: 'var(--color-text-secondary)' }}>필자</th>
                    <th className="text-center px-3 py-2.5 font-semibold w-16 hidden md:table-cell" style={{ color: 'var(--color-text-secondary)' }}>상태</th>
                    <th className="text-right px-4 py-2.5 font-semibold w-28" style={{ color: 'var(--color-text-secondary)' }}>액션</th>
                  </tr>
                </thead>
                <tbody>
                  {articles.map((a) => (
                    <tr
                      key={a.slug}
                      className="group hover:bg-[var(--grey-50)] transition-colors"
                      style={{ borderBottom: '1px solid var(--color-border)' }}
                    >
                      <td className="px-4 py-3">
                        <p
                          className="font-medium leading-snug line-clamp-1"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
                          {a.title}
                        </p>
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                          {a.slug} &middot; {fmtDateFull(a.published_at)}
                        </p>
                      </td>
                      <td className="px-3 py-3 hidden md:table-cell">
                        <Badge category={a.category} />
                      </td>
                      <td className="px-3 py-3 text-xs hidden md:table-cell" style={{ color: 'var(--color-text-secondary)' }}>
                        {a.author}
                      </td>
                      <td className="px-3 py-3 text-center hidden md:table-cell">
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: '#ecfdf5', color: '#059669' }}>공개</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditor(a.slug)}
                            className="rounded-md p-1.5 hover:bg-[var(--grey-100)] transition-colors"
                            title="수정"
                          >
                            <Pencil size={14} style={{ color: 'var(--blue-500)' }} />
                          </button>
                          <a
                            href={`/blog/${a.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-md p-1.5 hover:bg-[var(--grey-100)] transition-colors"
                            title="보기"
                          >
                            <ExternalLink size={14} style={{ color: 'var(--grey-500)' }} />
                          </a>
                          <button
                            onClick={() => deleteArticle(a)}
                            className="rounded-md p-1.5 hover:bg-red-50 transition-colors"
                            title="삭제"
                          >
                            <Trash2 size={14} style={{ color: '#dc2626' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border p-2 disabled:opacity-30"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-sm px-3" style={{ color: 'var(--color-text-secondary)' }}>
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-lg border p-2 disabled:opacity-30"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══ EDITOR MODAL ═══ */}
      {editArticle && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 px-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div
            className="w-full max-w-[800px] max-h-[85vh] overflow-y-auto rounded-2xl border p-6"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>글 수정</h2>
              <button onClick={() => setEditArticle(null)} className="rounded-lg p-1.5 hover:bg-[var(--grey-100)]">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>제목</label>
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                  value={editArticle.title}
                  onChange={(e) => setEditArticle({ ...editArticle, title: e.target.value })}
                />
              </div>

              {/* Subtitle */}
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>부제</label>
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                  value={editArticle.subtitle || ''}
                  onChange={(e) => setEditArticle({ ...editArticle, subtitle: e.target.value })}
                />
              </div>

              {/* Category + Published */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>카테고리</label>
                  <select
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                    value={editArticle.category}
                    onChange={(e) => setEditArticle({ ...editArticle, category: e.target.value })}
                  >
                    {['노동법', '판례분석', '뉴스해설', '뉴스브리핑', '실무가이드', 'general'].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Summary */}
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>요약 (하늘색 박스)</label>
                <textarea
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none resize-y"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)', minHeight: '60px' }}
                  value={editArticle.summary || ''}
                  onChange={(e) => setEditArticle({ ...editArticle, summary: e.target.value })}
                />
              </div>

              {/* Content */}
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>
                  본문 (HTML)
                  <span className="font-normal ml-2" style={{ color: 'var(--color-text-tertiary)' }}>
                    {editArticle.content.length.toLocaleString()}자
                  </span>
                </label>
                <textarea
                  className="w-full rounded-lg border px-3 py-2 text-xs font-mono outline-none resize-y"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)', minHeight: '200px' }}
                  value={editArticle.content}
                  onChange={(e) => setEditArticle({ ...editArticle, content: e.target.value })}
                />
              </div>

              {/* Tags */}
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>태그 (쉼표 구분)</label>
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                  value={(editArticle.tags || []).join(', ')}
                  onChange={(e) => setEditArticle({ ...editArticle, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
                />
              </div>

              {/* SEO */}
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>SEO 제목</label>
                  <input
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                    value={editArticle.seo_title || ''}
                    onChange={(e) => setEditArticle({ ...editArticle, seo_title: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>SEO 설명</label>
                  <input
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                    value={editArticle.seo_description || ''}
                    onChange={(e) => setEditArticle({ ...editArticle, seo_description: e.target.value })}
                  />
                </div>
              </div>

              {/* Slug (readonly) */}
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--color-text-tertiary)' }}>Slug (읽기 전용)</label>
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)', backgroundColor: 'var(--grey-50)' }}
                  value={editArticle.slug}
                  readOnly
                />
              </div>
            </div>

            {/* Save */}
            <div className="flex items-center justify-end gap-3 mt-6 pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
              <button
                onClick={() => setEditArticle(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                취소
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: 'var(--blue-500)' }}
              >
                <Check size={14} /> {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg animate-in slide-in-from-bottom-4"
          style={{ backgroundColor: '#191f28' }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
