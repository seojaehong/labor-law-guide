'use client';

import { useState, useRef, useEffect, useCallback, type FormEvent } from 'react';
import { Send, Bot, User, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

async function streamChat(messages: Message[], onChunk: (text: string) => void, onDone: () => void, onError: (msg: string) => void) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
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
    { role: 'assistant', content: '안녕하세요! 개정 노동조합법(노란봉투법)에 대해 궁금한 점을 질문해 주세요. 사용자 범위, 교섭절차, 노동쟁의 등에 대해 답변해 드립니다.' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

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
      () => setLoading(false),
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
  }, [messages, loading]);

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
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
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
          placeholder="노란봉투법에 대해 질문해 주세요..."
          aria-label="노란봉투법에 대한 질문 입력"
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
