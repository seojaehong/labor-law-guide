import Link from 'next/link';
import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import ToolShell from '@/components/tool/ToolShell';
import OrdinaryWageClient from './OrdinaryWageClient';

export const metadata: Metadata = publicMetadata({
  title: '통상임금 점검 | 2024. 12. 19. 전원합의체 기준 | 일의 무늬',
  description:
    '기본급·수당·상여금 항목마다 정기성·일률성·소정근로 대가성을 물어 새 통상임금 기준(대법원 2024. 12. 19. 전원합의체)으로 들어가는 쪽인지 빠지는 쪽인지 근거와 함께 보여줍니다. 재직조건·근무일수 조건, 2024. 12. 18.까지 제공분의 종전 기준도 함께 봅니다.',
  keywords: ['통상임금 점검', '통상임금 범위', '재직조건부 상여금 통상임금', '고정성 폐기', '2020다247190', '통상임금 시간급'],
  alternates: { canonical: `${SITE_URL}/tools/ordinary-wage-check` },
  openGraph: {
    title: '통상임금 점검 | 일의 무늬',
    description: '임금 항목마다 새 통상임금 기준의 세 요소를 묻고 근거 판결 원문을 함께 보여줍니다.',
    url: `${SITE_URL}/tools/ordinary-wage-check`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
});

export default function OrdinaryWageCheckPage() {
  return (
    <ToolShell
      title="통상임금 점검"
      lead="임금 항목마다 세 가지(정해진 주기로 주는지, 모두에게 주는지, 정해진 근무시간의 대가인지)를 답하면 새 기준으로 통상임금에 들어가는 쪽인지 빠지는 쪽인지 근거 판결과 함께 보여줍니다. 들어가는 쪽 항목만 더한 시간급도 참고로 냅니다."
      basis={[
        '근로기준법 시행령 제6조 제1항 — 통상임금은 정기적이고 일률적으로 소정근로 또는 총 근로에 대하여 지급하기로 정한 금액',
        '대법원 2024. 12. 19. 선고 2020다247190·2023다302838 전원합의체 판결 — 고정성을 통상임금의 요건에서 뺐고, 2024. 12. 19. 이후 제공한 연장근로 등부터 적용(이 사건·병행사건은 소급)',
        '대법원 2013. 12. 18. 선고 2012다89399 전원합의체 판결 — 정기성·일률성·소정근로 대가의 뜻, 가족수당·근속수당, 2024. 12. 18.까지 제공분의 종전 기준(고정성)',
        '대법원 2025. 1. 23. 선고 2019다204876 판결 · 2025. 8. 14. 선고 2023다216777 판결 — 장애인수당, 지급 조건의 효력, 약정 통상임금, 전년도 실적분 성과급',
        '대법원 2025. 8. 14. 선고 2021다258296 판결 — 소정근로일수에 미치지 못하는 출근율 조건·재직조건이 붙은 상여금',
        '근로기준법 시행령 제6조 제2항 제4·5·7호 — 월 밖의 기간으로 정한 임금도 같은 방식으로 시간급을 내 합산',
        '고용노동부 「(개정)통상임금 노사지도 지침」(2025. 2. 6.) — 행정 내부 지침, 요지만 적음',
      ]}
      basisNote={<>통상임금으로 해고예고수당을 보려면 <Link href="/tools/notice-pay" className="underline underline-offset-2">해고예고수당 계산기</Link>를 씁니다. 항목별 결과는 규정 원문과 운용 실태에 따라 달라질 수 있는 점검 결과입니다.</>}
    >
      <OrdinaryWageClient />
    </ToolShell>
  );
}
