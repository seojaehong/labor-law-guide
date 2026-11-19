// /gov-tools — 공단·관공서에 낼 서류와 접속을 돕는 도구 모음(261119).
// /ai-tools(AI 에 연결해 쓰는 MCP)와 다르다 — 사람이 직접 내려받거나 화면에서 쓰는 것만 싣는다.

export interface GovToolAction {
  label: string;
  href: string;
}

export interface GovTool {
  id: 'gov-login' | 'sanjae' | 'nhis-report-form' | 'branch-directory';
  name: string;
  kind: string;
  summary: string;
  does: string[];
  /** 설치 프로그램만 — 쓰기 전에 갖출 것 */
  requires?: string;
  note?: string;
  actions: GovToolAction[];
}

export const GOV_TOOLS: GovTool[] = [
  {
    id: 'gov-login',
    name: '공단 로그인',
    kind: 'Windows 설치 프로그램',
    summary:
      '근로복지공단 토탈서비스·국민연금 EDI·건강보험 EDI·효성CMS에 공동인증서로 들어가는 프로그램입니다. 키 하나로 계정별 크롬 창을 열고 로그인까지 진행합니다.',
    does: [
      '계정 × 사이트마다 키가 생기고, 누르면 그 계정 전용 크롬 창이 열립니다',
      '계정 여러 개를 동시에 열어도 서로 로그인을 끊지 않습니다',
      '「전체 열기」와 숫자 키 조합으로 여러 창을 한 번에 엽니다',
      '창마다 로그인 상태를 6초 간격으로 보여 줍니다',
      '신고·제출은 하지 않습니다. 로그인한 창을 열어 두는 데까지입니다',
    ],
    requires:
      'Windows 10/11 64비트, 구글 크롬, 파일 형태 공동인증서(하드디스크 NPKI 또는 USB), 건강보험 EDI·효성CMS는 AnySign4PC. 금융인증서·보안토큰은 쓸 수 없습니다.',
    note:
      '인증서 비밀번호는 그 PC의 윈도우 보안 저장소(DPAPI)에만 암호화해 둡니다. 여러 사람이 함께 쓰는 PC에서는 쓰지 마세요. 코드 서명 전이라 처음 실행할 때 「Windows의 PC 보호」가 뜨면 「추가 정보 → 실행」을 누릅니다.',
    actions: [
      { label: 'Windows 설치 파일 내려받기', href: 'https://github.com/seojaehong/gov-cert-login/releases/latest' },
      { label: '사용설명서', href: 'https://seojaehong.github.io/gov-cert-login/' },
      { label: '소스 코드(MIT)', href: 'https://github.com/seojaehong/gov-cert-login' },
    ],
  },
  {
    id: 'sanjae',
    name: '산재 신청 서식 작성',
    kind: '웹 화면',
    summary:
      '근로복지공단 산재 신청 서식(요양급여 신청서 등)을 화면에서 채워 PDF로 내려받습니다. 필요한 서식과 첨부 목록도 함께 확인합니다.',
    does: [
      '재해 유형(업무상 사고·출퇴근 사고 등)에 따라 필요한 서식을 고릅니다',
      '공단 서식 원본 위에 입력한 값을 채워 PDF로 내려받습니다',
      '아직 갖추지 못한 첨부 서류를 목록으로 보여 줍니다',
    ],
    actions: [
      { label: '서식 작성 화면 열기', href: 'https://sanjae-apply.vercel.app' },
      { label: 'AI 에 연결해 쓰기(MCP)', href: '/ai-tools' },
    ],
  },
  {
    id: 'nhis-report-form',
    name: '건강보험 신고서',
    kind: '웹 화면',
    summary: '늦게 내는 건강보험 자격 취득·상실 신고서를 채워 PDF로 내려받습니다.',
    does: ['취득·상실 신고서 칸을 화면에서 채웁니다', '공단 서식 모양 그대로 PDF로 내려받습니다'],
    actions: [{ label: '신고서 작성하기', href: '/tools/nhis-report-form' }],
  },
  {
    id: 'branch-directory',
    name: '관할 공단 지사 연락처',
    kind: '웹 화면',
    summary: '사업장 주소로 관할 근로복지공단·국민연금·건강보험 지사와 업무별 담당 전화번호를 찾습니다.',
    does: ['주소를 넣으면 관할 지사를 찾습니다', '업무별 담당 부서 전화번호를 보여 줍니다'],
    actions: [{ label: '지사 찾기', href: '/tools/branch-directory' }],
  },
];
