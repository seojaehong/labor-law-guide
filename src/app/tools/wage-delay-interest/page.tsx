import type { Metadata } from 'next';
import Link from 'next/link';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import ToolShell from '@/components/tool/ToolShell';
import WageDelayInterestClient from './WageDelayInterestClient';
import { BASIS } from './copy';

export const metadata: Metadata = publicMetadata({
  title: '임금 지연이자 계산기 | 연 20% 일할 계산 | 일의 무늬',
  description:
    '퇴직금·퇴직 때 정산하는 임금과 재직 중 정기지급일에 받지 못한 임금을 항목별로 넣으면 근로기준법 제37조의 연 20% 지연이자를 계산합니다. 퇴직 때 임금·퇴직금은 마지막 근무일 + 14일, 재직 중 임금은 정기지급일(2025년 10월 23일 시행) 다음 날부터, 적용 제외 기간은 뺍니다.',
  keywords: ['임금 지연이자 계산기', '지연이자', '연 20%', '퇴직금 지연이자', '근로기준법 제37조', '미지급 임금 지연이자', '재직 중 임금 지연이자'],
  alternates: { canonical: `${SITE_URL}/tools/wage-delay-interest` },
  openGraph: {
    title: '임금 지연이자 계산기 | 일의 무늬',
    description: '퇴직 때 임금·퇴직금은 마지막 근무일 + 14일, 재직 중 임금은 정기지급일 다음 날부터 연 20%. 항목별로 일할 계산.',
    url: `${SITE_URL}/tools/wage-delay-interest`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
});

export default function WageDelayInterestPage() {
  return (
    <ToolShell
      title="임금 지연이자 계산기"
      lead="늦게 지급했거나 아직 지급하지 않은 임금·퇴직금을 항목별로 넣으면, 항목마다 언제부터 지연이자가 붙는지와 연 20%로 일할 계산한 금액을 보여줍니다."
      basis={[...BASIS]}
      basisNote={<>퇴직금 금액 자체는 <a href="/tools/severance.html" className="underline underline-offset-2">퇴직금 계산기</a>, 퇴직하면서 받을 금액 전체와 금품 청산 기한은 <Link href="/exit" className="underline underline-offset-2">퇴사 정리</Link>에서 봅니다. 14일 기한은 두 화면이 같은 날로 셉니다.</>}
    >
      <WageDelayInterestClient />
    </ToolShell>
  );
}
