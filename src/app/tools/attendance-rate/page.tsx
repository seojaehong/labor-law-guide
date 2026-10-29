import Link from 'next/link';
import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import ToolShell from '@/components/tool/ToolShell';
import AttendanceRateClient from './AttendanceRateClient';

export const metadata: Metadata = publicMetadata({
  title: '출근율 계산기 | 연차 80% 출근율 | 일의 무늬',
  description:
    '1년 소정근로일수와 출근으로 보는 날·소정근로일수에서 빼는 날·결근을 넣으면 연차휴가 발생 출근율(80%)을 계산합니다. 80% 미만이면 비례 일수 또는 1개월 개근 시 1일(근로기준법 제60조, 대법원 2015다66052).',
  keywords: ['출근율 계산기', '연차 출근율', '출근율 80%', '연차 80% 미만', '소정근로일수 출근율', '육아휴직 출근율', '쟁의행위 연차 비례'],
  alternates: { canonical: `${SITE_URL}/tools/attendance-rate` },
  openGraph: {
    title: '출근율 계산기 | 일의 무늬',
    description: '연차가 생기는 출근율 80%. 출근으로 보는 날, 소정근로일수에서 빼는 날, 결근을 나눠 셉니다.',
    url: `${SITE_URL}/tools/attendance-rate`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
});

export default function AttendanceRatePage() {
  return (
    <ToolShell
      title="출근율 계산기"
      lead="1년 소정근로일수와 그중 출근으로 보는 날·빼는 날·결근한 날을 넣으면 연차휴가가 생기는 출근율 80%를 채웠는지와 생기는 일수를 보여줍니다."
      basis={[
        '근로기준법 제60조제1항 — 1년간 80퍼센트 이상 출근하면 15일. 제4항 — 3년 이상 근속하면 가산, 25일 한도',
        '근로기준법 제60조제2항 — 계속 근로 1년 미만이거나 1년간 80퍼센트 미만 출근하면 1개월 개근 시 1일(80% 미만 부분은 법률 제11270호, 2012. 8. 2. 시행 — 부칙 제4조에 따라 시행 뒤의 근로기간이 처음 1년이 되는 근로자부터)',
        '근로기준법 제60조제6항(2027. 6. 10.부터 제7항) — 업무상 부상·질병으로 휴업한 기간, 출산전후휴가·유산사산휴가 기간, 육아휴직 기간(2018. 5. 29. 이후 신청), 육아기·임신기 근로시간 단축을 사용하여 단축된 근로시간(2024. 10. 22. 이후 시작한 단축)은 출근한 것으로 봄',
        '대법원 2013. 12. 26. 선고 2011다4629 판결 — 출근율은 연간 소정근로일수 중 출근일수의 비율. 정당한 쟁의행위 기간은 소정근로일수에서 뺌',
        '대법원 2019. 2. 14. 선고 2015다66052 판결 — 출근일수가 8할을 밑도는 경우에 한해 연차 일수 × 실질 소정근로일수 ÷ 연간 소정근로일수. 노동조합 전임·정당한 직장폐쇄 기간은 빼고, 정당성이 없는 직장폐쇄 기간은 출근으로 봄',
        '대법원 2014. 3. 13. 선고 2011다95519 판결 — 부당해고 기간은 소정근로일수와 출근일수에 모두 넣음',
        '대법원 2017. 5. 17. 선고 2014다232296, 232302 판결 — 업무상 재해로 휴업한 기간은 길이와 관계없이 출근으로 봄',
        '고용노동부 「연차유급휴가 등의 부여 시 소정근로일수 및 출근여부 판단기준」(임금근로시간정책팀-3228, 2007. 10. 25.)',
        '임금근로시간과-906(2021. 4. 15.)·-636(2021. 3. 19.) — 빼는 날이 있어도 80% 이상이면 일수를 줄이지 않음. 근로개선정책과-3370(2014. 6. 13.) — 비례할 때 근속 가산 포함',
        '근로기준과-3296(2009. 9. 1.) — 정당한 징계의 정직 기간은 결근(종전 해석을 바꿈). 대법원 2008. 10. 9. 선고 2008다41666 판결 — 취업규칙으로 정직 기간을 소정근로일수에 넣고 출근일수에서 빼도록 정할 수 있음',
        '임금근로시간과-1818(2021. 8. 12.) — 회사가 승인한 휴직은 소정근로일수에서 뺌',
      ]}
      basisNote={
        <>
          연차 일수는 <Link href="/tools/leave" className="underline underline-offset-2">연차휴가 계산기</Link>, 남은 연차의 수당은{' '}
          <Link href="/tools/leave-pay" className="underline underline-offset-2">연차수당 계산기</Link>에서 봅니다.
        </>
      }
    >
      <AttendanceRateClient />
    </ToolShell>
  );
}
