import type { Metadata } from 'next';
import Link from 'next/link';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import ToolShell from '@/components/tool/ToolShell';
import WageDelayInterestClient from './WageDelayInterestClient';

export const metadata: Metadata = publicMetadata({
  title: '임금 지연이자 계산기 | 연 20% 일할 계산 | 일의 무늬',
  description:
    '퇴직금·퇴직 때 정산하는 금품과 재직 중 정기지급일에 받지 못한 임금을 항목별로 넣으면 근로기준법 제37조의 연 20% 지연이자를 계산합니다. 퇴직 금품은 퇴직일 + 14일, 재직 중 임금은 정기지급일(2025년 10월 23일 시행) 다음 날부터, 적용 제외 기간은 뺍니다.',
  keywords: ['임금 지연이자 계산기', '지연이자', '연 20%', '퇴직금 지연이자', '근로기준법 제37조', '미지급 임금 지연이자', '재직 중 임금 지연이자'],
  alternates: { canonical: `${SITE_URL}/tools/wage-delay-interest` },
  openGraph: {
    title: '임금 지연이자 계산기 | 일의 무늬',
    description: '퇴직 금품은 퇴직일 + 14일, 재직 중 임금은 정기지급일 다음 날부터 연 20%. 항목별로 일할 계산.',
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
      basis={[
        '근로기준법 제37조 제1항(법률 제20520호, 2025. 10. 23. 시행) — 제1호 퇴직·사망 때 금품은 지급 사유가 생긴 날부터 14일이 되는 날, 제2호 재직 중 임금은 제43조 제2항의 정기지급일. 그다음 날부터 지급하는 날까지',
        '근로기준법 시행령 제17조 — 연 100분의 20(2005. 7. 1. 시행분부터 같은 이율)',
        '법률 제20520호 부칙 제2조 — 제2호는 2025. 10. 23. 이후 지연이자 지급사유가 생긴 경우부터',
        '근로기준법 제37조 제2항 — 제2호 지연이자가 생긴 뒤 퇴직해도 정기지급일 기준',
        '근로기준법 제37조 제3항·시행령 제18조 — 적용 제외 사유가 이어지는 기간은 적용하지 않음',
        '고용노동부 행정해석 근로기준과-3981(2005. 7. 28.) — 합의로 지급기일을 늦춰도 지연이자 의무는 남음',
        '광주지방법원 2010가합8213 판결 — 퇴직 후 14일째가 일요일이어도 그다음 날부터 연 20%',
        '일수 ÷ 365와 원 미만 버림 — 조문의 숫자가 아니라 판결의 계산 방식과 이 계산기의 끝수 처리',
      ]}
      basisNote={<>퇴직금 금액 자체는 <a href="/tools/severance.html" className="underline underline-offset-2">퇴직금 계산기</a>, 퇴직하면서 받을 금액 전체는 <Link href="/exit" className="underline underline-offset-2">퇴사 정리</Link>에서 봅니다.</>}
    >
      <WageDelayInterestClient />
    </ToolShell>
  );
}
