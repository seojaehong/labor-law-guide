'use client';

// 261112 재홍님 결정 — /ai 는 「근거 자료 찾기」다. 질문을 받으면 사이트 자료(조문·FAQ·판정례·판례·행정해석·해설 글)를
// 먼저 보여 주고, 그 아래에 그 자료만 정리한 「자료 요약(참고)」을 붙인다. 개인 사정을 모으지 않는다.
// 자료 목록과 요약은 /api/chat 한 번으로 받는다 — 목록이 첫 프레임, 요약이 그 뒤다(검색을 두 번 돌리지 않는다).

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ExternalLink, Loader2, Search } from 'lucide-react';
import TurnstileWidget from '@/components/TurnstileWidget';
import { citationLinkComponents, linkifyFaqCitations, type EvidenceId } from '@/lib/chat/citations';
import { toLexQuery } from '@/lib/chat/context/lex-query';
import type { SourceItem, SourceType } from '@/lib/chat/sources';

const EXAMPLES = ['연차휴가는 언제 생기나요?', '퇴직금 계산 기간은 어떻게 정하나요?', '해고예고는 며칠 전에 해야 하나요?'];

const GROUPS: Array<{ type: SourceType; label: string }> = [
  { type: 'LAW', label: '법령 조문' },
  { type: 'FAQ', label: 'FAQ' },
  { type: 'CASE', label: '노동위원회 판정례' },
  { type: 'COURT', label: '법원 판례' },
  { type: 'INTERP', label: '행정해석' },
  { type: 'BLOG', label: '해설 글' },
];

const MAX_QUESTION = 500;

