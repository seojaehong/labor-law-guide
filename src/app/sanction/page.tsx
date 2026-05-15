'use client';

import { useState, useRef, useEffect, type FormEvent } from 'react';
import { Send, Bot, User, Loader2, Scale, CheckCircle2, GitCompareArrows, ClipboardList } from 'lucide-react';
import { PromptSuggestion } from '@/components/decisions-ui/prompt-suggestion';
import { getDecisionDetailHref } from '@/lib/search/source-contracts';
import { stripMarkdownFormatting } from '@/lib/format-holding';

interface CaseCard {
  id: string;
  title: string;
  decision_result: string;
  holding_summary?: string;
  holding_points: string;
  url: string;
  summary_short?: string;
  key_issue?: string;
  bucket?: 'worker_win' | 'employer_win' | 'other';
  source?: 'nlrc' | 'court';
}

interface ComparisonMeta {
  issueSummary: string[];
  workerWinCases: CaseCard[];
  employerWinCases: CaseCard[];
  coreDifferences: string[];
  checklist: string[];
  decisionGuide: string[];
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tags?: string[];
  cases?: CaseCard[];
  comparison?: ComparisonMeta | null;
  provider?: string;
}

const QUICK_REPLIES = [
  '직원이 회사 물품을 횡령했습니다',
  '반복적으로 무단결근하는 직원',
  '직장 내 폭언/폭행 사건',
  '업무 성과가 현저히 부족한 직원',
  '직장 내 성희롱이 발생했습니다',
  '사내 기밀정보를 외부에 유출한 경우',
];

