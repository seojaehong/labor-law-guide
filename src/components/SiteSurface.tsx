'use client';
import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
export default function SiteSurface({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const privateView = pathname.startsWith('/admin') || pathname.startsWith('/pkb');
  const family = pathname === '/' ? 'home' : /^(\/laws|\/tools|\/checklist|\/harassment|\/sanction|\/ai|\/stats|\/subsidy|\/contact)/.test(pathname) ? 'tool' : /^(\/blog\/[^/]+|\/cases\/[^/]+|\/decisions\/[^/]+|\/interpretations\/|\/guide|\/manual|\/privacy|\/terms|\/lecture)/.test(pathname) && !pathname.startsWith('/blog/category') ? 'document' : 'collection';
  // Route children can suspend while their server-component payload arrives.
  // Keep hydration retries inside this boundary instead of reusing the surface's DOM cursor.
  return <div className={privateView ? 'private-surface' : 'public-surface'} data-family={family}><Suspense fallback={null}>{children}</Suspense></div>;
}
