'use client';

import { useState } from 'react';
import { Mail, Check, AlertCircle } from 'lucide-react';

interface SubscribeFormProps {
  source: 'article-footer' | 'home-bottom' | 'sidebar' | 'contact' | 'decision-footer' | 'search-results';
  sourceSlug?: string;
  variant?: 'compact' | 'full';
}

const CONSENT_TEXT =
  '노란봉투법 가이드의 노동법 인사이트(주 1~2회 발송) 수신에 동의합니다. 메일 하단의 해지 버튼을 한 번만 눌러도 즉시 해지돼요.';

export default function SubscribeForm({ source, sourceSlug, variant = 'full' }: SubscribeFormProps) {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');

  const isCompact = variant === 'compact';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!consent) {
      setError('수신 동의에 체크해주셔야 신청할 수 있어요.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('이메일 형식이 올바르지 않습니다.');
      return;
    }

    setStatus('loading');
    try {
      const r = await fetch('/api/subscribers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          source,
          source_slug: sourceSlug || null,
          consent_text: CONSENT_TEXT,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setStatus('error');
        setError(data.error || '신청에 실패했습니다.');
        return;
      }
      setStatus('success');
      setEmail('');
      setConsent(false);
    } catch {
      setStatus('error');
      setError('네트워크 오류가 발생했습니다.');
    }
  }

  if (status === 'success') {
    return (
      <div
        className="flex items-start gap-3 rounded-xl border p-4"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}
      >
        <Check size={20} style={{ color: '#16a34a', marginTop: 2 }} />
        <div>
          <p className="text-[14px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            구독 신청 완료, 감사합니다 🙏
          </p>
          <p className="mt-1 text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
            첫 메일은 5월 둘째 주부터 보내드릴 예정이에요. 받은편지함이나 스팸함에서 확인해주세요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`rounded-2xl border ${isCompact ? 'p-5' : 'p-6 sm:p-7'}`}
      style={{
        borderColor: isCompact ? 'var(--color-border)' : 'var(--color-accent)',
        borderWidth: isCompact ? '1px' : '1.5px',
        backgroundColor: isCompact ? 'var(--color-bg-surface)' : 'var(--color-accent-soft, #fff8e6)',
      }}
    >
      <div className={`flex items-center gap-2 ${isCompact ? 'mb-2' : 'mb-3'}`}>
        <Mail size={isCompact ? 16 : 20} style={{ color: 'var(--color-accent)' }} />
        <h3
          className={`font-bold ${isCompact ? 'text-[14px]' : 'text-[17px] sm:text-[18px]'}`}
          style={{ color: 'var(--color-text-primary)' }}
        >
          {isCompact ? '노동법 인사이트 뉴스레터' : '매일 아침, 노동뉴스 핵심만 받아보세요'}
        </h3>
      </div>
      <p
        className={`${isCompact ? 'text-[12px] mb-3' : 'text-[13px] sm:text-[14px] mb-4 leading-relaxed'}`}
        style={{ color: 'var(--color-text-secondary)' }}
      >
        {isCompact
          ? '주 1~2회 — 행정해석 변경, 신규 판례, 실무 가이드를 받아보세요.'
          : '평일 매일 KST 09:00 — 어제 발생한 노동 이슈, 새 행정해석, 핵심 판례 1건을 5분 안에 파악할 수 있게 정리해서 보내드립니다. 언제든 1초 해지.'}
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="example@email.com"
          aria-label="이메일 주소"
          required
          disabled={status === 'loading'}
          className={`flex-1 rounded-lg border outline-none transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2 focus:border-[var(--color-accent)] ${
            isCompact ? 'px-3 py-2 text-[13px]' : 'px-4 py-3 text-[14px]'
          }`}
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className={`rounded-lg font-semibold transition-colors disabled:opacity-50 ${
            isCompact ? 'px-4 py-2 text-[13px]' : 'px-5 py-3 text-[14px]'
          }`}
          style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
        >
          {status === 'loading' ? '전송 중...' : isCompact ? '구독하기' : '무료 구독하기'}
        </button>
      </div>

      <label className="mt-3 flex items-start gap-2 text-[11px] cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 cursor-pointer"
        />
        <span>{CONSENT_TEXT}</span>
      </label>

      {error && (
        <div className="mt-2 flex items-start gap-1.5 text-[11px]" style={{ color: '#dc2626' }}>
          <AlertCircle size={12} style={{ marginTop: 2 }} />
          <span>{error}</span>
        </div>
      )}
    </form>
  );
}
