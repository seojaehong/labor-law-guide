import type { Metadata } from 'next';
import ToolShell from '@/components/tool/ToolShell';
import SanctionClient from './SanctionClient';
import { LEAD, TITLE } from './copy';

// 1차는 열쇠를 받은 사람만 쓴다(261123) — 도구 목록·사이트맵에 올리지 않고 검색에서도 뺀다.
export const metadata: Metadata = {
  title: `${TITLE} | 일의 무늬`,
  robots: { index: false, follow: false },
};

export default function SanctionCasesPage() {
  return (
    <ToolShell
      title={TITLE}
      lead={LEAD}
      basis={[
        '법원 판결 원문(대법원·고등법원·지방법원·행정법원) 중 징계 수위를 판단한 문단',
        '블록은 판결 원문에서 문장 통째로만 잘랐고, 다른 모델이 따로 채점해 통과한 것만 싣습니다',
        '양정 판단이 한 문장으로 길어 10줄에 담기지 않는 판결은 「긴 판단」으로 원문 전체를 싣습니다',
      ]}
      basisNote="판결 인용 전에는 사건번호로 판결 전문을 한 번 더 확인하세요."
    >
      <SanctionClient />
    </ToolShell>
  );
}
