import Link from 'next/link';
import type { Metadata } from 'next';
import { Calculator, Coins, FileCheck2 } from 'lucide-react';
import { SITE_URL } from '@/lib/constants';

export const metadata: Metadata = {
  title: '노무 계산기 모음 | 퇴직금·공휴일 수당 | 노란봉투법 가이드',
  description:
    '실무자가 자주 쓰는 노무 계산기. 퇴직금 계산(평균임금·산정서), 공휴일·노동절 수당 계산(5인 이상/미만 × 월급·일용·시급) 등 한 곳에서.',
  alternates: { canonical: `${SITE_URL}/tools` },
  openGraph: {
    title: '노무 계산기 모음 | 노란봉투법 가이드',
    description: '퇴직금·공휴일 수당·통상임금 등 실무 계산기',
    url: `${SITE_URL}/tools`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
};

interface ToolItem {
  href: string;
  title: string;
  desc: string;
  badge: string;
  Icon: React.ComponentType<{ className?: string }>;
  external?: boolean; // 정적 HTML
}

const tools: ToolItem[] = [
  {
    href: '/tools/contract-check',
    title: '근로계약서 자가진단',
    desc: '계약서 내용을 폼에 입력하면 필수 명시사항·최저임금·위약금 등 25개 항목을 즉시 점검. 위반·리스크별 수정 방향 제시. 입력한 내용은 저장되지 않습니다.',
    badge: 'NEW',
    Icon: FileCheck2,
  },
  {
    href: '/tools/holiday-pay',
    title: '공휴일 수당 계산기',
    desc: '노동절(5/1)·관공서 공휴일 근무 시 추가 지급액 계산. 5인 이상/미만 × 월급·일용·시급 6분기. 시급 주휴포함 케이스 자동 분리.',
    badge: 'NEW',
    Icon: Calculator,
  },
  {
    href: '/tools/severance.html',
    title: '퇴직금 계산기',
    desc: '평균임금·통상임금 자동 비교 + 윤년 고려 정밀 재직기간 + 퇴직소득세 산정. 산정서 PDF 출력 가능.',
    badge: '검증',
    Icon: Coins,
    external: true,
  },
];

export default function ToolsIndexPage() {
  return (
    <div className="mx-auto max-w-[820px] px-5 py-10">
      <h1 className="mb-2 font-bold" style={{ fontSize: 'var(--text-2xl)', color: 'var(--grey-900)' }}>
        노무 계산기
      </h1>
      <p className="mb-8 text-sm leading-relaxed" style={{ color: 'var(--grey-500)' }}>
        실무자가 자주 쓰는 계산기를 모았습니다. 산식은 근로기준법, 시행령, 행정해석을 반영해 검증되었습니다.
      </p>

      <div className="grid grid-cols-1 gap-4">
        {tools.map((t) => {
          const Icon = t.Icon;
          const card = (
            <div
              key={t.href}
              className="group rounded-xl border-2 border-[var(--color-border)] p-5 transition-all hover:border-[var(--color-brand-border)] hover:shadow-lg"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand-surface)] text-[var(--color-brand-ink)]">
                  <Icon className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
                      {t.title}
                    </h2>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        t.badge === 'NEW'
                          ? 'bg-[var(--brand-300)] text-slate-900'
                          : 'bg-slate-200 text-slate-700'
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

      {/* --color-text-tertiary(2.01:1)는 본문 텍스트 금지(§7.3) — secondary로 올린다 */}
      <p className="mt-8 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
        본 계산기들은 참고용입니다. 분쟁 발생 시 노무사 상담을 권장합니다.
      </p>
    </div>
  );
}
