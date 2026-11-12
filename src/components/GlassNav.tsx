'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import { BRAND_NAME } from '@/lib/constants';
const NAV_ITEMS = [
  { href:'/tools', label:'계산·점검 도구' },
  { href:'/blog', label:'글' },
  { href:'/laws', label:'법령 개정' },
  { href:'/tools/work-rules', label:'취업규칙 점검' },
  { href:'/decisions', label:'판례·행정해석' },
];
function active(href: string, pathname: string) {
  if (href === '/decisions') return /^\/(decisions|cases|interpretations|faq)(\/|$)/.test(pathname);
  if (href === '/tools/work-rules') return pathname.startsWith('/tools/work-rules');
  // 취업규칙 점검은 따로 메뉴가 있으니 거기서만 표시한다
  if (href === '/tools') return /^\/(tools|duties|hwp-editor)(\/|$)/.test(pathname) && !pathname.startsWith('/tools/work-rules');
  return pathname === href || pathname.startsWith(href + '/');
}
// 모바일 「추가 메뉴」 — 데스크톱 상단 메뉴와 푸터에서 닿는 큰 갈래를 한 곳에 모은다(261112).
// 종전에는 도구·연차 둘·문의 네 줄뿐이라 AI 도구·FAQ·퇴사 점검표는 모바일에서 푸터까지 내려가야 했다.
const DRAWER_ITEMS = [
  { href:'/tools', label:'계산·점검 도구' },
  { href:'/ai-tools', label:'AI 도구' },
  { href:'/blog', label:'글' },
  { href:'/decisions', label:'판례·행정해석' },
  { href:'/laws', label:'법령 개정' },
  { href:'/tools/work-rules', label:'취업규칙 점검' },
  { href:'/faq', label:'FAQ' },
  { href:'/exit', label:'퇴사 한 번에' },
  { href:'/exit-employer', label:'직원 퇴사 처리' },
  { href:'/contact', label:'서비스 문의' },
];
export default function GlassNav() {
  const pathname = usePathname();
  const [mobileOpen,setMobileOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!mobileOpen) return;
    const close = (event:KeyboardEvent) => { if(event.key==='Escape') { setMobileOpen(false); trigger.current?.focus(); } };
    document.addEventListener('keydown',close);
    // 열린 동안 뒤 페이지가 같이 스크롤되지 않게 한다. 메뉴 자체는 .editorial-mobile-menu 가 스크롤한다.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // 가로로 돌려 768px 이상이 되면 여닫는 단추가 사라진다 — 잠긴 채 남지 않게 닫는다.
    const wide = window.matchMedia('(min-width: 768px)');
    const onWide = () => { if (wide.matches) setMobileOpen(false); };
    wide.addEventListener('change', onWide);
    return () => { document.removeEventListener('keydown',close); wide.removeEventListener('change', onWide); document.body.style.overflow = prevOverflow; };
  },[mobileOpen]);
  // 모바일 줄(5칸)은 390px 에서 칸이 75px 남짓이라 「판례·행정해석」이 두 줄로 갈렸다 — 줄에서만 「판례·해석」으로 줄인다.
  const links = (rail: boolean) => NAV_ITEMS.map(item => <Link key={item.href} href={item.href} className="nav-link editorial-nav-link" aria-current={active(item.href,pathname)?'page':undefined} onClick={()=>setMobileOpen(false)}><span>{item.href === '/decisions' ? (rail ? '판례·해석' : <>판례·<wbr />행정해석</>) : item.href === '/tools' ? <>계산·점검<span className="nav-tools-suffix"> 도구</span></> : item.label}</span></Link>);
  return <nav className="glass-nav editorial-nav sticky top-0 z-50" aria-label="주요 탐색">
    <div className="layout-wide layout-wide--chrome editorial-nav-inner">
      <Link href="/" className="editorial-wordmark" aria-current={pathname==='/'?'page':undefined}>
        <Image className="editorial-logo-light" src="/brand/work-patterns-wordmark-original.svg" width={141} height={40} alt={BRAND_NAME} priority />
        <Image className="editorial-logo-dark" src="/brand/work-patterns-wordmark-original-dark.svg" width={141} height={40} alt={BRAND_NAME} priority />
      </Link>
      <div className="editorial-desktop-links">{links(false)}</div>
      <div className="editorial-nav-controls"><ThemeToggle /><Link className="editorial-service-link editorial-desktop-service" href="/contact">서비스 문의</Link>
        <button ref={trigger} className="editorial-menu-toggle" onClick={()=>setMobileOpen(!mobileOpen)} aria-expanded={mobileOpen} aria-controls="mobile-navigation" aria-label={mobileOpen?'추가 메뉴 닫기':'추가 메뉴 열기'}>{mobileOpen?<X size={20}/>:<Menu size={20}/>}</button>
      </div>
    </div>
    <div className="editorial-mobile-rail">{links(true)}</div>
    {mobileOpen && <div id="mobile-navigation" className="editorial-mobile-menu"><div className="layout-wide layout-wide--chrome">
      {DRAWER_ITEMS.map(item => <Link key={item.href} className="mobile-nav-row" href={item.href} aria-current={pathname===item.href?'page':undefined} onClick={()=>setMobileOpen(false)}>{item.label}</Link>)}
      <p className="editorial-menu-note">그 밖의 자료는 하단에서 찾을 수 있습니다. 검토 중인 기능은 별도로 표시합니다.</p>
    </div></div>}
  </nav>;
}
