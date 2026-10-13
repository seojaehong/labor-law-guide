"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 연차 도구 내비 — 지금 어느 화면인지 표시한다.
 *
 * 그전에는 `aria-current` 도 활성 표시도 없어서, 세 화면을 오가는 사용자가
 * 링크를 눌렀을 때 도착했는지 확인할 방법이 없었다. CSS 에 활성 스타일
 * (`.lv-tab[aria-current="page"]`)은 이미 있었는데 아무도 쓰지 않았다.
 */
const LINKS = [
  { href: "/tools/leave", label: "연차 일수" },
  { href: "/tools/leave/settlement", label: "퇴직 정산" },
  { href: "/tools/leave/advanced", label: "사용단위·촉진" },
] as const;

export function LeaveNav() {
  const pathname = usePathname();

  return (
    <nav className="lv-nav" aria-label="연차 점검 도구">
      <Link href="/tools/leave" className="lv-nav__brand">
        연차 점검 <span>· 일의 무늬</span>
      </Link>
      <div className="lv-nav__links">
        {LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
