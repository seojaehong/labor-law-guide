import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import ToolShell from '@/components/tool/ToolShell';
import BranchDirectoryClient from './BranchDirectoryClient';

export const metadata: Metadata = publicMetadata({
  title: '4대보험 관할 지사·담당자 번호 찾기 | 근로복지공단·건강보험·국민연금 | 일의 무늬',
  description:
    '사업장 주소나 사업자등록번호를 넣으면 근로복지공단·국민건강보험공단·국민연금공단의 관할 지사와 업무별 담당 전화·팩스를 한 번에 보여줍니다. 각 공단 홈페이지 지사 안내를 모은 것입니다.',
  keywords: ['관할 지사 찾기', '근로복지공단 지사 전화번호', '건강보험 지사 팩스', '국민연금 지사 담당자', '4대보험 관할지사'],
  alternates: { canonical: `${SITE_URL}/tools/branch-directory` },
  openGraph: {
    title: '4대보험 관할 지사·담당자 번호 찾기 | 일의 무늬',
    description: '주소 하나로 3개 공단의 관할 지사와 업무별 담당 번호를 찾습니다.',
    url: `${SITE_URL}/tools/branch-directory`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
});

export default function BranchDirectoryPage() {
  return (
    <ToolShell
      title="4대보험 관할 지사·담당자 번호 찾기"
      lead="사업장 주소나 사업자등록번호를 넣으면 근로복지공단·국민건강보험공단·국민연금공단의 관할 지사와 업무별 담당 전화·팩스를 한 번에 보여줍니다."
      basis={[
        '근로복지공단 「지사찾기」 지사별 담당자 안내 (comwel.or.kr)',
        '국민건강보험공단 「지사찾기」 부서안내·연락처와 지사관할 행정동 (nhis.or.kr)',
        '국민연금공단 「지사찾기」 지사조직·담당업무 및 연락처 (nps.or.kr)',
        '관할은 각 공단이 공개한 담당지역 문구로 맞춥니다. 공단이 정한 관리지사가 따로 있으면 그쪽이 우선입니다.',
      ]}
    >
      <BranchDirectoryClient />
    </ToolShell>
  );
}
