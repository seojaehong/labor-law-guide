import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import ToolShell from '@/components/tool/ToolShell';
import RetirementTaxClient from './RetirementTaxClient';

export const metadata: Metadata = publicMetadata({
  title: '퇴직소득세 계산기 | 근속연수공제·환산급여 | 일의 무늬',
  description:
    '퇴직급여와 입사일·퇴사일(마지막 근무일)을 넣으면 예상 퇴직소득세와 지방소득세를 계산합니다. 근속연수공제 → 환산급여 → 환산급여공제 → 기본세율 순서(소득세법 제48조·제55조), 2023년 1월 1일 이후 퇴사 기준.',
  keywords: ['퇴직소득세 계산기', '퇴직소득세', '근속연수공제', '환산급여', '환산급여공제', '퇴직금 세금', '지방소득세'],
  alternates: { canonical: `${SITE_URL}/tools/retirement-tax` },
  openGraph: {
    title: '퇴직소득세 계산기 | 일의 무늬',
    description: '퇴직급여·입사일·퇴사일로 예상 퇴직소득세와 지방소득세. 근속연수공제·환산급여공제·기본세율 순서.',
    url: `${SITE_URL}/tools/retirement-tax`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
});

export default function RetirementTaxPage() {
  return (
    <ToolShell
      title="퇴직소득세 계산기"
      lead="퇴직급여와 입사일·퇴사일을 넣으면 국세청 퇴직소득 세액계산 프로그램과 같은 순서로 예상 퇴직소득세와 지방소득세를 보여줍니다."
      basis={[
        '소득세법 제48조 제1항 제1호·제2항 — 근속연수공제. 퇴직급여보다 크면 퇴직급여만큼만 뺀다',
        '소득세법 제48조 제1항 본문·제2호 — 환산급여 = (퇴직급여 − 근속연수공제) × 12 ÷ 근속연수, 환산급여공제',
        '소득세법 제55조 제1항·제2항 — 기본세율, 산출세액 = 환산산출세액 ÷ 12 × 근속연수',
        '소득세법 시행령 제105조 제1항 — 근속연수는 근로를 제공하기 시작한 날 또는 퇴직소득중간지급일(중간정산을 받은 날)의 다음 날부터 퇴직한 날까지. 1년 미만은 1년(법 제48조 제1항)',
        '근속월수 = 입사일에서 퇴사일까지 지난 개월 수(1개월 미만 버림) + 1 — 법령 문구가 아니라 국세청 퇴직소득 세액계산 프로그램(2022~2026년 판)의 계산 방식',
        '국고금관리법 제47조 — 세액 10원 미만 버림. 환산급여·환산급여공제·산출세액의 원 미만 버림(그 차인 과세표준 포함)은 국세청 퇴직소득 세액계산 프로그램의 계산 방식. 지방세법 제103조의13 제1항 — 지방소득세는 소득세의 10%',
        '법률 제19196호(2022. 12. 31.) 부칙 제13조·제14조 — 2022년 12월 31일 이전 퇴사는 종전 공제표·세율',
      ]}
      basisNote={<>퇴직금 금액 자체는 <a href="/tools/severance.html" className="underline underline-offset-2">퇴직금 계산기</a>에서 계산합니다. 그 화면의 「산정사유발생일」에는 마지막 근무일의 다음 날을 넣습니다.</>}
    >
      <RetirementTaxClient />
    </ToolShell>
  );
}
