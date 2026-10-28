import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import ToolShell from '@/components/tool/ToolShell';
import MidyearSettlementClient from './MidyearSettlementClient';

// 이름·소개 금지어(261028 공통 장치)는 tests/unit/calc-midyear-settlement.test.ts 가 막는다.
export const metadata: Metadata = publicMetadata({
  title: '중도퇴사 연말정산 계산기 | 퇴직월 환급·추징 예상 | 일의 무늬',
  description:
    '퇴사한 해 받은 급여·비과세·4대보험료·이미 낸 소득세를 넣으면 퇴직월 연말정산으로 돌려받거나 더 낼 소득세·지방소득세 예상액을 계산합니다. 본인 공제만 넣는 고정형입니다.',
  keywords: ['중도퇴사 연말정산', '퇴사 연말정산 환급', '중도퇴사 환급금', '퇴직월 소득세', '중도퇴사 연말정산 계산기'],
  alternates: { canonical: `${SITE_URL}/tools/midyear-settlement` },
  openGraph: {
    title: '중도퇴사 연말정산 계산기 | 일의 무늬',
    description: '퇴직월 연말정산으로 돌려받거나 더 낼 소득세 예상액. 본인 공제만 넣는 고정형.',
    url: `${SITE_URL}/tools/midyear-settlement`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
});

export default function MidyearSettlementPage() {
  return (
    <ToolShell
      title="중도퇴사 연말정산 계산기"
      lead="퇴사한 해에 받은 급여와 비과세, 4대보험료, 이미 낸 소득세를 넣으면 퇴직월 연말정산으로 돌려받거나 더 낼 금액을 예상합니다. 본인 공제만 넣는 고정형이라 부양가족·종전 근무지·감면은 다루지 않습니다."
      basis={[
        '소득세법 제137조 제1항 — 퇴직하는 달의 근로소득을 줄 때 연말정산',
        '소득세법 제20조 제2항, 제47조 제1항 — 총급여는 비과세를 뺀 금액, 근로소득공제 5구간(한도 2천만원)',
        '소득세법 제50조 제1항 제1호, 제51조의3, 제52조 제1항 — 본인 기본공제 150만원, 국민연금 연금보험료공제, 건강·장기요양·고용보험료 소득공제',
        '소득세법 제55조 제1항, 제59조 제1항·제2항 — 기본세율, 근로소득세액공제와 총급여 구간별 한도',
        '소득세법 제59조의4 제9항 제1호 — 표준세액공제 13만원은 보험료 소득공제를 신청하지 않은 경우에만. 그래서 둘 중 결정세액이 작은 쪽으로 계산',
        '소득세법 제61조 — 세액공제가 산출세액을 넘는 부분은 없는 것으로 봄(결정세액 0 아래로 내려가지 않음)',
        '국고금 관리법 제47조, 지방세법 제103조의13 제1항, 지방세기본법 제59조 — 10원 미만 버림, 지방소득세는 소득세의 100분의 10',
        '2026년 귀속 기준, 조문 확인 2026. 10. 28.',
      ]}
      basisNote={
        <>
          세무대리·신고서 작성 대행이 아닙니다.{' '}
          <a href="https://www.hometax.go.kr" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">홈택스</a>의 연말정산 모의계산으로도 확인할 수 있습니다.
        </>
      }
    >
      <MidyearSettlementClient />
    </ToolShell>
  );
}
