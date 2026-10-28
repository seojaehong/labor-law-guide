import Link from 'next/link';
import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import ToolShell from '@/components/tool/ToolShell';
import WeeklyHolidayClient from './WeeklyHolidayClient';

export const metadata: Metadata = publicMetadata({
  title: '주휴수당 계산기 | 아르바이트·단시간 | 일의 무늬',
  description:
    '시급과 1주 근무시간을 넣으면 주휴수당을 계산합니다. 주 15시간 미만·결근한 주는 생기지 않고, 단시간 근로자는 근로기준법 시행령 별표2 방식(4주 소정근로시간 ÷ 통상근로자 근무일 수)으로 하루 시간을 셉니다.',
  keywords: ['주휴수당 계산기', '주휴수당 계산', '알바 주휴수당', '주 15시간', '단시간근로자 주휴'],
  alternates: { canonical: `${SITE_URL}/tools/weekly-holiday-pay` },
  openGraph: {
    title: '주휴수당 계산기 | 일의 무늬',
    description: '시급 × 1일 소정근로시간. 주 15시간 미만·결근한 주 구분까지.',
    url: `${SITE_URL}/tools/weekly-holiday-pay`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
});

export default function WeeklyHolidayPayPage() {
  return (
    <ToolShell
      title="주휴수당 계산기"
      lead="시급과 1주 근무시간을 넣으면 1주와 한 달 평균 주휴수당을 보여줍니다. 아르바이트처럼 주 40시간보다 적게 일하면 근무시간에 비례해 줄어듭니다."
      basis={[
        '근로기준법 제55조 제1항 — 1주에 평균 1회 이상 유급휴일',
        '근로기준법 시행령 제30조 제1항 — 1주 소정근로일을 개근한 사람에게',
        '근로기준법 제18조 제3항 — 4주 평균 1주 소정근로시간 15시간 미만이면 적용하지 않음',
        '근로기준법 시행령 별표2 제2호 — 1일 소정근로시간 = 4주 소정근로시간 ÷ 통상근로자 총 소정근로일 수',
      ]}
      basisNote={<>공휴일에 일했을 때 더 받는 금액은 <Link href="/tools/holiday-pay" className="underline underline-offset-2">공휴일 수당 계산기</Link>에서 봅니다.</>}
    >
      <WeeklyHolidayClient />
    </ToolShell>
  );
}
