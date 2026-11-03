import { publicMetadata } from '@/lib/public-metadata';
import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/constants';
import { TOOLS } from '@/content/tools-registry';
import ToolsDirectory from './ToolsDirectory';

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

export default function ToolsIndexPage() {
  return (
    <div className="layout-list">
      <h1 className="t-h2 mb-2" style={{ color: 'var(--color-text-primary)' }}>
        계산·점검 도구
      </h1>
      <p className="mb-6 text-sm leading-relaxed" style={{ color: 'var(--grey-700)' }}>
        도구 {TOOLS.length}개를 상황별로 묶었습니다. 결과에는 계산 근거가 된 조문을 함께 적습니다.
      </p>

      <ToolsDirectory />

      {/* §3.2 규율 2 — 페이지 바탕 위 --text-xs는 --grey-700이다(secondary는 4.42:1로 미달) */}
      <p className="mt-8 text-xs" style={{ color: 'var(--grey-700)' }}>
        본 계산기들은 참고용입니다. 결과는 입력 조건에 따라 달라지니 근거 조문과 함께 확인하세요.
      </p>
    </div>
  );
}
