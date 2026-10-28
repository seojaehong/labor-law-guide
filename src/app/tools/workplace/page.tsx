import Link from 'next/link';
import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import WorkplaceClient from './WorkplaceClient';

export const metadata: Metadata = publicMetadata({
  title: '사업자등록번호로 보는 사업장 규모 | 5인·10인·30인·50인 의무 | 일의 무늬',
  description:
    '사업자등록번호를 넣으면 근로복지공단에 신고된 상시인원과 업종, 보험 성립일을 불러와 5인·10인·30인·50인 구간과 그 규모에서 지켜야 할 의무를 보여줍니다.',
  keywords: ['사업자등록번호 상시근로자수', '사업장 규모 조회', '5인 이상 사업장 의무', '10인 이상 취업규칙', '50인 장애인 의무고용'],
  alternates: { canonical: `${SITE_URL}/tools/workplace` },
  openGraph: {
    title: '사업자등록번호로 보는 사업장 규모 | 일의 무늬',
    description: '공단 신고 상시인원으로 규모 구간과 지켜야 할 의무를 한 장으로 봅니다.',
    url: `${SITE_URL}/tools/workplace`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
});

export default function WorkplacePage() {
  return (
    <div className="layout-tool">
      <div className="mb-6">
        <Link href="/tools" className="text-sm text-[var(--grey-700)] hover:text-[var(--color-text-primary)]">
          ← 계산·점검 도구
        </Link>
      </div>
      <h1 className="t-h2 mb-2" style={{ color: 'var(--color-text-primary)' }}>
        사업장 규모 카드
      </h1>
      <p className="mb-6 text-sm leading-relaxed" style={{ color: 'var(--grey-700)' }}>
        사업자등록번호를 넣으면 근로복지공단에 신고된 상시인원·업종·보험 성립일을 불러와
        우리 사업장이 몇 인 구간인지, 그 규모에서 지켜야 할 것이 무엇인지 한 장으로 보여줍니다.
      </p>

      <WorkplaceClient />

      <div className="mt-10 rounded-xl bg-[var(--grey-100)] p-5 text-sm leading-relaxed" style={{ color: 'var(--grey-700)' }}>
        <div className="mb-2 font-semibold text-[var(--color-text-primary)]">자료와 기준</div>
        <ul className="list-disc space-y-1 pl-5">
          <li>사업장 정보 — 공공데이터포털 「근로복지공단 고용·산재보험 현황정보」(공단이 공개하는 사업장 단위 정보)</li>
          <li>규모별 의무 — <Link href="/duties" className="underline underline-offset-2">사업장 규모별 사업주 의무</Link>와 같은 자료(법제처 현행 법령 원문)</li>
          <li>근로기준법의 상시 근로자 수는 시행령 제7조의2 방식으로 셉니다 — <Link href="/tools/headcount" className="underline underline-offset-2">상시 근로자 수 계산기</Link></li>
        </ul>
      </div>
    </div>
  );
}
