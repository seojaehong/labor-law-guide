'use client';

import { useState } from 'react';

type Props = {
  source: 'banner' | 'rate_limit' | 'modal';
  /** 결제의향 폼 위 안내 문구. 트리거 컨텍스트별로 다르게. */
  headline?: string;
  subline?: string;
  /** 닫기 버튼 노출 여부 */
  onClose?: () => void;
};

function getSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('yebot_session_id');
}

export default function BetaSignupForm({ source, headline, subline, onClose }: Props) {
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed) {
      setResult({ ok: false, msg: '개인정보 수집·이용 동의가 필요합니다.' });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const r = await fetch('/api/payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact, message, source, sessionId: getSessionId() }),
      });
      const d = await r.json();
      if (!r.ok) {
        setResult({ ok: false, msg: d.error || '오류가 발생했습니다.' });
      } else {
        setResult({ ok: true, msg: d.message || '신청 완료!' });
        setContact('');
        setMessage('');
      }
    } catch {
      setResult({ ok: false, msg: '네트워크 오류. 잠시 후 다시 시도해주세요.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border p-5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
            {headline || '정식 출시 시 우선 알림 받기'}
          </h3>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {subline || '베타 사용자에게는 정식 출시 시 우선 혜택을 드릴 예정입니다. 알림 받을 연락처를 남겨주세요.'}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-sm"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            ✕
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          required
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="이메일 또는 휴대폰 (예: name@example.com / 010-0000-0000)"
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          style={{ borderColor: 'var(--color-border)' }}
        />
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="(선택) 어떤 기능이 가장 필요한가요? 정식 출시 시 우선 반영할게요."
          rows={2}
          maxLength={500}
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          style={{ borderColor: 'var(--color-border)' }}
        />

        <label className="flex items-start gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            정식 출시 알림 발송을 위한 개인정보 수집·이용에 동의합니다 (수집항목: 연락처/메시지, 보유기간: 1년 또는 철회 시까지).
          </span>
        </label>

        <button
          type="submit"
          disabled={loading || !contact || !agreed}
          className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          {loading ? '처리 중...' : '알림 받기'}
        </button>

        {result && (
          <div
            className="rounded-lg px-3 py-2 text-sm"
            style={{
              backgroundColor: result.ok ? '#ecfdf5' : '#fef2f2',
              color: result.ok ? '#065f46' : '#991b1b',
            }}
          >
            {result.msg}
          </div>
        )}
      </form>
    </div>
  );
}
