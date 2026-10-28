import Link from 'next/link';
import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import ToolShell from '@/components/tool/ToolShell';
import LeavePayClient from './LeavePayClient';

export const metadata: Metadata = publicMetadata({
  title: '연차수당 계산기 | 미사용 연차 × 1일 통상임금 | 일의 무늬',
  description:
    '남은 연차 일수와 임금을 넣으면 미사용 연차수당을 계산합니다. 1일 통상임금 = 시간급 × 1일 소정근로시간, 퇴직 시 입사일 기준 발생 누계, 단시간 근로자는 남은 시간 × 시간급(근로기준법 제60조, 시행령 제6조).',
  keywords: ['연차수당 계산기', '미사용 연차수당', '퇴직 연차수당', '연차수당 통상임금', '단시간 근로자 연차수당'],
  alternates: { canonical: `${SITE_URL}/tools/leave-pay` },
  openGraph: {
    title: '연차수당 계산기 | 일의 무늬',
    description: '남은 연차 × 1일 통상임금. 재직 중과 퇴직 시, 단시간 근로자, 회사 지급액 대조까지.',
    url: `${SITE_URL}/tools/leave-pay`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
});

export default function LeavePayPage() {
  return (
    <ToolShell
      title="연차수당 계산기"
      lead="남은 연차와 임금을 넣으면 미사용 연차수당을 계산하고, 회사가 지급한 금액이 있으면 차이를 보여줍니다."
      basis={[
        '근로기준법 제60조 — 연차유급휴가. 제5항(2027. 6. 10.부터 제6항): 휴가 기간에는 취업규칙 등에서 정하는 통상임금 또는 평균임금을 지급',
        '대법원 2005. 5. 27. 선고 2003다48549, 48556 판결 — 휴가를 쓰기 전에 근로관계가 끝나도 남은 연차 전부에 대한 수당 청구권은 남음',
        '대법원 2019. 10. 18. 선고 2018다239110 판결 — 취업규칙 등에 정함이 없으면 연차휴가수당은 통상임금으로 산정',
        '근로기준법 시행령 제6조 제2항·제3항 — 통상임금 시간급 환산, 1일 통상임금 = 시간급 × 1일 소정근로시간',
        '근로기준법 시행령 별표2 제2호나목·제4호나목·마목 — 단시간 근로자의 연차는 시간 단위(1시간 미만은 1시간), 수당은 시간급 기준',
        '근로기준법 제18조 제3항, 시행령 제7조 별표1 — 4주 평균 주 15시간 미만, 상시 4명 이하 사업장은 연차휴가 규정 적용 제외',
        '근로기준법 제61조 — 사용 촉진. 이 도구는 촉진 여부로 금액을 빼지 않습니다',
        '근로기준법 제36조 — 퇴직하면 14일 이내 지급, 제43조 제2항 — 매월 1회 이상 일정한 날짜에 지급',
      ]}
      basisNote={
        <>
          연차 일수는 <Link href="/tools/leave" className="underline underline-offset-2">연차휴가 계산기</Link>, 회계연도 운영 퇴직 정산은{' '}
          <Link href="/tools/leave/settlement" className="underline underline-offset-2">퇴직 연차 정산</Link>, 수당 항목은{' '}
          <Link href="/tools/ordinary-wage-check" className="underline underline-offset-2">통상임금 점검</Link>, 퇴직금은{' '}
          <a href="/tools/severance.html" className="underline underline-offset-2">퇴직금 계산기</a>에서 봅니다.
        </>
      }
    >
      <LeavePayClient />
    </ToolShell>
  );
}