function getSessionId(): string {
  try {
    let sid = window.localStorage.getItem('yebot_session_id');
    if (!sid) {
      sid = crypto?.randomUUID?.() ?? `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem('yebot_session_id', sid);
    }
    return sid;
  } catch {
    return '';
  }
}

function SourceLink({ item }: { item: SourceItem }) {
  const cls = 'font-medium underline-offset-2 hover:underline [overflow-wrap:anywhere]';
  const style = { color: 'var(--color-accent-ink)' };
  if (/^https?:\/\//.test(item.href)) {
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer" className={cls} style={style}>
        {item.title}
        <ExternalLink size={12} className="ml-1 inline align-[-1px]" aria-hidden="true" />
        <span className="sr-only"> (법제처 원문, 새 창)</span>
      </a>
    );
  }
  return <Link href={item.href} className={cls} style={style}>{item.title}</Link>;
}

export default function SourceFinder() {
  const [input, setInput] = useState('');
  const [asked, setAsked] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sources, setSources] = useState<SourceItem[] | null>(null);
  const [evidence, setEvidence] = useState<EvidenceId[]>([]);
  const [summary, setSummary] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  // /ai?q= — 사이트의 다른 화면·WebMCP 도구가 질문을 넣어 연다. 자동으로 보내지는 않는다.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) setInput(q.slice(0, MAX_QUESTION));
  }, []);

  const run = useCallback(async (raw: string) => {
    const question = raw.trim().slice(0, MAX_QUESTION);
    if (!question || loading) return;
    setAsked(question);
    setLoading(true);
    setSources(null);
    setEvidence([]);
    setSummary('');
    setError(null);
    let reported = false;
    const report = (msg: string) => { if (!reported) setError(msg); reported = true; };
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 질문마다 한 건만 보낸다 — 이전 질문을 끌고 가지 않는다.
        body: JSON.stringify({ messages: [{ role: 'user', content: question }], sessionId: getSessionId(), turnstileToken }),
      });
      if (!res.ok) {
        let msg = '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.';
        try { const j = await res.json(); if (typeof j?.error === 'string') msg = j.error; } catch { /* 기본 문구 */ }
        report(msg);
        return;
      }
      if ((res.headers.get('content-type') || '').includes('application/json')) {
        const data = await res.json();
        if (typeof data?.content === 'string') setSummary(data.content);
        if (typeof data?.error === 'string') report(data.error);
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) { report('응답을 읽을 수 없습니다. 다시 시도해주세요.'); return; }
      const decoder = new TextDecoder();
      let buffer = '';
      let done = false;
      while (!done) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') { done = true; break; }
          try {
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed.sources)) setSources(parsed.sources);
            if (Array.isArray(parsed.evidence)) setEvidence(parsed.evidence);
            if (typeof parsed.content === 'string' && parsed.content) setSummary(prev => prev + parsed.content);
            if (typeof parsed.error === 'string') report(parsed.error);
          } catch { /* 깨진 프레임은 건너뛴다 */ }
        }
      }
      if (!done) report('요약 전송이 중단되었습니다. 표시된 내용은 일부입니다. 다시 시도해주세요.');
    } catch {
      report('요청 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
      // Turnstile 토큰은 1회용이다
      setTurnstileToken(null);
      try { window.turnstile?.reset(); } catch { /* ignore */ }
    }
  }, [loading, turnstileToken]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void run(input);
  }

  const keyword = asked ? (toLexQuery(asked).split(/\s+/)[0] || asked).slice(0, 40) : '';

  return (
    <div className="layout-tool editorial-tool">
      <header className="editorial-tool-header">
        <p className="mb-2 text-xs font-medium" style={{ color: 'var(--grey-700)' }}>검토 중인 기능</p>
        <h1 className="t-h2 mb-2" style={{ color: 'var(--color-text-primary)' }}>
          근거 자료 찾기
        </h1>
        <p className="mb-6 text-sm leading-relaxed" style={{ color: 'var(--grey-700)' }}>
          질문을 적으면 사이트에 모아 둔 법령 조문·FAQ·노동위원회 판정례·법원 판례·행정해석·해설 글을 먼저 찾아 보여 줍니다.
          그 아래 「자료 요약(참고)」은 찾은 자료만 정리한 참고용이며, 개별 사안에 대한 판단이 아닙니다.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={MAX_QUESTION}
          placeholder="예: 연차휴가는 언제 생기나요?"
          aria-label="노동법에 대한 질문 입력"
          className="min-h-[44px] min-w-0 flex-1 rounded-md border px-4 py-2.5 text-[15px] outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] focus:border-[var(--color-accent)]"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-md px-5 py-2.5 text-[15px] font-semibold transition-colors bg-[var(--color-accent-ink)] text-[var(--color-on-accent-ink)] hover:bg-[var(--color-accent-ink-hover)] disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Search size={16} aria-hidden="true" />}
          자료 찾기
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2" aria-label="예시 질문">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            disabled={loading}
            onClick={() => { setInput(ex); void run(ex); }}
            className="min-h-[36px] rounded-full px-3 py-1.5 text-left text-sm transition-colors disabled:opacity-50"
            style={{ backgroundColor: 'var(--grey-100)', color: 'var(--grey-700)' }}
          >
            {ex}
          </button>
        ))}
      </div>

      {/* Cloudflare Turnstile (env 미설정 시 자동 미렌더) */}
      <TurnstileWidget onToken={setTurnstileToken} />

      {asked && (
        <>
          <section aria-labelledby="ai-sources-heading" className="mt-8">
            <h2 id="ai-sources-heading" className="t-h4" style={{ color: 'var(--color-text-primary)' }}>찾은 자료</h2>
            <p className="mt-1 text-sm [overflow-wrap:anywhere]" style={{ color: 'var(--color-text-secondary)' }}>
              「{asked}」와 관련해 사이트에서 찾은 자료입니다. 제목을 누르면 원문으로 갑니다.
            </p>

            {sources === null ? (
              <p className="mt-4 inline-flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                {loading ? (<><Loader2 size={14} className="animate-spin" aria-hidden="true" />자료를 찾는 중…</>) : '자료 목록을 받지 못했습니다. 아래 사이트 검색에서 직접 찾아 보세요.'}
              </p>
            ) : sources.length === 0 ? (
              <p className="mt-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>사이트 자료에서 맞는 항목을 찾지 못했습니다. 아래 사이트 검색에서 다른 낱말로 찾아 보세요.</p>
            ) : (
              <div className="mt-4 space-y-5">
                {GROUPS.map(({ type, label }) => {
                  const items = sources.filter((s) => s.type === type);
                  if (items.length === 0) return null;
                  return (
                    <div key={type}>
                      <h3 className="mb-2 text-sm font-bold" style={{ color: 'var(--grey-700)' }}>
                        {label} <span className="font-normal">{items.length}건</span>
                      </h3>
                      <ul className="divide-y rounded-md border" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
                        {items.map((item) => (
                          <li key={`${item.type}-${item.id}`} className="min-w-0 p-4" style={{ borderColor: 'var(--color-border)' }}>
                            <SourceLink item={item} />
                            {item.meta && <p className="mt-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>{item.meta}</p>}
                            {item.excerpt && <p className="mt-1.5 text-sm leading-relaxed [overflow-wrap:anywhere]" style={{ color: 'var(--grey-700)' }}>{item.excerpt}</p>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="mt-4 text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              사이트 검색에서 더 찾기:{' '}
              <Link href={`/decisions?q=${encodeURIComponent(keyword)}`} className="underline underline-offset-2" style={{ color: 'var(--color-accent-ink)' }}>「{keyword}」 판례·행정해석</Link>
              {' · '}
              <Link href={`/blog?q=${encodeURIComponent(keyword)}`} className="underline underline-offset-2" style={{ color: 'var(--color-accent-ink)' }}>「{keyword}」 해설 글</Link>
              {' · '}
              <Link href="/faq" className="underline underline-offset-2" style={{ color: 'var(--color-accent-ink)' }}>FAQ 전체</Link>
            </p>
          </section>

          <section aria-labelledby="ai-summary-heading" className="mt-8 rounded-md border p-5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--grey-50)' }}>
            <h2 id="ai-summary-heading" className="t-h4" style={{ color: 'var(--color-text-primary)' }}>자료 요약(참고)</h2>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              위에 찾은 자료만 보고 AI가 정리한 참고용 요약입니다. 개별 사안에 대한 판단이 아니며 틀릴 수 있으니 원문을 확인해 주세요.
            </p>
            <div className="mt-4 text-[15px] leading-relaxed [overflow-wrap:anywhere]" style={{ color: 'var(--color-text-primary)' }}>
              {summary ? (
                <div className="chat-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={citationLinkComponents(evidence)}>
                    {linkifyFaqCitations(summary, evidence)}
                  </ReactMarkdown>
                </div>
              ) : loading ? (
                <span className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                  <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                  {sources === null ? '자료를 찾은 뒤 요약합니다…' : '찾은 자료를 정리하는 중…'}
                </span>
              ) : null}
              {error && <p role="alert" className="mt-3 text-sm" style={{ color: 'var(--color-text-primary)' }}>⚠️ {error}</p>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
