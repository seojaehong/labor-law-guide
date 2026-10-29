import Link from 'next/link';
import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import ToolShell from '@/components/tool/ToolShell';
import ContractorCheckClient from './ContractorCheckClient';

export const metadata: Metadata = publicMetadata({
  title: '3.3% 계약 점검 | 프리랜서 근로자성 기준과 실수령 비교 | 일의 무늬',
  description:
    '프리랜서(사업소득 3.3%)로 계약했지만 실제로 일한 모습을 대법원 2004다29736 판결의 근로자성 기준과 항목마다 대조하고, 같은 보수를 3.3%로 뗄 때와 근로소득으로 뗄 때의 예상 실수령을 나란히 보여줍니다.',
  keywords: ['3.3% 근로자성', '프리랜서 근로자', '사업소득 3.3% 실수령', '근로자성 기준', '2004다29736'],
  alternates: { canonical: `${SITE_URL}/tools/contractor-check` },
  openGraph: {
    title: '3.3% 계약 점검 | 일의 무늬',
    description: '실제로 일한 모습을 판례 기준과 대조하고, 3.3%와 근로소득의 예상 실수령을 나란히 봅니다.',
    url: `${SITE_URL}/tools/contractor-check`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
});

export default function ContractorCheckPage() {
  return (
    <ToolShell
      title="3.3% 계약 점검"
      lead="프리랜서(사업소득 3.3%)로 계약했더라도 실제로 일한 모습을 대법원 판례의 근로자성 기준과 항목마다 대조합니다. 같은 보수를 3.3%로 뗄 때와 근로소득으로 뗄 때의 예상 실수령도 나란히 보여줍니다."
      basis={[
        '대법원 2006. 12. 7. 선고 2004다29736 판결 — 근로자인지는 계약의 형식보다 실질로, 종속적인 관계에서 근로를 제공했는지로 본다. 고정급·근로소득세 원천징수·사회보장 가입 여부는 사용자가 임의로 정할 여지가 커 그것이 없다는 것만으로 쉽게 부정하지 않는다',
        '근로기준법 제2조제1항제1호 — 근로자의 정의',
        '고용노동부 행정해석 근로개선정책과-1333(2012. 2. 16.)·근로기준정책과-2947(2019. 5. 21.) — 같은 판례 기준으로 사업소득세를 뗀 사람을 근로자로 본 회시. 근기68207-2172(2000. 7. 21.)처럼 근로자가 아니라고 본 회시도 있다',
        '소득세법 제127조제1항제3호·제129조제1항제3호, 시행령 제184조제1항 — 원천징수대상 사업소득(부가가치세법 제26조제1항제15호 인적 용역 등)은 100분의 3',
        '지방세법 제103조의13제1항 — 지방소득세는 원천징수하는 소득세의 100분의 10',
        '소득세법 제86조제1호, 시행령 제149조의3 — 인적 용역을 계속·반복해서 제공하고 받는 소득은 1천원 미만이어도 징수(2024. 7. 1. 이후 지급분)',
        '국고금 관리법 제47조제1항 — 10원 미만 버림. 지방소득세도 같이 버린다(지방회계법 제55조)',
        '근로소득 쪽 — 소득세법 시행령 [별표2] 근로소득 간이세액표 <개정 2026. 2. 27.>과 국민연금·건강보험·장기요양·고용보험 근로자 몫(실수령액 계산기와 같은 계산)',
      ]}
      basisNote={<>근로소득 쪽 공제 항목별 근거는 <Link href="/tools/take-home-pay" className="underline underline-offset-2">실수령액 계산기</Link>에서 봅니다. 점검 결과는 답한 내용만으로 대조한 것이라 실제 사정에 따라 달라질 수 있습니다.</>}
    >
      <ContractorCheckClient />
    </ToolShell>
  );
}
