import { publicMetadata } from '@/lib/public-metadata';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Calculator, Coins, FileCheck2 } from 'lucide-react';
import { SITE_URL } from '@/lib/constants';
import { TOOLS, type ToolIcon } from '@/content/tools-registry';

export const metadata: Metadata = publicMetadata({
  title: '노무 계산기 모음 | 퇴직금·공휴일 수당 | 일의 무늬',
  description:
    '실무자가 자주 쓰는 노무 계산기. 퇴직금 계산(평균임금·산정서), 공휴일·노동절 수당 계산(5인 이상/미만 × 월급·일용·시급) 등 한 곳에서.',
  alternates: { canonical: `${SITE_URL}/tools` },
  openGraph: {
    title: '노무 계산기 모음 | 일의 무늬',
    description: '퇴직금·공휴일 수당·통상임금 등 실무 계산기',
    url: `${SITE_URL}/tools`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
});

const ICONS: Record<ToolIcon, React.ComponentType<{ className?: string }>> = { calculator: Calculator, coins: Coins, 'file-check': FileCheck2 };

export default function ToolsIndexPage() {
  return (
    <div className="layout-list">
      <h1 className="t-h2 mb-2" style={{ color: 'var(--color-text-primary)' }}>
        계산·점검 도구
      </h1>
      <p className="mb-8 text-sm leading-relaxed" style={{ color: 'var(--grey-500)' }}>
        계산과 문구 점검을 돕는 참고 도구입니다. 입력 조건과 적용 근거를 확인하고, 결과는 개별 사정에 맞춰 검토하세요.
      </p>

      <div className="grid grid-cols-1 gap-4">
        {TOOLS.map((t) => {
          const Icon = ICONS[t.icon];
          const card = (
            <div
              key={t.href}
              className="group rounded-xl border border-[var(--color-border)] p-5 transition-all hover:border-[var(--color-brand-border)] hover:shadow-lg"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand-surface)] text-[var(--color-brand-ink)]">
                  <Icon className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <h2 className="t-h4" style={{ color: 'var(--color-text-primary)' }}>
                      {t.title}
                    </h2>
                    <span
                      // 노랑 램프는 라·다 동일하므로 그 위 잉크는 고정 #191f28이다(globals.css §3.4 주석).
                      // --color-text-primary / --grey-900은 다크에서 뒤집혀 노랑 위 흰 글씨가 된다.
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        t.badge === 'NEW'
                          ? 'bg-[var(--brand-300)] text-[#191f28]'
                          : 'bg-[var(--grey-200)] text-[var(--grey-700)]'
                      }`}
                    >
                      {t.badge}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                    {t.desc}
                  </p>
                  <div className="mt-3 text-sm font-semibold text-[var(--color-brand-ink)] group-hover:underline">
                    열기 →
                  </div>
                </div>
              </div>
            </div>
          );

          return t.external ? (
            <a key={t.href} href={t.href}>
              {card}
            </a>
          ) : (
            <Link key={t.href} href={t.href}>
              {card}
            </Link>
          );
        })}
      </div>

      {/* §3.2 규율 2 — 페이지 바탕 위 --text-xs는 --grey-700이다(secondary는 4.42:1로 미달) */}
      <p className="mt-8 text-xs" style={{ color: 'var(--grey-700)' }}>
        본 계산기들은 참고용입니다. 결과는 입력 조건에 따라 달라지니 근거 조문과 함께 확인하세요.
      </p>
    </div>
  );
}
