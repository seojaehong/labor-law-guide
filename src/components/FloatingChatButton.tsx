'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function FloatingChatButton() {
  const pathname = usePathname();

  // /ai 페이지에서는 챗봇이 이미 있으므로 숨김
  if (pathname?.startsWith('/ai')) return null;

  return (
    <Link
      href="/ai"
      aria-label="AI 노동법 상담 챗봇 열기"
      className="fixed bottom-5 right-5 z-50 inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 py-3 text-[13px] font-semibold transition-transform hover:-translate-y-px active:translate-y-0"
      style={{
        backgroundColor: 'var(--color-accent-ink)',
        color: 'white',
        // §5.4 규율 3 — 하드코딩 그림자 금지. 부유 요소는 --shadow-lg.
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      <span className="hidden sm:inline">AI 노동법 상담</span>
      <span className="sm:hidden">AI 상담</span>
    </Link>
  );
}
