import Link from 'next/link';
import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import HeadcountClient from './HeadcountClient';

export const metadata: Metadata = publicMetadata({
  title: '상시 근로자 수 계산기 | 5인 이상 여부 | 일의 무늬',
  description:
    '근로기준법 시행령 제7조의2 방식으로 상시 근로자 수를 셉니다. 기준일 전 1개월 연인원 ÷ 가동 일수, 5명 미만인 날 절반 규칙, 연차 1년 요건까지. 한 달 계약직을 쓰면 언제부터 언제까지 5인 이상인지 보여줍니다.',
  keywords: ['상시근로자수 계산', '5인 이상 사업장', '5인 미만', '연인원 가동일수', '근로기준법 시행령 제7조의2'],
  alternates: { canonical: `${SITE_URL}/tools/headcount` },
  openGraph: {
    title: '상시 근로자 수 계산기 | 일의 무늬',
    description: '기준일 전 1개월 연인원 ÷ 가동 일수와 미달일 절반 규칙으로 5인 이상 여부와 해당 기간을 셉니다.',
    url: `${SITE_URL}/tools/headcount`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
});

export default function HeadcountPage() {
  return (
    <div className="layout-tool">
      <div className="mb-6">
        <Link href="/tools" className="text-sm text-[var(--grey-700)] hover:text-[var(--color-text-primary)]">
          ← 계산·점검 도구
        </Link>
      </div>
      <h1 className="t-h2 mb-2" style={{ color: 'var(--color-text-primary)' }}>
        상시 근로자 수 계산기
      </h1>
      <p className="mb-6 text-sm leading-relaxed" style={{ color: 'var(--grey-700)' }}>
        5인 이상인지는 지금 고용한 인원으로 정하지 않습니다. 법을 적용할 일이 생긴 날 전 1개월 동안 쓴 근로자
        연인원을 가동 일수로 나누고, 5명 미만인 날이 절반 이상이면 결론이 바뀝니다. 근로자와 근무 요일을 넣으면
        기준일 산정과 함께 5인 이상으로 보는 기간을 보여줍니다.
      </p>

      <HeadcountClient />

      <div className="mt-10 rounded-xl bg-[var(--grey-100)] p-5 text-sm leading-relaxed" style={{ color: 'var(--grey-700)' }}>
        <div className="mb-2 font-semibold text-[var(--color-text-primary)]">계산 기준</div>
        <ul className="list-disc space-y-1 pl-5">
          <li>근로기준법 시행령 제7조의2 제1항·제2항 — 기준일 전 1개월 연인원 ÷ 가동 일수, 미달일 절반 규칙</li>
          <li>같은 조 제3항 — 연차휴가는 월 단위로 센 인원이 1년 동안 계속 5명 이상일 때</li>
          <li>같은 조 제4항 — 기간제·단시간 포함, 파견 제외, 동거친족은 다른 근로자가 있을 때만</li>
          <li>대법원 2023. 6. 15. 선고 2020도16228 판결 — 주휴일에 실제 근무하지 않은 근로자는 세지 않음</li>
        </ul>
        <p className="mt-3">
          규모별로 달라지는 의무는 <Link href="/duties" className="underline underline-offset-2">사업장 규모별 사업주 의무</Link>에서 봅니다.
          입력값으로 계산한 참고 결과이며 입력한 내용은 저장되지 않습니다.
        </p>
      </div>
    </div>
  );
}
