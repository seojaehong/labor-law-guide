import Link from 'next/link';
import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import ToolShell from '@/components/tool/ToolShell';
import ShutdownAllowanceClient from './ShutdownAllowanceClient';

export const metadata: Metadata = publicMetadata({
  title: '휴업수당 계산기 | 평균임금 70% · 통상임금 | 일의 무늬',
  description:
    '휴업 시작일과 임금, 휴업일수를 넣으면 휴업수당(평균임금의 70% 이상)을 계산합니다. 평균임금 70%가 통상임금보다 많으면 통상임금 기준 금액도 나란히 보여주고, 일부 시간만 쉰 날은 시행령 제26조 식으로 셉니다(근로기준법 제46조).',
  keywords: ['휴업수당 계산기', '휴업수당', '평균임금 70%', '휴업수당 통상임금', '부분 휴업 휴업수당'],
  alternates: { canonical: `${SITE_URL}/tools/shutdown-allowance` },
  openGraph: {
    title: '휴업수당 계산기 | 일의 무늬',
    description: '회사 사정으로 쉰 기간의 휴업수당 — 평균임금의 70% 이상, 통상임금 기준과 나란히.',
    url: `${SITE_URL}/tools/shutdown-allowance`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
});

export default function ShutdownAllowancePage() {
  return (
    <ToolShell
      title="휴업수당 계산기"
      lead="회사 사정으로 쉰 기간의 휴업수당을 계산합니다. 평균임금의 70%가 통상임금보다 많으면 통상임금 기준 금액도 나란히 보여줍니다."
      basis={[
        '근로기준법 제46조제1항 — 사용자의 귀책사유로 휴업하면 휴업기간 동안 평균임금의 100분의 70 이상. 단서: 그 금액이 통상임금을 초과하면 통상임금을 휴업수당으로 지급할 수 있음',
        '서울고등법원 2016. 7. 22. 선고 2015나26148, 2015나26155(병합) 판결 — 단서는 사용자에게 선택권을 준 것. 대법원 2019. 4. 23. 선고 2016다37167, 37174 판결 — 평균임금이 통상임금보다 적으면 통상임금액을 평균임금으로 해 휴업수당을 산정한 원심을 정당하다고 봄(휴업수당 부분은 상고 기각, 미지급 법정수당·퇴직금 부분은 파기환송)',
        '임금68207-513, 근기01254-15508 — 상여금은 사유 발생일 전 12개월 동안 받은 합계의 3/12을 평균임금에 넣음. 근로기준법 시행령 제2조제2항 — 임시로 지급된 임금·수당은 넣지 않음',
        '근로기준법 제2조제1항제8호, 근기68207-865 — 통상임금을 셀 1일 소정근로시간은 1일 8시간 범위. 제55조제1항 — 주휴는 1일 소정근로시간분',
        '근로기준법 제46조제2항 — 부득이한 사유로 노동위원회 승인을 받으면 제1항 기준에 못 미치는 휴업수당. 시행규칙 제8조(별지 제4호서식), 노동위원회규칙 제85조',
        '근로기준법 시행령 제26조 — 휴업기간 중 임금 일부를 받았으면 (평균임금 − 받은 임금) × 70% 이상, 단서면 통상임금 − 받은 임금',
        '근로기준법 제2조제1항제6호·제2항, 시행령 제2조제1항 — 평균임금 산정기간(사유 발생일 전 3개월)과 빼는 기간, 통상임금보다 적으면 통상임금',
        '근로기준법 시행령 제6조제2항·제3항 — 통상임금 시간급 환산, 1일 통상임금 = 시간급 × 1일 소정근로시간',
        '근로개선정책과-3190 — 평균임금 산정 시점은 근로자마다 휴업이 실제로 시작된 날. 근로조건지도과-1418·근로기준정책과-1448·근로개선정책과-5243 — 휴업일수에 유급휴일은 넣고 무급 휴무일은 넣지 않음',
        '근로기준법 제11조, 시행령 제7조 [별표1] — 상시 4명 이하 사업장에는 제46조 적용 제외',
        '대법원 2013. 10. 11. 선고 2012다12870 판결 — 근로자의 의사에 반해 취업이 거부되거나 불가능하게 된 경우도 휴업, 경영상 필요로 한 대기발령 포함',
      ]}
      basisNote={
        <>
          상시 근로자 수는 <Link href="/tools/headcount" className="underline underline-offset-2">상시 근로자 수 계산기</Link>, 수당 항목이 통상임금에 들어가는지는{' '}
          <Link href="/tools/ordinary-wage-check" className="underline underline-offset-2">통상임금 점검</Link>, 퇴직금은{' '}
          <a href="/tools/severance.html" className="underline underline-offset-2">퇴직금 계산기</a>에서 봅니다.
        </>
      }
    >
      <ShutdownAllowanceClient />
    </ToolShell>
  );
}
