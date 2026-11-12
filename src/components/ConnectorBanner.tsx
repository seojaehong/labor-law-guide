'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { dismissBanner, getServerSnapshot, getSnapshot, shouldShowBanner, subscribe } from '@/lib/connector-banner';

export default function ConnectorBanner() {
  const pathname = usePathname();
  const dismissed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!shouldShowBanner(pathname, dismissed)) return null;

  return (
    <div
      role="region"
      aria-label="Claude 연결 안내"
      className="connector-banner flex items-center gap-2 border-b px-4 print:hidden"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-surface)' }}
    >
      <Link
        href="/ai-tools"
        className="min-w-0 flex-1 py-1.5 text-center text-[13px] font-semibold underline-offset-4 hover:underline [overflow-wrap:anywhere]"
        style={{ color: 'var(--color-accent-ink, var(--color-accent))' }}
      >
        내 Claude에서 바로 쓰기 <span aria-hidden>→</span>
      </Link>
      <button
        type="button"
        onClick={dismissBanner}
        aria-label="안내 닫기"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}
