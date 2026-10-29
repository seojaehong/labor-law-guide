import Link from 'next/link';
import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import ToolShell from '@/components/tool/ToolShell';
import PayProrationClient from './PayProrationClient';
import { BASIS } from './copy';

export const metadata: Metadata = publicMetadata({
  title: '급여 일할계산기 | 중도입사·퇴사·결근 공제 | 일의 무늬',
  description:
    '월급제 근로자가 그달 중간에 입사·퇴사하거나 결근·지각한 달의 급여를 30일 기준·그달 날수·소정근로일·시간 기준으로 나란히 계산합니다. 법은 일할 방식을 정하지 않아 회사 기준(취업규칙·근로계약서·임금명세서)을 고르면 그 값을 보여줍니다.',
  keywords: ['급여 일할계산', '월급 일할계산', '중도입사 급여', '중도퇴사 급여', '결근 공제', '주휴 공제', '30일 기준 일할'],
  alternates: { canonical: `${SITE_URL}/tools/pay-proration` },
  openGraph: {
    title: '급여 일할계산기 | 일의 무늬',
    description: '입사·퇴사한 달 급여를 일할 방식마다 나란히. 결근 공제는 결근일분과 그 주 주휴분을 나눠서.',
    url: `${SITE_URL}/tools/pay-proration`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
});

export default function PayProrationPage() {
  return (
    <ToolShell
      title="급여 일할계산기"
      lead="월급제 근로자가 그달 중간에 입사·퇴사하거나 결근·지각한 달의 급여를 일할 방식마다 나란히 계산합니다. 회사 기준을 고르면 그 값을, 모르면 방식별 값과 회사에 물어볼 문장을 보여줍니다."
      basis={[...BASIS]}
      basisNote={
        <>
          명세서 금액을 항목 하나씩 대조하려면 <Link href="/tools/pay-check" className="underline underline-offset-2">월급 대조</Link>, 매달 주는 상여금까지 넣은 최저임금은{' '}
          <Link href="/tools/min-wage" className="underline underline-offset-2">최저임금 확인 계산기</Link>, 주휴수당은{' '}
          <Link href="/tools/weekly-holiday-pay" className="underline underline-offset-2">주휴수당 계산기</Link>에서 봅니다.
        </>
      }
    >
      <PayProrationClient />
    </ToolShell>
  );
}
