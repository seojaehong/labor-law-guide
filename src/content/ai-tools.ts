// AI 연결 도구(MCP) 안내 페이지의 데이터. 도구를 더할 때 여기 한 줄을 더한다.
// status 'preparing' 은 설치 명령을 싣지 않는다(아직 없는 패키지를 남이 깔지 않게).

export interface AiTool {
  id: string;
  name: string;
  status: 'public' | 'preparing';
  summary: string;
  does: string[];
  privacy: string;
  install?: { claudeCode: string; remote?: string };
  links: { label: string; href: string }[];
}

export const AI_TOOLS: AiTool[] = [
  {
    id: 'sanjae-apply',
    name: '산재 신청 도우미',
    status: 'public',
    summary: '급여 종류와 재해 상황을 말하면 필요한 서식·첨부·근거 조문을 알려 주고, 근로복지공단 정본 PDF 서식을 채웁니다.',
    does: [
      '급여 9종 × 사고·출퇴근·질병 분기별 필요 서식과 첨부 목록',
      '산재보험법·시행령·시행규칙 근거 조문 번호',
      '정본 PDF 12종과 한글(hwpx) 서식 채우기, 도장 그림 만들기',
      '아직 답이 없는 분기는 질문으로 되돌려 줍니다',
    ],
    privacy: '로컬 설치판은 PC 밖으로 입력을 보내지 않습니다. 다만 대화창에 적은 값은 AI 대화 기록에 남으니, 주민등록번호 같은 칸은 비워 두고 출력한 뒤 손으로 적으세요.',
    install: {
      claudeCode: 'claude mcp add --scope user sanjae-apply -- npx -y sanjae-apply mcp',
      remote: 'https://sanjae-apply.vercel.app/api/mcp/mcp',
    },
    links: [
      { label: '안내 페이지', href: 'https://sanjae-apply.vercel.app/' },
      { label: 'GitHub', href: 'https://github.com/seojaehong/sanjae-apply' },
      { label: 'npm', href: 'https://www.npmjs.com/package/sanjae-apply' },
    ],
  },
  {
    id: 'insurance-forms',
    name: '4대보험 신고서 도구',
    status: 'preparing',
    summary: '사업장 주소나 사업자등록번호로 관할 지사와 담당 번호를 찾고, 건강보험 자격취득·상실 신고서와 늦어진 사유를 적은 사업주확인서를 공식 서식 그대로 만듭니다.',
    does: [
      '주소·사업자등록번호 → 건강보험 관할 지사, 업무별 담당 전화·팩스',
      '건강보험 자격상실(별지 제8호)·자격취득(별지 제6호) 신고서 PDF',
      '늦어진 신고의 사유를 적은 사업주확인서',
      '사업주 본인 팝빌 계정으로 팩스·문자를 보내고 전송 결과를 확인하는 기능(시험 중)',
    ],
    privacy: '사람 명단은 PC 안의 파일로만 받습니다. 도구가 그 파일을 직접 읽어 PDF 를 만들기 때문에 주민등록번호가 AI 대화에 실리지 않습니다.',
    links: [
      { label: '웹에서 신고서 만들기', href: '/tools/nhis-report-form' },
      { label: '관할 지사 찾기', href: '/tools/branch-directory' },
    ],
  },
  {
    id: 'contract',
    name: '근로계약서 도구',
    status: 'preparing',
    summary: '월 총액이나 시급과 근무형태를 말하면 임금 항목을 나눠 설계하고, 이미 쓴 계약서를 항목별로 점검하고, 엑셀·한글·PDF 파일로 저장합니다.',
    does: [
      '월 총액(또는 실수령액)·파트 시급 → 기본급·주휴·연장 등 항목별 시간과 금액, 통상시급',
      '계약서 점검 — 항목마다 위반·리스크·적정·자료 필요와 고칠 방향',
      '근로계약서 엑셀(xlsx)·한글(hwpx)·PDF 저장(내 PC 에서만)',
    ],
    privacy: '주민등록번호는 받지 않습니다. 점검 입력에 주민번호 모양이 있으면 거절하고, 근로자 이름도 비워 두면 「근로자」로 씁니다.',
    links: [
      { label: '웹에서 계약서 쓰기', href: '/tools/contract-write' },
      { label: '웹에서 계약서 점검', href: '/tools/contract-check' },
    ],
  },
  {
    id: 'calc',
    name: '노동 계산기 묶음',
    status: 'preparing',
    summary: '사이트 계산기 6종을 대화창에서 씁니다. 계산 결과와 함께 근거가 된 고시·조문을 알려 줍니다.',
    does: [
      '최저임금 비교(시간급 환산, 올해·내년 고시)',
      '주휴수당 · 해고예고수당 · 연차수당(퇴직 시 누계, 단시간 근로자 포함)',
      '상시 근로자 수 — 5명 이상·10명 이상으로 보는 기간',
      '실수령액(4대보험 근로자 몫·간이세액표 소득세)',
    ],
    privacy: '계산에 필요한 금액·시간·날짜만 받습니다. 이름이나 주민등록번호는 필요하지 않습니다.',
    links: [
      { label: '웹 계산기 모음', href: '/tools' },
    ],
  },
];
