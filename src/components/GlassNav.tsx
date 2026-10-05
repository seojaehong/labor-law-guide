'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import { BRAND_NAME } from '@/lib/constants';
const NAV_ITEMS = [
  { href:'/blog', label:'일의 이야기' },
  { href:'/laws', label:'달라지는 일' },
  { href:'/tools', label:'내 일 점검' },
  { href:'/decisions', label:'근거 찾기' },
];
function active(href: string, pathname: string) {
  if (href === '/decisions') return /^\/(decisions|cases|interpretations|faq)(\/|$)/.test(pathname);
  if (href === '/tools') return /^\/(tools|checklist|harassment|sanction|subsidy)(\/|$)/.test(pathname);
  return pathname === href || pathname.startsWith(href + '/');
}
export default function GlassNav() {
  const pathname = usePathname();
  const [mobileOpen,setMobileOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!mobileOpen) return;
    const close = (event:KeyboardEvent) => { if(event.key==='Escape') { setMobileOpen(false); trigger.current?.focus(); } };
    document.addEventListener('keydown',close);
    return () => document.removeEventListener('keydown',close);
  },[mobileOpen]);
  const links = NAV_ITEMS.map(item => <Link key={item.href} href={item.href} className="nav-link editorial-nav-link" aria-current={active(item.href,pathname)?'page':undefined} onClick={()=>setMobileOpen(false)}>{item.label}</Link>);
  return <nav className="glass-nav editorial-nav sticky top-0 z-50" aria-label="주요 탐색">
    <div className="layout-wide layout-wide--chrome editorial-nav-inner">
      <Link href="/" className="editorial-wordmark" aria-current={pathname==='/'?'page':undefined}>
        <Image className="editorial-logo-light" src="/brand/work-patterns-wordmark-ink.svg" width={153} height={40} alt={BRAND_NAME} priority />
        <Image className="editorial-logo-dark" src="/brand/work-patterns-wordmark-dark.svg" width={153} height={40} alt={BRAND_NAME} priority />
      </Link>
      <div className="editorial-desktop-links">{links}</div>
      <div className="editorial-nav-controls"><ThemeToggle /><Link className="editorial-service-link editorial-desktop-service" href="/contact">소개·상담</Link>
        <button ref={trigger} className="editorial-menu-toggle" onClick={()=>setMobileOpen(!mobileOpen)} aria-expanded={mobileOpen} aria-controls="mobile-navigation" aria-label={mobileOpen?'추가 메뉴 닫기':'추가 메뉴 열기'}>{mobileOpen?<X size={20}/>:<Menu size={20}/>}</button>
      </div>
    </div>
    <div className="editorial-mobile-rail">{links}</div>
    {mobileOpen && <div id="mobile-navigation" className="editorial-mobile-menu"><div className="layout-wide layout-wide--chrome">
      <Link className="mobile-nav-row" href="/contact" onClick={()=>setMobileOpen(false)}>소개·상담</Link>
      <p className="editorial-menu-note">기존 자료는 하단에서 찾을 수 있습니다. 검토 중인 기능은 별도로 표시합니다.</p>
    </div></div>}
  </nav>;
}
