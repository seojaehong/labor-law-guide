// AI 연결 도구(MCP) 안내 페이지의 데이터. 도구를 더할 때 여기 한 줄을 더한다.
// status 'preparing' 은 설치 명령을 싣지 않는다(아직 없는 패키지를 남이 깔지 않게).
// 이 파일이 도구 목록의 정본이다. server-card.json·k-labor server.json 은 시험(ai-tools.test.ts)이 여기와 대조한다.

// 등재 단위 = 패키지(MCP 서버). 카드 여러 장이 같은 패키지의 다른 묶음일 수 있다.
// 버전은 싣지 않는다 — npm·MCP 레지스트리가 정본이다.
export interface AiPackage {
  id: 'sanjae-apply' | 'k-labor';
  title: string;
  description: string; // 레지스트리 description 과 같은 영어 한 줄(100자 이하)
  mcpName: string; // 공식 MCP 레지스트리 이름
  npm: string;
  repo: string;
  websiteUrl: string;
  remote?: string; // 원격(streamable-http) 주소. 없으면 로컬(stdio)판만
  remoteTools?: number; // 원격 주소에서 쓸 수 있는 도구 수
}

export const AI_PACKAGES: AiPackage[] = [
  {
    id: 'sanjae-apply',
    title: '산재 신청 도우미 (sanjae-apply)',
    description: "Korean workers' compensation claims: required KCOMWEL forms and articles; fills official PDF forms.",
    mcpName: 'io.github.seojaehong/sanjae-apply',
    npm: 'sanjae-apply',
    repo: 'https://github.com/seojaehong/sanjae-apply',
    websiteUrl: 'https://sanjae-apply.vercel.app/',
    remote: 'https://sanjae-apply.vercel.app/api/mcp/mcp',
    remoteTools: 8,
  },
  {
    id: 'k-labor',
    title: '노동 업무 도구 (k-labor)',
    description: 'Korean labor tools: NHIS report forms, employment contracts, wage/leave/tax calculators, work rules.',
    mcpName: 'io.github.seojaehong/k-labor',
    npm: 'k-labor',
    repo: 'https://github.com/seojaehong/labor-law-guide',
    websiteUrl: 'https://yellowenvelope.kr/ai-tools',
    remote: 'https://yellowenvelope.kr/api/mcp/mcp',
    remoteTools: 23,
  },
];

// 「Claude 앱에 연결하기」 절에 싣는 순서.
export const REMOTE_CONNECTORS = (['k-labor', 'sanjae-apply'] as const).map((id) => AI_PACKAGES.find((p) => p.id === id)!);

// /.well-known/mcp/server-card.json 의 내용. 레지스트리 server.json 모양으로
// 패키지마다 설치 경로와, 있으면 원격 주소를 알린다.
export function serverCard() {
  return {
    name: '일의 무늬 AI 연결 도구',
    url: 'https://yellowenvelope.kr/ai-tools',
    servers: AI_PACKAGES.map((p) => ({
      name: p.mcpName,
      title: p.title,
      description: p.description,
      repository: { url: p.repo, source: 'github' },
      websiteUrl: p.websiteUrl,
      packages: [{ registryType: 'npm', identifier: p.npm, transport: { type: 'stdio' } }],
      ...(p.remote ? { remotes: [{ type: 'streamable-http', url: p.remote }] } : {}),
    })),
  };
}

export interface AiTool {
  id: string;
  name: string;
  status: 'public' | 'preparing';
  package?: AiPackage['id']; // MCP 카드만. 설치형 프로그램은 없음
  summary: string;
  does: string[];
  privacy: string;
  install?: { claudeCode: string; remote?: string };
  // MCP 가 아닌 설치형 프로그램. 공개 카드는 install 또는 download 중 하나가 있어야 한다.
  download?: { href: string; label: string; requires: string; note?: string };
  links: { label: string; href: string }[];
}

