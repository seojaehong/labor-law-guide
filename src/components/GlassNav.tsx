'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, Scale } from 'lucide-react';

const links = [
  { href: '/', label: '홈' },
  { href: '/guide', label: '해석지침' },
  { href: '/checklist', label: '자가진단' },
  { href: '/manual', label: '교섭절차' },
  { href: '/cases', label: '핵심판례' },
  { href: '/database', label: '판례검색' },
  { href: '/news', label: '뉴스' },
  { href: '/ai', label: 'AI 상담' },
  { href: '/contact', label: '문의' },
];

export default function GlassNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <nav className="glass-nav sticky top-0 z-50">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2 font-bold" style={{ color: 'var(--color-accent)', fontSize: 'var(--text-lg)' }}>
          <Scale size={20} />
          <span>노란봉투법 가이드</span>
        </Link>

        {/* Desktop */}
        <div className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-1.5 transition-colors"
              style={{
                fontSize: 'var(--text-sm)',
                fontWeight: pathname === l.href ? 600 : 400,
                color: pathname === l.href ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                backgroundColor: pathname === l.href ? 'var(--color-accent-light)' : 'transparent',
              }}
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* Mobile toggle */}
        <button className="md:hidden" onClick={() => setOpen(!open)} aria-label="메뉴">
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="border-t md:hidden" style={{ borderColor: 'var(--color-border)' }}>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block px-5 py-3"
              style={{
                fontSize: 'var(--text-sm)',
                fontWeight: pathname === l.href ? 600 : 400,
                color: pathname === l.href ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                backgroundColor: pathname === l.href ? 'var(--color-accent-light)' : 'transparent',
              }}
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
