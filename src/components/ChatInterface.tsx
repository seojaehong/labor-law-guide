'use client';

import { useState, useRef, useEffect, useCallback, type FormEvent } from 'react';
import { Send, Bot, User, Loader2, X, Info } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

type ProfileMap = Record<string, unknown>;

const PROFILE_LABELS: Record<string, string> = {
  company_size: '회사규모',
  tenure_months: '근속',
  monthly_salary: '월급',
  job_type: '고용형태',
  issue_category: '주요이슈',
  employment_status: '재직상태',
  timeline: '시점',
};

// 인용 마크 본문에서 제거 + 답변 끝에 깔끔한 "참고 자료" footer 1개로 통합
type Citation = { type: 'FAQ' | 'CASE' | 'COURT' | 'INTERP'; id: string; href: string };

function linkifyFaqCitations(text: string): string {
  const cited: Citation[] = [];
  const seen = new Set<string>();
  const push = (type: Citation['type'], id: string, href: string) => {
    const key = `${type}-${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    cited.push({ type, id, href });
  };

  // 1) 괄호 형태: [FAQ#123, FAQ#456] / [CASE#id] / [COURT#id] / [INTERP#id]
  let out = text.replace(/\[FAQ#[\d,\sFAQ#]+\]/g, (m) => {
    const ids = m.match(/\d+/g) || [];
    ids.forEach((id) => push('FAQ', id, `/faq?id=${id}`));
    return '';
  });
  out = out.replace(/\[CASE#([A-Za-z0-9_\-]+)\]/g, (_, id) => {
    push('CASE', id, `/decisions/${id}`);
    return '';
  });
  out = out.replace(/\[COURT#([^\]]+)\]/g, (_, id) => {
    push('COURT', id, `/cases/${encodeURIComponent(id)}`);
    return '';
  });
  out = out.replace(/\[INTERP#([^\]]+)\]/g, (_, id) => {
    push('INTERP', id, `/interpretations/${encodeURIComponent(id)}`);
    return '';
  });

  // 2) 괄호 빠진 형태 (LLM이 형식 무시): FAQ#123 / CASE#xxx / COURT#xxx / INTERP#ml_xxx
  // iOS Safari < 16.4 호환: lookbehind 사용 금지 → 선행 문자 캡처 후 보존 방식
  out = out.replace(/(^|[^A-Za-z])FAQ#(\d+)/g, (_, prefix, id) => {
    push('FAQ', id, `/faq?id=${id}`);
    return prefix;
  });
  out = out.replace(/(^|[^A-Za-z])CASE#([A-Za-z0-9_\-]+)/g, (_, prefix, id) => {
    push('CASE', id, `/decisions/${id}`);
    return prefix;
  });
  out = out.replace(/(^|[^A-Za-z])COURT#([A-Za-z0-9_가-힣\-]+)/g, (_, prefix, id) => {
    push('COURT', id, `/cases/${encodeURIComponent(id)}`);
    return prefix;
  });
  out = out.replace(/(^|[^A-Za-z])INTERP#([A-Za-z0-9_\-]+)/g, (_, prefix, id) => {
    push('INTERP', id, `/interpretations/${encodeURIComponent(id)}`);
    return prefix;
  });

  // 빈 인용으로 인해 남은 ", " ", ," "( )" 같은 잔여 정리
  out = out.replace(/\s*,\s*,\s*/g, ', ').replace(/\(\s*,?\s*\)/g, '').replace(/\s+([,.])/g, '$1');

  // 자동 footer: "참고 FAQ: ..." 서버 측 footer가 이미 있으면 중복 추가하지 않음
  if (cited.length > 0 && !/참고\s*(FAQ|자료)/.test(out)) {
    const labels: Record<Citation['type'], string> = {
      FAQ: 'FAQ',
      CASE: '판정례',
      COURT: '판례',
      INTERP: '행정해석',
    };
    const groups = new Map<Citation['type'], Citation[]>();
    for (const c of cited) {
      if (!groups.has(c.type)) groups.set(c.type, []);
      groups.get(c.type)!.push(c);
    }
    const footer = ['', '', '---', '**참고 자료**'];
    for (const [type, list] of groups) {
      const items = list.map((c, i) => `[${labels[type]} ${i + 1}](${c.href})`).join(' · ');
      footer.push(`- ${labels[type]}: ${items}`);
    }
    out = out.trimEnd() + '\n' + footer.join('\n');
  }
  return out;
}

function formatProfileValue(key: string, value: unknown): string {
  if (value == null) return '';
  if (key === 'company_size') {
    const n = Number(value);
    return n < 5 ? `상시 ${n}명 (5인 미만)` : `상시 ${n}명`;
  }
  if (key === 'tenure_months') {
    const n = Number(value);
    const y = Math.floor(n / 12);
    const m = n % 12;
    return y > 0 ? `${y}년${m > 0 ? ` ${m}개월` : ''}` : `${m}개월`;
  }
  if (key === 'monthly_salary') {
    const n = Number(value);
    return `${n.toLocaleString('ko-KR')}원`;
  }
  return String(value);
}

function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  let sid = window.localStorage.getItem('yebot_session_id');
  if (!sid) {
    sid = (crypto?.randomUUID?.() ?? `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
    window.localStorage.setItem('yebot_session_id', sid);
  }
  return sid;
}

