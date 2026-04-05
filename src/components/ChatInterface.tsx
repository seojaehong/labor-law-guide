'use client';

import { useState, useRef, useEffect, type FormEvent } from 'react';
import { Send, Bot, User, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  role: 'user' | 'assistant';
  content: string;
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

  // 외부에서 질문 주입
  useEffect(() => {
    if (injectedQuestion && !loading) {
      const question = injectedQuestion.replace(/_\d+$/, '');
      const userMsg: Message = { role: 'user', content: question };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);
      fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMsg] }),
      })
        .then((res) => res.json())
        .then((data) => setMessages((prev) => [...prev, { role: 'assistant', content: data.content }]))
        .catch(() => setMessages((prev) => [...prev, { role: 'assistant', content: '오류가 발생했습니다. 다시 시도해 주세요.' }]))
        .finally(() => setLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [injectedQuestion]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg: Message = { role: 'user', content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMsg] }),
      });

      if (!res.ok) throw new Error('API error');

      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: data.content }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'API 키가 설정되지 않았거나 서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' },
      ]);
    } finally {
      setLoading(false);
    }
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
                color: 'var(--grey-800)',
              }}
            >
              {msg.role === 'assistant' ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--grey-100)' }}>
              <Loader2 size={14} className="animate-spin" style={{ color: 'var(--grey-600)' }} />
            </div>
            <div className="rounded-2xl px-4 py-3 text-sm" style={{ backgroundColor: 'var(--grey-50)', color: 'var(--grey-500)' }}>답변 생성 중...</div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2 border-t p-4" style={{ borderColor: 'var(--color-border)' }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="노란봉투법에 대해 질문해 주세요..."
          className="flex-1 rounded-lg border px-4 py-2.5 text-[15px] outline-none transition-colors focus:border-[var(--color-accent)]"
          style={{ borderColor: 'var(--color-border)' }}
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
