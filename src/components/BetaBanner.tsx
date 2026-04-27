'use client';

import { useState, useEffect } from 'react';
import BetaSignupForm from './BetaSignupForm';

const DISMISS_KEY = 'yh_beta_banner_dismissed_at';
const DISMISS_TTL_MS = 7 * 24 * 3600 * 1000; // 7일 후 다시 표시

export default function BetaBanner() {
  const [visible, setVisible] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const dismissedAt = window.localStorage.getItem(DISMISS_KEY);
    if (dismissedAt && Date.now() - parseInt(dismissedAt, 10) < DISMISS_TTL_MS) {
      setVisible(false);
      return;
    }
    setVisible(true);
  }, []);

  function dismiss() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    }
    setVisible(false);
    setShowForm(false);
  }

  if (!visible) return null;

  return (
    <>
      <div
        className="w-full border-b px-4 py-2 text-center text-xs sm:text-sm"
        style={{
          backgroundColor: 'var(--blue-50, #eff6ff)',
          borderColor: 'var(--color-border)',
          color: 'var(--blue-700, #1d4ed8)',
        }}
        role="region"
        aria-label="베타 서비스 안내"
      >
        <span className="mr-2 font-medium">🚧 무료 베타 운영 중</span>
        <span className="hidden sm:inline">— 정식 출시 시 베타 사용자에게 우선 혜택을 드립니다.</span>
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          className="ml-2 rounded px-2 py-0.5 font-medium underline-offset-2 hover:underline"
          style={{ color: 'inherit' }}
        >
          알림 받기
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="배너 닫기 (7일간)"
          className="ml-2 px-1.5 opacity-60 hover:opacity-100"
        >
          ✕
        </button>
      </div>
      {showForm && (
        <div className="mx-auto mt-3 max-w-xl px-4">
          <BetaSignupForm
            source="banner"
            headline="정식 출시 시 우선 알림 받기"
            subline="베타 기간 무료, 정식 출시 시 우선 혜택. 연락처를 남겨주세요."
            onClose={() => setShowForm(false)}
          />
        </div>
      )}
    </>
  );
}
