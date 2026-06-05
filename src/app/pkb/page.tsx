'use client';

import { useState, type FormEvent } from 'react';
import { Search, Loader2, FileText, BookOpen } from 'lucide-react';

type Citation = {
  n: number;
  folder: string;
  title: string | null;
  section: string | null;
  source_path: string;
  similarity: number;
};
type Chunk = {
  id: number;
  source_path: string;
  folder: string;
  title: string | null;
  section: string | null;
  content: string;
  similarity: number;
};

const FOLDERS = ['', '법률자문', '상담일지', '사건', '레퍼런스', '브리핑', '자동화', 'NotebookLM', '교재'];

export default function PkbPage() {
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState('');
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [error, setError] = useState('');

  // 토큰은 localStorage에 저장 (개인 사용용)
  if (typeof window !== 'undefined' && !token) {
    const t = localStorage.getItem('pkb_token');
    if (t) setToken(t);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setAnswer('');
    setChunks([]);
    setCitations([]);
    if (!query.trim()) return;
    if (!token.trim()) {
      setError('ADMIN_PKB_TOKEN 입력 필요');
      return;
    }
    if (typeof window !== 'undefined') localStorage.setItem('pkb_token', token);
    setLoading(true);
    try {
      const res = await fetch('/api/pkb/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query, folder: folder || undefined, k: 8 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '검색 실패');
      } else {
        setAnswer(data.answer || '');
        setChunks(data.chunks || []);
        setCitations(data.citations || []);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
          <BookOpen size={22} /> PKB · Personal Knowledge Base
        </h1>
        <p className="text-sm text-muted-foreground">
          옵시디언 vault(자문·상담·사건·레퍼런스·브리핑 등) + 본인 메모를 의미검색·RAG 답변
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-3 mb-6">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="예: 원청 사용자성 자문한 적 있나? 최근 1년 비위행위 해고 판정 패턴은?"
            className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
            style={{ borderColor: 'var(--color-border)' }}
            disabled={loading}
          />
          <select
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)' }}
            disabled={loading}
          >
            {FOLDERS.map((f) => (
              <option key={f} value={f}>
                {f || '전체 폴더'}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : <><Search size={14} className="inline mr-1" /> 검색</>}
          </button>
        </div>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="ADMIN_PKB_TOKEN (저장됨)"
          className="w-full rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: 'var(--color-border)' }}
        />
      </form>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 mb-4">
          {error}
        </div>
      )}

      {answer && (
        <div className="rounded-xl border bg-primary/5 p-5 mb-6" style={{ borderColor: 'var(--color-border)' }}>
          <h2 className="text-sm font-bold mb-2">답변</h2>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{answer}</div>
          {citations.length > 0 && (
            <div className="mt-4 border-t pt-3 text-xs">
              <div className="font-semibold mb-1">인용</div>
              <ul className="space-y-1">
                {citations.map((c) => (
                  <li key={c.n}>
                    <span className="font-mono">[{c.n}]</span>{' '}
                    <span className="rounded bg-muted px-1.5 py-0.5">{c.folder}</span>{' '}
                    {c.title} {c.section && <span className="text-muted-foreground">→ {c.section}</span>}{' '}
                    <span className="text-muted-foreground">(sim {c.similarity})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {chunks.length > 0 && (
        <div>
          <h2 className="text-sm font-bold mb-3 flex items-center gap-1">
            <FileText size={14} /> 검색 결과 ({chunks.length})
          </h2>
          <div className="space-y-3">
            {chunks.map((c, i) => (
              <div key={c.id} className="rounded-lg border p-4 text-sm" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex items-center gap-2 mb-2 text-xs">
                  <span className="font-mono">[{i + 1}]</span>
                  <span className="rounded bg-muted px-1.5 py-0.5">{c.folder}</span>
                  <span className="font-semibold">{c.title}</span>
                  {c.section && <span className="text-muted-foreground">→ {c.section}</span>}
                  <span className="ml-auto text-muted-foreground">sim {c.similarity?.toFixed(3)}</span>
                </div>
                <div className="whitespace-pre-wrap text-[13px] leading-relaxed line-clamp-6">
                  {c.content}
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground truncate">{c.source_path}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
