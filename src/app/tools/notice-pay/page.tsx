import Link from 'next/link';
import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import ToolShell from '@/components/tool/ToolShell';
import NoticePayClient from './NoticePayClient';

export const metadata: Metadata = publicMetadata({
  title: '해고예고수당 계산기 | 30일분 통상임금 | 일의 무늬',
  description:
    '입사일·해고일·예고한 날과 임금을 넣으면 해고예고수당을 계산합니다. 1일 통상임금 = 시간급 × 1일 소정근로시간 × 30일, 계속 근로 3개월 미만은 제외(근로기준법 제26조).',
  keywords: ['해고예고수당 계산기', '해고예고수당', '30일 전 예고', '해고예고 3개월 미만', '통상임금 30일분'],
  alternates: { canonical: `${SITE_URL}/tools/notice-pay` },
  openGraph: {
    title: '해고예고수당 계산기 | 일의 무늬',
    description: '30일 전에 예고하지 않았으면 30일분 통상임금. 3개월 미만 근로는 제외.',
    url: `${SITE_URL}/tools/notice-pay`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
});

export default function NoticePayPage() {
  return (
    <ToolShell
      title="해고예고수당 계산기"
      lead="입사일과 해고일, 미리 알린 날과 임금을 넣으면 해고예고수당이 있는지와 금액을 보여줍니다."
      basis={[
        '근로기준법 제26조 본문 — 적어도 30일 전에 예고, 하지 않았으면 30일분 이상의 통상임금',
        '고용노동부 행정해석 근기1451-20718(1984. 10. 12.) — 예고 기간이 30일에 못 미치면 모자란 날만큼이 아니라 30일분 이상',
        '같은 조 단서 제1호 — 계속 근로한 기간이 3개월 미만이면 적용하지 않음',
        '근로기준법 시행령 제6조 제2항·제3항 — 통상임금 시간급 환산, 1일 통상임금 = 시간급 × 1일 소정근로시간',
      ]}
      basisNote={<>퇴직하면서 받을 금액 전체는 <Link href="/exit" className="underline underline-offset-2">퇴사 정리</Link>에서 봅니다.</>}
    >
      <NoticePayClient />
    </ToolShell>
  );
}
