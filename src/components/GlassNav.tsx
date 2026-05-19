'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, Scale, ChevronDown } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

// ─── Navigation structure ───────────────────────────────────────────────────

type DropdownItem = { href: string; label: string; description?: string };
type NavItem =
  | { kind: 'link'; href: string; label: string }
  | { kind: 'dropdown'; label: string; items: DropdownItem[] }
  | { kind: 'cta'; href: string; label: string };

const NAV_ITEMS: NavItem[] = [
  { kind: 'link', href: '/', label: '홈' },
  {
    kind: 'dropdown',
    label: '노란봉투법',
    items: [
      { href: '/guide', label: '핵심 가이드', description: '법 조항 해석 및 실무 지침' },
      { href: '/checklist', label: '자가진단', description: '우리 사업장 적용 여부 확인' },
      { href: '/manual', label: '교섭절차', description: '단계별 교섭 진행 방법' },
      { href: '/cases', label: '핵심판례', description: '주요 판결 요약 모음' },
    ],
  },
  {
    kind: 'dropdown',
    label: '판례·법령',
    items: [
      { href: '/database', label: '판례 검색', description: '전문 판례 DB 검색' },
      { href: '/sanction', label: 'AI 비교분석', description: 'AI로 유사 판례 비교분석' },
      { href: '/search', label: '판정례 검색', description: '63,000건+ 판정례 검색' },
      { href: '/news', label: '뉴스', description: '최신 노동법 뉴스' },
    ],
  },
  {
    kind: 'dropdown',
    label: '도구',
    items: [
      { href: '/ai', label: 'AI 상담', description: '24시간 노동법 AI 챗봇' },
      { href: '/tools/holiday-pay', label: '공휴일·노동절 수당', description: '5인 이상/미만 × 월급·일용·시급' },
      { href: '/tools/severance.html', label: '퇴직금 계산기', description: '평균임금·통상임금 + 퇴직소득세' },
      { href: '/subsidy', label: '지원금', description: '고용·창업 지원금 가이드' },
      { href: '/faq', label: 'FAQ', description: '자주 묻는 질문' },
    ],
  },
  { kind: 'link', href: '/blog', label: '블로그' },
  { kind: 'cta', href: '/contact', label: '상담' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isDropdownActive(items: DropdownItem[], pathname: string): boolean {
  return items.some((item) => pathname === item.href || pathname.startsWith(item.href + '/'));
}

// ─── Desktop Dropdown ────────────────────────────────────────────────────────

function DesktopDropdown({ item, pathname }: { item: Extract<NavItem, { kind: 'dropdown' }>; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = isDropdownActive(item.items, pathname);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleMouseEnter() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  }

  function handleMouseLeave() {
    timeoutRef.current = setTimeout(() => setOpen(false), 100);
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        className="nav-link flex items-center gap-1"
        style={{
          fontWeight: active ? 600 : 400,
          color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
          backgroundColor: active ? 'var(--color-accent-light)' : 'transparent',
        }}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        {item.label}
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease-in-out',
          }}
        >
          <ChevronDown size={14} strokeWidth={2.5} />
        </span>
      </button>

      {open && (
        <div
          className="nav-dropdown"
          role="menu"
          style={{
            opacity: open ? 1 : 0,
            transform: open ? 'translateY(0) scale(1)' : 'translateY(-6px) scale(0.97)',
            transition: 'opacity 0.18s ease, transform 0.18s ease',
          }}
        >
          {item.items.map((child) => {
            const childActive = pathname === child.href || pathname.startsWith(child.href + '/');
            return (
              <Link
                key={child.href}
                href={child.href}
                role="menuitem"
                className="nav-dropdown-item"
                style={{
                  color: childActive ? 'var(--color-accent)' : 'var(--color-text-primary)',
                  backgroundColor: childActive ? 'var(--color-accent-light)' : 'transparent',
                }}
                onClick={() => setOpen(false)}
              >
                <span className="nav-dropdown-item-label">{child.label}</span>
                {child.description && (
                  <span className="nav-dropdown-item-desc">{child.description}</span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Mobile accordion item ───────────────────────────────────────────────────

function MobileDropdown({
  item,
  pathname,
  onNavigate,
}: {
  item: Extract<NavItem, { kind: 'dropdown' }>;
  pathname: string;
  onNavigate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const active = isDropdownActive(item.items, pathname);
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div>
      <button
        className="mobile-nav-row flex w-full items-center justify-between"
        style={{
          fontWeight: active ? 600 : 400,
          color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
        }}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>{item.label}</span>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        >
          <ChevronDown size={16} />
        </span>
      </button>

      <div
        ref={contentRef}
        style={{
          overflow: 'hidden',
          maxHeight: open ? '500px' : '0',
          opacity: open ? 1 : 0,
          transition: 'max-height 0.22s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.22s ease',
        }}
      >
        <div className="mobile-nav-sub" role="menu">
          {item.items.map((child) => {
            const childActive = pathname === child.href || pathname.startsWith(child.href + '/');
            return (
              <Link
                key={child.href}
                href={child.href}
                role="menuitem"
                onClick={onNavigate}
                className="mobile-nav-sub-item"
                style={{
                  fontWeight: childActive ? 600 : 400,
                  color: childActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  backgroundColor: childActive ? 'var(--color-accent-light)' : 'transparent',
                }}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GlassNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  function closeMobile() {
    setMobileOpen(false);
  }

  return (
    <nav className="glass-nav sticky top-0 z-50">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-5">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2 font-bold"
          style={{ color: 'var(--color-accent)', fontSize: 'var(--text-lg)' }}
        >
          <Scale size={20} />
          <span>노란봉투법 가이드</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-0.5 md:flex">
          {NAV_ITEMS.map((item) => {
            if (item.kind === 'dropdown') {
              return <DesktopDropdown key={item.label} item={item} pathname={pathname} />;
            }

            if (item.kind === 'cta') {
              return (
                <span key={item.href} className="flex items-center gap-1">
                  <ThemeToggle />
                  <Link href={item.href} className="nav-cta">
                    {item.label}
                  </Link>
                </span>
              );
            }

            // plain link
            const active = pathname === item.href;
            const isExternal = item.href.startsWith('http');
            return (
              <Link
                key={item.href}
                href={item.href}
                className="nav-link"
                {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                style={{
                  fontWeight: active ? 600 : 400,
                  color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  backgroundColor: active ? 'var(--color-accent-light)' : 'transparent',
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Mobile hamburger */}
        <button
          className="flex items-center justify-center rounded-lg p-2 transition-colors md:hidden"
          style={{ color: 'var(--color-text-secondary)' }}
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? '메뉴 닫기' : '메뉴 열기'}
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile menu */}
      <div
        style={{
          overflow: 'hidden',
          maxHeight: mobileOpen ? '600px' : '0',
          opacity: mobileOpen ? 1 : 0,
          transition: 'max-height 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease',
          borderTop: mobileOpen ? '1px solid var(--color-border)' : 'none',
        }}
        className="md:hidden"
      >
        <div className="flex flex-col px-4 py-2 pb-4">
          {NAV_ITEMS.map((item) => {
            if (item.kind === 'dropdown') {
              return (
                <MobileDropdown
                  key={item.label}
                  item={item}
                  pathname={pathname}
                  onNavigate={closeMobile}
                />
              );
            }

            if (item.kind === 'cta') {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMobile}
                  className="nav-cta mt-3 w-full text-center"
                >
                  {item.label}
                </Link>
              );
            }

            const active = pathname === item.href;
            const isExternal = item.href.startsWith('http');
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMobile}
                {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="mobile-nav-row"
                style={{
                  fontWeight: active ? 600 : 400,
                  color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  backgroundColor: active ? 'var(--color-accent-light)' : 'transparent',
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