export const AI_TOOLS: AiTool[] = [
  {
    id: 'gov-login',
    name: '공단 로그인',
    status: 'public',
    summary: '근로복지공단 토탈서비스·국민연금 EDI·건강보험 EDI에 공동인증서로 들어가는 윈도우 프로그램입니다. 키 하나로 계정별 크롬 창을 열고 로그인 상태를 보여 줍니다.',
    does: [
      '계정과 사이트를 키로 배치하고, 키를 누르면 그 계정 전용 크롬 창을 엽니다',
      '계정 여러 개를 동시에 열어도 창끼리 로그인이 끊기지 않습니다',
      '「전체 열기」와 숫자 키 조합으로 여러 창을 한 번에 엽니다',
      '창마다 로그인 상태를 6초 간격으로 표시합니다',
      '처음 실행하면 설정 화면에서 인증서를 고르고 비밀번호를 한 번 넣습니다',
    ],
    privacy: '인증서 비밀번호와 사업장 비밀번호는 이 PC의 윈도우 보안 저장소(DPAPI)에만 암호화해 두고, 서버로 보내지 않습니다. 보안 키패드는 우회하지 않습니다.',
    download: {
      href: 'https://github.com/seojaehong/gov-cert-login/releases/latest',
      label: 'Windows 설치 파일 내려받기',
      requires: 'Windows 10/11 64비트, 구글 크롬, 공동인증서(하드디스크 또는 USB), 사이트별 보안프로그램(건강보험 EDI의 AnySign4PC 등). 홈택스는 준비 중입니다.',
      note: '코드 서명 전이라 처음 실행할 때 「Windows의 PC 보호」가 뜨면 「추가 정보 → 실행」을 누릅니다.',
    },
    links: [
      { label: '소스 코드(MIT)', href: 'https://github.com/seojaehong/gov-cert-login' },
    ],
  },
  {
    id: 'sanjae-apply',
    name: '산재 신청 도우미',
    status: 'public',
    package: 'sanjae-apply',
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
    status: 'public',
    package: 'k-labor',
    summary: '사업장 주소나 사업자등록번호로 관할 지사와 담당 번호를 찾고, 건강보험 자격취득·상실 신고서와 늦어진 사유를 적은 사업주확인서를 공식 서식 그대로 만듭니다.',
    does: [
      '주소·사업자등록번호 → 건강보험 관할 지사, 업무별 담당 전화·팩스',
      '건강보험 자격상실(별지 제8호)·자격취득(별지 제6호) 신고서 PDF',
      '늦어진 신고의 사유를 적은 사업주확인서',
      '사업주 본인 팝빌 계정으로 팩스·문자를 보내고 전송 결과를 확인하는 기능(시험 중, popbill 묶음을 따로 켭니다)',
    ],
    privacy: '사람 명단은 PC 안의 파일로만 받습니다. 도구가 그 파일을 직접 읽어 PDF 를 만들기 때문에 주민등록번호가 AI 대화에 실리지 않습니다.',
    install: { claudeCode: 'claude mcp add --scope user k-labor -- npx -y k-labor mcp --groups nhis' },
    links: [
      { label: 'npm', href: 'https://www.npmjs.com/package/k-labor' },
      { label: '웹에서 신고서 만들기', href: '/tools/nhis-report-form' },
      { label: '관할 지사 찾기', href: '/tools/branch-directory' },
    ],
  },
  {
    id: 'contract',
    name: '근로계약서 도구',
    status: 'public',
    package: 'k-labor',
    summary: '월 총액이나 시급과 근무형태를 말하면 임금 항목을 나눠 설계하고, 이미 쓴 계약서를 항목별로 점검하고, 엑셀·한글·PDF 파일로 저장합니다.',
    does: [
      '월 총액(또는 실수령액)·파트 시급 → 기본급·주휴·연장 등 항목별 시간과 금액, 통상시급',
      '계약서 점검 — 항목마다 위반·리스크·적정·자료 필요와 고칠 방향',
      '근로계약서 엑셀(xlsx)·한글(hwpx)·PDF 저장(내 PC 에서만)',
    ],
    privacy: '주민등록번호는 받지 않습니다. 점검 입력에 주민번호 모양이 있으면 거절하고, 근로자 이름도 비워 두면 「근로자」로 씁니다.',
    install: { claudeCode: 'claude mcp add --scope user k-labor -- npx -y k-labor mcp --groups contract', remote: 'https://yellowenvelope.kr/api/mcp/mcp' },
    links: [
      { label: '웹에서 계약서 쓰기', href: '/tools/contract-write' },
      { label: '웹에서 계약서 점검', href: '/tools/contract-check' },
    ],
  },
  {
    id: 'calc',
    name: '임금·수당 계산기 묶음',
    status: 'public',
    package: 'k-labor',
    summary: '사이트 계산기를 대화창에서 씁니다. 계산 결과와 함께 근거가 된 고시·조문을 알려 줍니다.',
    does: [
      '최저임금 비교(시간급 환산, 올해·내년 고시) · 실수령액(4대보험 근로자 몫·간이세액표 소득세)',
      '주휴수당 · 해고예고수당 · 공휴일 근로 수당 · 휴업수당',
      '퇴직금(평균임금 3개월 기준) · 입사·퇴사 달의 급여 일할계산',
      '임금 지연이자(근로기준법 제37조 연 20% — 퇴직 때 정산하는 임금·퇴직금, 재직 중 임금)',
      '상시 근로자 수 — 5명 이상·10명 이상으로 보는 기간',
    ],
    privacy: '계산에 필요한 금액·시간·날짜만 받습니다. 이름이나 주민등록번호는 필요하지 않습니다.',
    install: { claudeCode: 'claude mcp add --scope user k-labor -- npx -y k-labor mcp --groups calc', remote: 'https://yellowenvelope.kr/api/mcp/mcp' },
    links: [
      { label: '웹 계산기 모음', href: '/tools' },
    ],
  },
  {
    id: 'leave-tax',
    name: '연차·세금 계산기 묶음',
    status: 'public',
    package: 'k-labor',
    summary: '입사일과 기준일로 연차를 세고 퇴직할 때 남은 연차를 정산합니다. 퇴직소득세·일용근로소득 세금·중도퇴사자 연말정산도 계산합니다.',
    does: [
      '연차 발생일수(입사일·회계연도 기준) · 출근율 80% 확인',
      '퇴직 시 연차 재정산 — 발생·사용·남은 일수와 연차수당',
      '퇴직소득세(근속연수공제·환산급여, 지방소득세 포함)',
      '일용근로소득 원천징수(1일 15만 원 공제, 합계 1,000원 미만은 떼지 않음)',
      '중도퇴사자 연말정산 — 결정세액과 기납부세액의 차액',
    ],
    privacy: '날짜와 금액만 받습니다. 이름이나 주민등록번호는 필요하지 않습니다.',
    install: { claudeCode: 'claude mcp add --scope user k-labor -- npx -y k-labor mcp --groups leave,tax', remote: 'https://yellowenvelope.kr/api/mcp/mcp' },
    links: [
      { label: '연차 계산기', href: '/tools/leave' },
      { label: '퇴직소득세', href: '/tools/retirement-tax' },
      { label: '중도퇴사 연말정산', href: '/tools/midyear-settlement' },
    ],
  },
  {
    id: 'checks',
    name: '임금·계약 점검 묶음',
    status: 'public',
    package: 'k-labor',
    summary: '월급과 계약 형태를 넣으면 확인할 항목을 짚어 줍니다. 사업장 규모에 따라 지켜야 하는 사업주 의무도 목록으로 보여 줍니다.',
    does: [
      '월급 대조 — 중도입사·중도퇴사·결근 공제·시급제 주휴수당 중 하나를 골라 명세서 금액과 대조',
      '통상임금 점검 — 수당마다 들어가는 쪽·빠지는 쪽·보류, 2024. 12. 19. 전후 기준을 함께',
      '3.3% 계약의 근로자성 점검 — 대법원 판결의 요소별 대조와 3.3%·근로소득 실수령 비교',
      '사업장 규모별 사업주 의무 — 상시 근로자 수에 따라 생기는 의무 목록',
    ],
    privacy: '이름과 주민등록번호 칸이 없습니다. 금액·시간·근무 조건만 받습니다.',
    install: { claudeCode: 'claude mcp add --scope user k-labor -- npx -y k-labor mcp --groups calc,duties', remote: 'https://yellowenvelope.kr/api/mcp/mcp' },
    links: [
      { label: '월급 대조', href: '/tools/pay-check' },
      { label: '통상임금 점검', href: '/tools/ordinary-wage-check' },
      { label: '근로자성 점검', href: '/tools/contractor-check' },
      { label: '규모별 사업주 의무', href: '/duties' },
    ],
  },
  {
    id: 'work-rules',
    name: '취업규칙·법령 도구',
    status: 'public',
    package: 'k-labor',
    summary: '법제처에서 조문 원문을 실시간으로 가져와, 내 취업규칙에 개정 법령이 반영됐는지 조문별로 짚고 신고 서류를 만듭니다.',
    does: [
      '노동법 개정·시행 예정 목록',
      '법령 조문 원문, 두 시점의 조문 비교(법제처 실시간)',
      '취업규칙 개정 법령 반영 점검과 신·구 조문 대비표',
      '취업규칙 신고 서류(별지 제15호서식) 만들기(내 PC 에서만)',
    ],
    privacy: '취업규칙 파일은 내 PC 에서 읽습니다. 법제처에는 법령 이름과 조문 번호만 보냅니다. 법제처 실시간 조회는 본인의 국가법령정보 Open API 이용자 ID(OC)를 넣어야 켜지고, 없으면 묶어 둔 자료로 답합니다.',
    install: { claudeCode: 'claude mcp add --scope user k-labor -e LAW_OC=내OC -- npx -y k-labor mcp --groups work-rules' },
    links: [
      { label: '노동법 개정 알림판', href: '/laws' },
    ],
  },
];
