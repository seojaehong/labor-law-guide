'use client';

import { useState } from 'react';
import { Mail, Check, AlertCircle } from 'lucide-react';

interface SubscribeFormProps {
  source: 'article-footer' | 'home-bottom' | 'sidebar' | 'contact';
  sourceSlug?: string;
  variant?: 'compact' | 'full';
}

const CONSENT_TEXT =
  '뉴스레터 수신에 동의합니다. 노란봉투법 가이드는 노동법 신규 콘텐츠와 행정해석 변경 알림을 주 1~2회 보내드립니다. 언제든 1-click으로 구독 해지할 수 있습니다.';

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
      setError('수신 동의에 체크해주세요 (정통망법 의무).');
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
            확인 메일을 보냈어요
          </p>
          <p className="mt-1 text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
            받은 편지함에서 확인 링크를 눌러주세요. 정통망법에 따라 double opt-in으로 처리됩니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`rounded-2xl border p-5 ${isCompact ? '' : 'p-6'}`}
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Mail size={16} style={{ color: 'var(--color-accent)' }} />
        <h3 className="text-[14px] font-bold" style={{ color: 'var(--color-text-primary)' }}>
          노동법 인사이트 뉴스레터
        </h3>
      </div>
      <p className="text-[12px] mb-3" style={{ color: 'var(--color-text-secondary)' }}>
        주 1~2회 — 행정해석 변경, 신규 판례, 실무 가이드를 받아보세요.
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
          className="flex-1 rounded-lg border px-3 py-2 text-[13px] outline-none transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2 focus:border-[var(--color-accent)]"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
        >
          {status === 'loading' ? '전송 중...' : '구독하기'}
        </button>
      </div>

      <label className="mt-3 flex items-start gap-2 text-[11px] cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 cursor-pointer"
        />
        <span>
          [필수] {CONSENT_TEXT}
        </span>
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