export default function SanctionPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  function makeMessageId() {
    return crypto.randomUUID();
  }

  async function copySection(sectionId: string, lines: string[]) {
    const text = lines.join('\n');
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedSection(sectionId);
    window.setTimeout(() => {
      setCopiedSection((current) => (current === sectionId ? null : current));
    }, 1500);
  }

  async function requestAnalysis(updatedMessages: Message[]) {
    setLoading(true);
    setLastError(null);

    const msgId = makeMessageId();

    try {
      const res = await fetch('/api/sanction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages, stream: true }),
      });

      if (!res.ok) {
        const raw = await res.text();
        let parsed: { content?: string } = {};
        try { parsed = JSON.parse(raw); } catch { /* ignore */ }
        throw new Error(parsed?.content || `요청 처리에 실패했습니다. (${res.status})`);
      }

      if (!res.body) throw new Error('스트리밍 응답을 받을 수 없습니다.');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let streamedContent = '';
      let finalComparison: ComparisonMeta | null = null;
      let metaReceived = false;
      let buffer = '';
      let serverError: string | null = null;

      // 빈 어시스턴트 메시지 먼저 추가 (점진적 업데이트용)
      setMessages((prev) => [
        ...prev,
        { id: msgId, role: 'assistant', content: '분석 중...' },
      ]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event: { type?: string; content?: string; text?: string; tags?: string[]; cases?: CaseCard[]; comparison?: ComparisonMeta; provider?: string };
          try {
            event = JSON.parse(line.slice(6));
          } catch {
            // 부분 chunk면 다음 라운드에서 합쳐져 들어옴 — silent skip
            continue;
          }

          if (event.type === 'meta') {
            metaReceived = true;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId
                  ? { ...m, content: '유사 판례를 찾았습니다. AI 분석 생성 중...', tags: event.tags, cases: event.cases, comparison: event.comparison ?? null }
                  : m
              )
            );
          } else if (event.type === 'delta') {
            streamedContent += event.text || '';
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId ? { ...m, content: streamedContent } : m
              )
            );
          } else if (event.type === 'done') {
            finalComparison = event.comparison ?? null;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId
                  ? { ...m, content: event.content || streamedContent, comparison: finalComparison, provider: event.provider }
                  : m
              )
            );
          } else if (event.type === 'error') {
            serverError = event.content || '응답 생성에 실패했습니다.';
          }
        }
      }
      if (serverError) throw new Error(serverError);

      if (!metaReceived && !streamedContent) {
        throw new Error('응답을 받지 못했습니다.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
      setLastError(message);
      setMessages((prev) => {
        const existing = prev.find((m) => m.id === msgId);
        if (existing) {
          return prev.map((m) => (m.id === msgId ? { ...m, content: message } : m));
        }
        return [...prev, { id: msgId, role: 'assistant' as const, content: message }];
      });
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;

    const userMsg: Message = { id: makeMessageId(), role: 'user', content: text.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');

    await requestAnalysis(updatedMessages);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  const isEmpty = messages.length === 0;

  function renderComparisonCaseCard(c: CaseCard, tone: 'worker' | 'employer') {
    const cardClass =
      tone === 'worker'
        ? 'block rounded-xl border border-primary/30 bg-card p-3 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        : 'block rounded-xl border border-amber-200 dark:border-amber-900/50 bg-card p-3 hover:bg-amber-100/40 dark:hover:bg-amber-900/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500'
    const titleClass = tone === 'worker' ? 'mb-1 text-xs font-semibold text-accent-foreground' : 'mb-1 text-xs font-semibold text-amber-700 dark:text-amber-300'
    const href = (c.id && !c.id.startsWith('ai_case_') ? getDecisionDetailHref({ id: c.id, sourceProvider: c.source === 'court' ? 'bigcase' : 'nlrc' }) : '')

    const sourceBadge = c.source === 'court'
      ? <span className="ml-1.5 rounded-full bg-purple-100 dark:bg-purple-900/30 px-1.5 py-0.5 text-[9px] font-medium text-purple-700 dark:text-purple-300">법원</span>
      : <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">노동위</span>

    const content = (
      <>
        <div className="flex items-center">
          <div className={titleClass}>{c.title}</div>
          {sourceBadge}
        </div>
        <p className="text-xs leading-relaxed text-foreground/80">{stripMarkdownFormatting(c.holding_points || c.summary_short || c.key_issue || '')}</p>
      </>
    )

    if (!href) {
      return (
        <div key={c.id} className={cardClass}>
          {content}
        </div>
      )
    }

    return (
      <a
        key={c.id}
        href={href}
        aria-label={`${tone === 'worker' ? '근로자가 이긴' : '사용자가 이긴'} 판정례 열기: ${c.title}`}
        className={cardClass}
      >
        {content}
      </a>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-1.5">
          <Scale size={14} className="text-primary" />
          <span className="text-xs font-medium text-accent-foreground">42,000건 노동위 판정례 기반</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground">AI 판정례 비교분석</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          상황을 설명하시면 유사 판정례를 비교해 승패를 가른 요소와 실무 체크리스트를 안내합니다
        </p>
      </div>

      {/* Chat Area */}
      <div className="flex flex-col rounded-3xl border border-border/40 bg-card shadow-lg shadow-black/[0.02] ring-1 ring-black/[0.03] dark:ring-white/[0.04]" style={{ height: 'calc(100vh - 240px)', minHeight: '500px' }}>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5">
          {/* Empty State */}
          {isEmpty && !loading && (
            <div className="flex h-full flex-col items-center justify-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent">
                <Scale size={28} className="text-primary" />
              </div>
              <p className="mb-1 text-lg font-semibold text-foreground">어떤 상황이신가요?</p>
              <p className="mb-8 text-sm text-muted-foreground">징계 사유를 설명해 주시면 유사 판정례를 분석해 드립니다</p>
              <div className="flex max-w-lg flex-wrap justify-center gap-2">
                {QUICK_REPLIES.map((text) => (
                  <PromptSuggestion key={text} onClick={() => sendMessage(text)}>
                    {text}
                  </PromptSuggestion>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="space-y-5">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    msg.role === 'user' ? 'bg-accent' : 'bg-muted'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <User size={14} className="text-primary" />
                  ) : (
                    <Bot size={14} className="text-muted-foreground" />
                  )}
                </div>
                <div className={`max-w-[85%] space-y-3 ${msg.role === 'user' ? 'text-right' : ''}`}>
                  {/* User message */}
                  {msg.role === 'user' && (
                    <div className="inline-block rounded-2xl bg-primary px-4 py-3 text-sm text-primary-foreground">
                      {msg.content}
                    </div>
                  )}

                  {msg.role === 'assistant' && msg.content && !msg.comparison && (
                    <div className="rounded-2xl bg-muted px-4 py-3 text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                      {msg.content}
                    </div>
                  )}

                  {msg.comparison && (
                    <div className="space-y-4">
                      {msg.comparison.issueSummary.length > 0 && (
                        <div className="rounded-2xl border border-primary/30 bg-accent p-4">
                          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-accent-foreground">
                            <Scale size={15} />
                            쟁점 요약
                          </div>
                          <div className="space-y-1 text-sm text-accent-foreground">
                            {msg.comparison.issueSummary.map((item, idx) => (
                              <p key={`issue-${idx}`}>{item}</p>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-primary/30 bg-accent p-4">
                          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-accent-foreground">
                            <GitCompareArrows size={15} />
                            근로자가 이긴 사건
                          </div>
                          <div className="space-y-3">
                            {msg.comparison.workerWinCases.length > 0 ? msg.comparison.workerWinCases.map((c) => (
                              renderComparisonCaseCard(c, 'worker')
                            )) : <p className="text-xs text-muted-foreground">직접 비교 가능한 인용 사건이 아직 충분하지 않습니다.</p>}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-4">
                          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
                            <GitCompareArrows size={15} />
                            사용자가 이긴 사건
                          </div>
                          <div className="space-y-3">
                            {msg.comparison.employerWinCases.length > 0 ? msg.comparison.employerWinCases.map((c) => (
                              renderComparisonCaseCard(c, 'employer')
                            )) : <p className="text-xs text-muted-foreground">직접 비교 가능한 기각 사건이 아직 충분하지 않습니다.</p>}
                          </div>
                        </div>
                      </div>

                      {msg.comparison.coreDifferences.length > 0 && (
                        <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-4">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
                              <CheckCircle2 size={15} />
                              승패를 가른 핵심 차이
                            </div>
                            <button
                              type="button"
                              onClick={() => void copySection(`diff-${msg.id}`, msg.comparison?.coreDifferences || [])}
                              className="rounded-md border border-amber-200 dark:border-amber-900/50 bg-card px-2 py-1 text-[11px] font-medium text-amber-900 dark:text-amber-200 transition-colors hover:bg-amber-100 dark:hover:bg-amber-900/30"
                            >
                              {copiedSection === `diff-${msg.id}` ? '복사됨' : '복사'}
                            </button>
                          </div>
                          <ul className="space-y-2 text-sm text-amber-950 dark:text-amber-100">
                            {msg.comparison.coreDifferences.map((item, idx) => (
                              <li key={`diff-${idx}`}>- {item}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {msg.comparison.checklist.length > 0 && (
                        <div className="rounded-2xl border border-border/50 bg-card p-4">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                              <ClipboardList size={15} />
                              실무 체크리스트
                            </div>
                            <button
                              type="button"
                              onClick={() => void copySection(`check-${msg.id}`, msg.comparison?.checklist || [])}
                              className="rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-[11px] font-medium text-foreground/80 transition-colors hover:bg-muted"
                            >
                              {copiedSection === `check-${msg.id}` ? '복사됨' : '복사'}
                            </button>
                          </div>
                          <div className="grid gap-2 md:grid-cols-2">
                            {msg.comparison.checklist.map((item, idx) => (
                              <div key={`check-${idx}`} className="rounded-xl bg-muted px-3 py-2 text-sm text-foreground/80">
                                {item}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {msg.provider && (
                        <p className="text-right text-[10px] text-muted-foreground">analyzed by {msg.provider}</p>
                      )}

                      {msg.comparison.decisionGuide.length > 0 && (
                        <div className="rounded-2xl border border-purple-200 dark:border-purple-900/50 bg-purple-50 dark:bg-purple-950/30 p-4">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="text-sm font-semibold text-purple-900 dark:text-purple-200">문안/의사결정 보조</div>
                            <button
                              type="button"
                              onClick={() => void copySection(`guide-${msg.id}`, msg.comparison?.decisionGuide || [])}
                              className="rounded-md border border-purple-200 dark:border-purple-900/50 bg-card px-2 py-1 text-[11px] font-medium text-purple-900 dark:text-purple-200 transition-colors hover:bg-purple-100 dark:hover:bg-purple-900/30"
                            >
                              {copiedSection === `guide-${msg.id}` ? '복사됨' : '복사'}
                            </button>
                          </div>
                          <div className="space-y-2 text-sm text-purple-950 dark:text-purple-100">
                            {msg.comparison.decisionGuide.map((item, idx) => (
                              <p key={`guide-${idx}`}>{item}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* "추가 참고 판정례" 노출 제거 — LLM이 similar_cases로 고른 사건만 보여줌.
                      이전엔 retrieval에서 가져온 미선별 사건이 그대로 노출되어 무관 판례
                      (정정보도/대리점 갱신 등)가 사용자에게 보였음. */}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                  <Loader2 size={14} className="animate-spin text-muted-foreground" />
                </div>
                <div className="flex-1 space-y-3">
                  <div className="rounded-2xl border border-primary/30 bg-accent p-4 animate-pulse">
                    <div className="mb-3 h-4 w-28 rounded bg-primary/20" />
                    <div className="space-y-2">
                      <div className="h-3 w-5/6 rounded bg-primary/20" />
                      <div className="h-3 w-2/3 rounded bg-primary/20" />
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-border/50 bg-card p-4 animate-pulse">
                      <div className="mb-3 h-4 w-24 rounded bg-muted" />
                      <div className="space-y-2">
                        <div className="h-3 w-full rounded bg-muted" />
                        <div className="h-3 w-4/5 rounded bg-muted" />
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/50 bg-card p-4 animate-pulse">
                      <div className="mb-3 h-4 w-24 rounded bg-muted" />
                      <div className="space-y-2">
                        <div className="h-3 w-full rounded bg-muted" />
                        <div className="h-3 w-3/4 rounded bg-muted" />
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">판정례 비교분석 중...</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Disclaimer */}
        <div className="border-t border-border px-4 py-1.5">
          <p className="text-center text-[10px] text-muted-foreground">
            본 결과는 유사 판정례 비교에 기반한 참고용입니다. 최종 결정 전 반드시 노무사와 상담하세요.
          </p>
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex gap-2 border-t border-border p-4">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="징계 상황을 설명해 주세요..."
            className="flex-1 rounded-xl border border-border/50 bg-muted/40 px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-ring focus:bg-card"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-primary px-4 text-primary-foreground transition-colors hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
          >
            <Send size={16} />
          </button>
        </form>
        {lastError && (
          <div className="border-t border-border px-4 pb-4">
            <p className="mb-2 text-xs text-red-500">{lastError}</p>
            <button
              type="button"
              onClick={() => {
                const lastAssistantIndex = [...messages].reverse().findIndex((message) => message.role === 'assistant');
                if (lastAssistantIndex === -1) return;

                const assistantIndex = messages.length - 1 - lastAssistantIndex;
                const retryMessages = messages.slice(0, assistantIndex);
                if (retryMessages.some((message) => message.role === 'user')) {
                  void requestAnalysis(retryMessages);
                }
              }}
              className="rounded-lg border border-border/60 px-3 py-2 text-xs font-medium text-foreground/80 transition-colors hover:bg-muted hover:border-border"
            >
              다시 시도
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
