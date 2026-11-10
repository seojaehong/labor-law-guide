import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import ToolShell from '@/components/tool/ToolShell';
import CouncilGraphClient from './CouncilGraphClient';

export const metadata: Metadata = publicMetadata({
  title: '노사협의회 회의록 그래프 | 안건·이월·이행·고충 | 일의 무늬',
  description:
    '노사협의회 기록 폴더(회의록·이행 기록·고충 대장)를 열면 회의·안건·이월·이행·고충의 연결을 그래프로 그립니다. 기한이 지난 이행과 고충만 골라 볼 수 있고, 파일은 브라우저 안에서만 읽습니다.',
  keywords: ['노사협의회 회의록', '노사협의회 의결사항 이행', '고충처리 대장', '근로자참여법 제20조', '회의록 관리'],
  alternates: { canonical: `${SITE_URL}/tools/council-graph` },
  openGraph: {
    title: '노사협의회 회의록 그래프 | 일의 무늬',
    description: '회의록·이행 기록·고충 대장을 그래프로 — 이월된 안건과 기한이 지난 이행을 한눈에.',
    url: `${SITE_URL}/tools/council-graph`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
});

export default function CouncilGraphPage() {
  return (
    <ToolShell
      title="노사협의회 회의록 그래프"
      lead="노사협의회 기록 폴더를 열면 회의·안건·이월·이행·고충이 어떻게 이어지는지 그래프로 그립니다. 여러 번 이월된 안건, 기한이 지난 이행, 처리결과를 아직 알리지 않은 고충을 바로 찾을 수 있습니다. 폴더가 없으면 가상 예시로 먼저 봅니다."
      basis={[
        '근로자참여 및 협력증진에 관한 법률 제19조 — 회의록 작성·3년 보존',
        '같은 법 제20조제1항(협의사항)·제21조(의결사항)·제22조제1항(보고사항) — 안건의 법조문 분류',
        '같은 법 제28조 — 고충사항 청취일부터 10일 이내 처리결과 통보, 처리하기 곤란한 사항은 협의회 회의에 부침',
        '같은 법 시행령 제9조 — 고충사항 접수·처리 대장 1년 보존',
        '선은 회의록에 적힌 안건 ID·결과·법조문·제안 측·이행 기록·고충 부의에서만 만듭니다. 가져와서 확인하지 않은 회의록은 잇지 않습니다.',
      ]}
      basisNote={<>기록 폴더는 k-labor 로컬 도구(make_council_meeting_docs · record_council_history · import_council_minutes)가 만듭니다.</>}
    >
      <CouncilGraphClient />
    </ToolShell>
  );
}
