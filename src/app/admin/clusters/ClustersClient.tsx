'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw } from 'lucide-react';

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('admin_token') || '';
}

interface SubclusterRow {
  cluster: string;
  sub: string;
  cluster_label: string;
  count_30d: number;
  count_14d: number;
  status: 'SATURATED' | 'COOLDOWN' | 'MODERATE' | 'FREE';
  sample_articles: {
    slug: string;
    title: string | null;
    author: string | null;
    published_at: string | null;
  }[];
}

interface AuthorMatrixEntry {
  role?: string;
  primary_clusters?: string[];
  cross_clusters?: string[];
  saturation_exception?: boolean;
}

interface ApiResponse {
  total_articles: number;
  window_30d_since: string;
  thresholds: { saturated: number; cooldown_14d: number };
  subclusters: SubclusterRow[];
  author_matrix: Record<string, AuthorMatrixEntry>;
  author_sub_counts: Record<string, Record<string, number>>;
}

const statusStyle: Record<SubclusterRow['status'], string> = {
  SATURATED: 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800',
  COOLDOWN: 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800',
  MODERATE: 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900',
  FREE: 'text-muted-foreground border-transparent',
};

export default function ClustersClient() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [filter, setFilter] = useState<'all' | 'active' | 'saturated'>('active');
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    const token = getToken();
    if (!token) {
      setError('admin_token localStorage 미설정. /admin에서 로그인 후 다시 오세요.');
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/admin/clusters', {
        headers: { 'x-admin-token': token },
      });
      if (!res.ok) {
        setError(`API ${res.status} ${res.statusText}`);
      } else {
        setData(await res.json());
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = (data?.subclusters || []).filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'active') return r.count_30d >= 1;
    if (filter === 'saturated') return r.status === 'SATURATED' || r.status === 'COOLDOWN';
    return true;
  });

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b backdrop-blur bg-background/90">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
          <Link href="/admin" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft size={14} /> 어드민
          </Link>
          <h1 className="ml-2 flex-1 text-sm font-bold">클러스터 편차 대시보드</h1>
          <button
            onClick={load}
            className="text-xs flex items-center gap-1 rounded border px-2 py-1"
            disabled={loading}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> 갱신
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6">
        {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-4">{error}</div>}

        {data && (
          <>
            <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="rounded border p-3">
                <div className="text-muted-foreground text-xs">30일 딥다이브</div>
                <div className="text-2xl font-bold">{data.total_articles}건</div>
              </div>
              <div className="rounded border p-3">
                <div className="text-muted-foreground text-xs">SATURATED 임계</div>
                <div className="text-2xl font-bold">≥{data.thresholds.saturated}건 / 30일</div>
              </div>
              <div className="rounded border p-3">
                <div className="text-muted-foreground text-xs">COOLDOWN 임계</div>
                <div className="text-2xl font-bold">≥{data.thresholds.cooldown_14d}건 / 14일</div>
              </div>
              <div className="rounded border p-3">
                <div className="text-muted-foreground text-xs">서브클러스터</div>
                <div className="text-2xl font-bold">{data.subclusters.length}개</div>
              </div>
            </div>

            <div className="mb-3 flex gap-2">
              {(['active', 'saturated', 'all'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`text-xs px-3 py-1 rounded border ${filter === f ? 'bg-foreground text-background' : ''}`}
                >
                  {f === 'active' ? '발행 있음' : f === 'saturated' ? '문제 있음' : '전체'}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto rounded border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left px-3 py-2">클러스터 · 서브</th>
                    <th className="text-right px-3 py-2">30일</th>
                    <th className="text-right px-3 py-2">14일</th>
                    <th className="text-left px-3 py-2">상태</th>
                    <th className="text-left px-3 py-2 hidden md:table-cell">최근 글</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const k = `${r.cluster}::${r.sub}`;
                    return (
                      <Fragment key={k}>
                        <tr className="border-t hover:bg-muted/40 cursor-pointer" onClick={() => setExpanded(expanded === k ? null : k)}>
                          <td className="px-3 py-2">
                            <div className="font-medium">{r.cluster_label}</div>
                            <div className="text-xs text-muted-foreground">{k}</div>
                          </td>
                          <td className="text-right px-3 py-2 tabular-nums">{r.count_30d}</td>
                          <td className="text-right px-3 py-2 tabular-nums text-muted-foreground">{r.count_14d}</td>
                          <td className="px-3 py-2">
                            <span className={`text-xs px-2 py-0.5 rounded border ${statusStyle[r.status]}`}>
                              {r.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 hidden md:table-cell text-xs text-muted-foreground truncate max-w-[280px]">
                            {r.sample_articles[0]?.title || '-'}
                          </td>
                        </tr>
                        {expanded === k && r.sample_articles.length > 0 && (
                          <tr className="bg-muted/20">
                            <td colSpan={5} className="px-3 py-3">
                              <div className="text-xs font-medium mb-2">최근 발행 (최대 5건)</div>
                              <ul className="space-y-1 text-xs">
                                {r.sample_articles.map((a) => (
                                  <li key={a.slug}>
                                    <span className="text-muted-foreground">{a.published_at?.slice(0, 10)}</span>{' '}
                                    <span className="text-muted-foreground">[{a.author}]</span>{' '}
                                    <Link href={`/blog/${a.slug}`} className="hover:underline" target="_blank">
                                      {a.title}
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="px-3 py-4 text-center text-sm text-muted-foreground">해당 필터에 항목 없음</div>
              )}
            </div>

            <div className="mt-6">
              <h2 className="text-sm font-bold mb-2">필자 매트릭스</h2>
              <div className="grid md:grid-cols-2 gap-3 text-xs">
                {Object.entries(data.author_matrix)
                  .filter(([k]) => !k.startsWith('_'))
                  .map(([agent, entry]) => (
                    <div key={agent} className="rounded border p-3">
                      <div className="font-medium mb-1">
                        {agent} {entry.saturation_exception && <span className="text-amber-600">⚡</span>}
                      </div>
                      <div className="text-muted-foreground mb-2">{entry.role}</div>
                      {entry.primary_clusters && (
                        <div>
                          <span className="font-medium">전담:</span>{' '}
                          {entry.primary_clusters.join(' · ')}
                        </div>
                      )}
                      {entry.cross_clusters && entry.cross_clusters.length > 0 && (
                        <div>
                          <span className="font-medium">크로스:</span>{' '}
                          {entry.cross_clusters.join(' · ')}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
