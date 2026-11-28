import Link from 'next/link';
import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import ToolShell from '@/components/tool/ToolShell';
import ChildcareReductionClient from './ChildcareReductionClient';

export const metadata: Metadata = publicMetadata({
  title: '육아기 근로시간 단축 급여·장려금 계산기 | 일의 무늬',
  description:
    '월 통상임금과 단축 전·후 1주 소정근로시간, 단축 기간을 넣으면 육아기 근로시간 단축 급여 월액과 기간 합계를 계산합니다. 앞 10시간분과 나머지 시간분의 상한·하한, 회사 지급액에 따른 감액, 사업주 출산육아기 고용안정장려금과 업무분담 지원금도 함께 봅니다(고용보험법 제73조의2, 시행령 제104조의2).',
  keywords: ['육아기 근로시간 단축 급여', '육아기 근로시간 단축 급여 계산기', '근로시간 단축 급여 상한', '출산육아기 고용안정장려금', '업무분담 지원금'],
  alternates: { canonical: `${SITE_URL}/tools/childcare-reduction` },
  openGraph: {
    title: '육아기 근로시간 단축 급여·장려금 계산기 | 일의 무늬',
    description: '단축 근무 중 고용보험에서 받는 급여와 사업주 장려금을 한 번에.',
    url: `${SITE_URL}/tools/childcare-reduction`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
});

export default function ChildcareReductionPage() {
  return (
    <ToolShell
      title="육아기 근로시간 단축 급여·장려금 계산기"
      lead="육아기 근로시간 단축 중 고용보험에서 나오는 단축급여 월액과 기간 합계, 사업주 장려금을 계산합니다. 모르는 요건은 「모름」으로 두면 확인 필요로 표시합니다."
      basis={[
        '고용보험법 제73조의2 — 육아기 근로시간 단축 급여. 단축 개시일 전 피보험 단위기간 합산 180일 이상, 30일 이상 단축. 단축을 시작한 날 이후 1개월부터 끝난 날 이후 12개월 이내에 근로자가 신청',
        '고용보험법 시행령 제104조의2제2항 — [월 통상임금(상한·하한) × 줄어든 시간 중 10시간까지 ÷ 단축 전 소정근로시간] + [월 통상임금 80%(상한·하한) × 나머지 줄어든 시간 ÷ 단축 전 소정근로시간]. 상한은 지급대상 기간이 속한 날의 판(2026. 1. 1. 시행 250만원·160만원, 하한 50만원). 1개월을 채우지 못한 기간은 그 달 일수로 나눠 일할',
        '고용보험법 시행령 제104조의4 — 단축 중 회사가 주는 임금·금품과 급여의 합이 단축 시작일 직전 월 기준 월 통상임금을 넘으면 넘는 만큼 급여에서 뺌',
        '남녀고용평등법 제19조의2 — 만 12세 이하 또는 초등학교 6학년 이하 자녀, 단축 후 주 15시간 이상 35시간 이하, 기간 1년 이내(쓰지 않은 육아휴직 기간의 두 배 가산). 제19조의4제2항 — 나눠 쓰면 1회 1개월 이상',
        '고용보험법 시행령 제29조, 고용창출장려금·고용안정장려금의 신청 및 지급에 관한 규정(고용노동부 고시, 2026. 7. 1. 시행) 별표 5 — 우선지원대상기업 사업주에게 단축 지원금 월 30만원(단축을 처음 허용한 사업장의 첫~세 번째 사례는 월 10만원 추가), 업무분담 지원금 월 최대 20만원',
        '고용보험법 시행규칙 제51조 — 장려금 신청 시기(절반은 기간 중 3개월마다, 나머지는 단축이 끝난 뒤 6개월 계속 고용 후)',
      ]}
      basisNote={
        <>
          단축 신청서와 근로조건 서면은 <Link href="/tools/hr-forms" className="underline underline-offset-2">모성보호 서식 작성</Link>, 수당이 통상임금에 들어가는지는{' '}
          <Link href="/tools/ordinary-wage-check" className="underline underline-offset-2">통상임금 점검</Link>에서 봅니다.
        </>
      }
    >
      <ChildcareReductionClient />
    </ToolShell>
  );
}