async function streamChat(messages: Message[], onChunk: (text: string) => void, onDone: () => void, onError: (msg: string) => void) {
  const sessionId = getSessionId();
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, sessionId }),
  });

  if (!res.ok) {
    onError('API 오류가 발생했습니다.');
    return;
  }

  const contentType = res.headers.get('content-type') || '';

  // Fallback: non-streaming JSON response
  if (contentType.includes('application/json')) {
    const data = await res.json();
    onChunk(data.content || data.error || '응답을 생성할 수 없습니다.');
    onDone();
    return;
  }

  // SSE streaming
  const reader = res.body?.getReader();
  if (!reader) { onError('스트리밍을 시작할 수 없습니다.'); return; }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') { onDone(); return; }

        try {
          const parsed = JSON.parse(data);
          if (parsed.content) onChunk(parsed.content);
          if (parsed.error) onError(parsed.error);
        } catch {
          // skip malformed
        }
      }
    }
  } finally {
    onDone();
  }
}

export default function ChatInterface({ injectedQuestion }: { injectedQuestion?: string }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: '안녕하세요! 노동법에 대해 궁금한 점을 질문해 주세요.\n부당해고·징계, 임금체불·퇴직금, 직장내괴롭힘, 노란봉투법, 4대보험, 고용지원금, 근로계약 등 노동법 전반에 대해 답변해 드립니다.' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<ProfileMap>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshProfile = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const sid = window.localStorage.getItem('yebot_session_id');
    if (!sid) return;
    try {
      const r = await fetch(`/api/chat/situation?sessionId=${encodeURIComponent(sid)}`);
      if (!r.ok) return;
      const d = await r.json();
      setProfile(d?.profile || {});
    } catch {
      // ignore
    }
  }, []);

  const removeProfileKey = useCallback(async (key: string) => {
    const sid = window.localStorage.getItem('yebot_session_id');
    if (!sid) return;
    try {
      const r = await fetch('/api/chat/situation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, op: 'remove', updates: [key] }),
      });
      if (r.ok) {
        const d = await r.json();
        setProfile(d?.profile || {});
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (userContent: string) => {
    if (loading) return;

    const userMsg: Message = { role: 'user', content: userContent };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setLoading(true);

    // Add empty assistant message for streaming
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    await streamChat(
      newMessages,
      (chunk) => {
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === 'assistant') {
            updated[updated.length - 1] = { ...last, content: last.content + chunk };
          }
          return updated;
        });
      },
      () => {
        setLoading(false);
        // 답변 종료 직후 프로필 갱신 시도 (서버 추출 완료 시점 보정 위해 약간 지연)
        setTimeout(() => { void refreshProfile(); }, 1500);
      },
      (errorMsg) => {
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === 'assistant' && !last.content) {
            updated[updated.length - 1] = { ...last, content: errorMsg };
          }
          return updated;
        });
        setLoading(false);
      },
    );
  }, [messages, loading, refreshProfile]);

  // 마운트 시 1회 프로필 로드
  useEffect(() => { void refreshProfile(); }, [refreshProfile]);

  // 외부에서 질문 주입
  useEffect(() => {
    if (injectedQuestion && !loading) {
      const question = injectedQuestion.replace(/_\d+$/, '');
      sendMessage(question);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [injectedQuestion]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput('');
    await sendMessage(text);
  }

  return (
    <div className="flex h-[600px] flex-col rounded-2xl border" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
      {/* 확인된 사용자 상황 띠 */}
      {Object.keys(profile).length > 0 && (
        <div
          className="flex flex-wrap items-center gap-1.5 border-b px-4 py-2 text-xs"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--blue-50)' }}
        >
          <Info size={12} style={{ color: 'var(--blue-500)' }} />
          <span style={{ color: 'var(--color-text-secondary)' }}>확인된 정보:</span>
          {Object.entries(profile).map(([k, v]) => {
            if (k.startsWith('_')) return null;
            if (!PROFILE_LABELS[k]) return null;
            const label = PROFILE_LABELS[k];
            const val = formatProfileValue(k, v);
            if (!val) return null;
            return (
              <span
                key={k}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                style={{ backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }}
              >
                {label}: {val}
                <button
                  type="button"
                  onClick={() => removeProfileKey(k)}
                  className="rounded-full hover:opacity-80"
                  aria-label={`${label} 제거`}
                  title="잘못 추출됐다면 클릭해 제거"
                >
                  <X size={11} style={{ color: 'var(--color-text-tertiary)' }} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-5">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: msg.role === 'user' ? 'var(--blue-50)' : 'var(--grey-100)' }}
            >
              {msg.role === 'user' ? <User size={14} style={{ color: 'var(--blue-500)' }} /> : <Bot size={14} style={{ color: 'var(--grey-600)' }} />}
            </div>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed${msg.role === 'assistant' ? ' chat-markdown' : ''}`}
              style={{
                backgroundColor: msg.role === 'user' ? 'var(--blue-50)' : 'var(--grey-50)',
                color: 'var(--color-text-primary)',
              }}
            >
              {msg.role === 'assistant' ? (
                msg.content ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{linkifyFaqCitations(msg.content)}</ReactMarkdown>
                ) : (
                  <span className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                    <Loader2 size={14} className="animate-spin" />
                    답변 생성 중...
                  </span>
                )
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2 border-t p-4" style={{ borderColor: 'var(--color-border)' }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="노동법에 대해 질문해 주세요..."
          aria-label="노동법에 대한 질문 입력"
          className="flex-1 rounded-lg border px-4 py-2.5 text-[15px] outline-none transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2 focus:border-[var(--color-accent)]"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="flex items-center justify-center rounded-lg px-4 text-white transition-colors"
          style={{ backgroundColor: loading || !input.trim() ? 'var(--grey-300)' : 'var(--color-accent)' }}
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
