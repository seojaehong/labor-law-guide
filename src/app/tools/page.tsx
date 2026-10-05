import { publicMetadata } from '@/lib/public-metadata';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Calculator, Coins, FileCheck2 } from 'lucide-react';
import { SITE_URL } from '@/lib/constants';

export const metadata: Metadata = publicMetadata({
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
});

interface ToolItem {
  href: string;
  title: string;
  desc: string;
  badge: string;
  Icon: React.ComponentType<{ className?: string }>;
  external?: boolean; // 정적 HTML
}

const tools: ToolItem[] = [
  { href: '/tools/leave', title: '연차휴가 계산기', desc: '입사일 기준 발생일수를 계산하고 대장과 대조합니다. 엑셀·붙여넣기 입력과 결과 내려받기를 지원합니다.', badge: '브라우저 계산', Icon: Calculator },
  { href: '/tools/leave/advanced', title: '연차 사용촉진', desc: '1년 이상·미만 연차의 촉구·통보 기간을 구분해 확인합니다. 실제 기록과 날짜만 대조하며 적법성을 판정하지 않습니다.', badge: '일정 대조', Icon: FileCheck2 },
  { href: '/tools/leave/settlement', title: '퇴직 연차 정산', desc: '회계연도 실제 부여 누계와 입사일 기준 누계를 비교합니다. 발생일수·사용분·수당 지급분을 구분해 입력합니다.', badge: '참고 계산', Icon: Calculator },
  { href: '/tools/work-rules', title: '취업규칙 점검', desc: '취업규칙 텍스트를 입력해 법령 개정 관련 항목을 확인합니다. 법령 검수 전 참고 자료입니다.', badge: '참고 점검', Icon: FileCheck2 },
  {
    href: '/tools/contract-check',
    title: '근로계약서 자가진단',
    desc: '계약서 내용을 폼에 입력하면 필수 명시사항·최저임금·위약금 등 25개 항목을 즉시 점검. 위반·리스크별 수정 방향 제시. 입력한 내용은 저장되지 않습니다.',
    badge: '참고 도구',
    Icon: FileCheck2,
  },
  {
    href: '/tools/holiday-pay',
    title: '공휴일 수당 계산기',
    desc: '노동절(5/1)·관공서 공휴일 근무 시 추가 지급액 계산. 5인 이상/미만 × 월급·일용·시급 6분기. 시급 주휴포함 케이스 자동 분리.',
    badge: '참고 도구',
    Icon: Calculator,
  },
  {
    href: '/tools/severance.html',
    title: '퇴직금 계산기',
    desc: '평균임금·통상임금 자동 비교 + 윤년 고려 정밀 재직기간 + 퇴직소득세 산정. 산정서 PDF 출력 가능.',
    badge: '참고 계산',
    Icon: Coins,
    external: true,
  },
];

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
        {tools.map((t) => {
          const Icon = t.Icon;
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
        본 계산기들은 참고용입니다. 분쟁 발생 시 노무사 상담을 권장합니다.
      </p>
    </div>
  );
}
