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

// 2026-09-12 — 4개 그룹 20개 항목에서 3개로 줄였다.
//
// 근거는 실측이다. 라우트 20개의 서버 렌더 본문 글자 수를 재 보니 9개가 800자 미만인
// 껍데기였고, 정작 가장 두꺼운 /decisions(16,224자 · 판정례 61,928건)는 메뉴에 아예 없었다.
// 대신 240자짜리 /search 가 메뉴에 있었다. 게다가 검색 성격 진입로가 다섯 개라
// (판례 검색·판정례 검색·AI 비교분석·핵심판례·그리고 메뉴에 없는 /decisions)
// 들어온 사람이 무엇을 눌러야 하는지 알 방법이 없었다.
//
// 메뉴에서 내린 것들은 **지우지 않았다.** 푸터(layout.tsx)에 남아 있고 주소도 그대로다.
// 되살리려면 여기 배열에 한 줄 추가하면 된다.
const NAV_ITEMS: NavItem[] = [
  { kind: 'link', href: '/decisions', label: '판정례 검색' },
  { kind: 'link', href: '/blog', label: '노동 딥다이브' },
  {
    kind: 'dropdown',
    label: '알아보기',
    items: [
      { href: '/guide', label: '핵심 가이드', description: '법 조항 해석 및 실무 지침' },
      { href: '/checklist', label: '자가진단', description: '우리 사업장 적용 여부 확인' },
      { href: '/manual', label: '교섭절차', description: '단계별 교섭 진행 방법' },
      { href: '/faq', label: 'FAQ', description: '자주 묻는 질문' },
    ],
  },
  { kind: 'cta', href: '/contact', label: '상담' },
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
                <Link href={item.href} className="nav-cta" aria-current={isActive(item.href, pathname) ? 'page' : undefined}>{item.label}</Link>
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
                className={item.kind === 'cta' ? 'nav-cta mt-3 text-center' : 'mobile-nav-row'}
                aria-current={isActive(item.href, pathname) ? 'page' : undefined}>{item.label}</Link>;
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
