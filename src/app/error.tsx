'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Page error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h2
        className="mb-3 text-2xl font-bold"
        style={{ color: 'var(--color-text-primary)' }}
      >
        문제가 발생했습니다
      </h2>
      <p
        className="mb-6 max-w-md text-sm"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        페이지를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
      </p>
      <button
        onClick={reset}
        className="rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-colors"
        style={{ backgroundColor: 'var(--color-accent)' }}
      >
        다시 시도
      </button>
    </div>
  );
}
