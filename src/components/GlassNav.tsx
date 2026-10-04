'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Menu, X, ChevronDown } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import { BRAND_NAME } from '@/lib/constants';

// ─── Navigation structure ───────────────────────────────────────────────────

type DropdownItem = { href: string; label: string; description?: string };
type NavItem =
  | { kind: 'link'; href: string; label: string }
  | { kind: 'dropdown'; label: string; items: DropdownItem[] }
  | { kind: 'cta'; href: string; label: string };

// Public launch navigation includes only the selected, usable surfaces.
// Existing lower-confidence routes remain available from the labelled footer.
const NAV_ITEMS: NavItem[] = [
  { kind: 'link', href: '/blog', label: '글' },
  { kind: 'link', href: '/decisions', label: '판례·행정해석' },
  {
    kind: 'dropdown',
    label: '실무도구',
    items: [
      { href: '/laws', label: '노동법 개정 알림', description: '곧 시행되는 개정과 조문 비교' },
      { href: '/tools/holiday-pay', label: '공휴일·노동절 수당', description: '입력 조건에 따른 참고 계산' },
    ],
  },
  { kind: 'cta', href: '/contact', label: '전문서비스' },
];

function isActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(href + '/');
}

function DesktopDropdown({ item, pathname }: { item: Extract<NavItem, { kind: 'dropdown' }>; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);
  const active = item.items.some((child) => isActive(child.href, pathname));

  useEffect(() => {
    if (!open) return;
    function dismiss(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative" onMouseEnter={() => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      setOpen(true);
    }} onMouseLeave={() => {
      hoverTimer.current = setTimeout(() => {
        if (!ref.current?.contains(document.activeElement)) setOpen(false);
      }, 120);
    }} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
    }}>
      <button ref={triggerRef} className="nav-link editorial-nav-link" data-active={active || undefined}
        aria-expanded={open} aria-controls="desktop-learn-menu" onClick={() => setOpen(!open)}>
        {item.label}<ChevronDown size={14} className={open ? 'rotate-180' : ''} />
      </button>
      {open && (
        <div id="desktop-learn-menu" className="nav-dropdown editorial-nav-dropdown">
          {item.items.map((child) => (
            <Link key={child.href} href={child.href} className="nav-dropdown-item"
              aria-current={isActive(child.href, pathname) ? 'page' : undefined} onClick={() => setOpen(false)}>
              <span className="nav-dropdown-item-label">{child.label}</span>
              {child.description && <span className="nav-dropdown-item-desc">{child.description}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function MobileDropdown({ item, pathname, onNavigate }: {
  item: Extract<NavItem, { kind: 'dropdown' }>;
  pathname: string;
  onNavigate: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button className="mobile-nav-row flex w-full items-center justify-between"
        onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="mobile-learn-menu">
        {item.label}<ChevronDown size={16} className={open ? 'rotate-180' : ''} />
      </button>
      {open && (
        <div id="mobile-learn-menu" className="mobile-nav-sub">
          {item.items.map((child) => (
            <Link key={child.href} href={child.href} className="mobile-nav-sub-item" onClick={onNavigate}
              aria-current={isActive(child.href, pathname) ? 'page' : undefined}>{child.label}</Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GlassNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileOpen(false);
        mobileTriggerRef.current?.focus();
      }
    }
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [mobileOpen]);

  return (
    <nav className="glass-nav editorial-nav sticky top-0 z-50" aria-label="주요 탐색">
      <div className="layout-wide layout-wide--chrome editorial-nav-inner">
        <Link href="/" className="editorial-wordmark" aria-current={pathname === '/' ? 'page' : undefined}>
          <Image className="editorial-logo-light" src="/brand/work-patterns-wordmark-ink.svg" width={168} height={42} alt={BRAND_NAME} priority />
          <Image className="editorial-logo-dark" src="/brand/work-patterns-wordmark-dark.svg" width={168} height={42} alt={BRAND_NAME} priority />
        </Link>
        <div className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => {
            if (item.kind === 'dropdown') return <DesktopDropdown key={item.label} item={item} pathname={pathname} />;
            if (item.kind === 'cta') return (
              <span key={item.href} className="ml-3 flex items-center gap-3">
                <ThemeToggle />
                <Link href={item.href} className="editorial-service-link" aria-current={isActive(item.href, pathname) ? 'page' : undefined}>{item.label}</Link>
              </span>
            );
            return <Link key={item.href} href={item.href} className="nav-link editorial-nav-link"
              aria-current={isActive(item.href, pathname) ? 'page' : undefined}>{item.label}</Link>;
          })}
        </div>
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button ref={mobileTriggerRef} className="editorial-menu-toggle" onClick={() => setMobileOpen(!mobileOpen)}
            aria-expanded={mobileOpen} aria-controls="mobile-navigation" aria-label={mobileOpen ? '메뉴 닫기' : '메뉴 열기'}>
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
      {mobileOpen && (
        <div id="mobile-navigation" className="editorial-mobile-menu md:hidden">
          <div className="layout-wide layout-wide--chrome flex flex-col py-4">
            {NAV_ITEMS.map((item) => {
              if (item.kind === 'dropdown') return <MobileDropdown key={item.label} item={item} pathname={pathname} onNavigate={() => setMobileOpen(false)} />;
              return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                className={item.kind === 'cta' ? 'mobile-nav-row editorial-service-link mt-3' : 'mobile-nav-row'}
                aria-current={isActive(item.href, pathname) ? 'page' : undefined}>{item.label}</Link>;
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
