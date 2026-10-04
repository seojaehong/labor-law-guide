'use client';

import { useSyncExternalStore } from 'react';
import { getThemeSnapshot, getServerThemeSnapshot, subscribeToTheme, toggleTheme } from '@/lib/theme';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
  const dark = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);

  return (
    <button
      onClick={toggleTheme}
      aria-label={dark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 transition-colors hover:bg-[var(--grey-100)]"
      style={{ color: 'var(--color-text-secondary)' }}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
