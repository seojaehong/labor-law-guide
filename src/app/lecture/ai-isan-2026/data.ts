// 이산노무법인 AI 강의 — 콘텐츠 데이터 v3
// 책 목차(가이쥬 출판 「클로드 바로 시작하기」 같은 형태) 기반 노무사 재구성
// + code.claude.com/docs/ko 공식 자료
// + 실습 2개 (HWPX 양식 자동 채우기 / 회의록 자동 정리 스킬)
//
// 콘텐츠 우선 — 디자인은 차후

export type SlideLayout =
  | 'cover' | 'title' | 'bullets' | 'quote' | 'comparison'
  | 'metrics' | 'flow' | 'demo' | 'concept' | 'practice' | 'closing';

export type Slide = {
  id: string;
  block: number;
  layout: SlideLayout;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  body?: string;
  bullets?: string[];
  callout?: string;
  metrics?: { value: string; label: string; hint?: string }[];
  comparison?: { left: { title: string; items: string[] }; right: { title: string; items: string[] } };
  flow?: { step: string; title: string; desc?: string }[];
  demo?: { prompt: string; result?: string; tool?: string };
  concept?: { term: string; def: string; example?: string }[];
  practice?: {
    name: string;
    goal: string;
    steps: string[];
    output: string;
    duration?: string;
  };
  accent?: 'amber' | 'blue' | 'emerald' | 'violet' | 'orange' | 'rose' | 'cyan' | 'slate' | 'indigo';
  bookRef?: string; // "[바로 06]" 같은 책 참조
  speakerNote?: string;
};

export const META = {
  title: '노무사를 위한 Claude × Codex 실전',
  subtitle: 'Cowork·Excel·PowerPoint·HWPX 자동화까지',
  speaker: '공인노무사 서재홍 · 노무법인 위너스',
  org: '이산노무법인',
  date: '2026.06.11',
  duration: '3시간 · 80명 · 대강당',
  site: 'yellowenvelope.kr',
};

export const BLOCKS = [
  { idx: 0, title: '오리엔테이션', minutes: 10, accent: 'amber' as const },
  { idx: 1, title: 'Claude 시작', minutes: 25, accent: 'blue' as const },
  { idx: 2, title: '글쓰기·자료조사·프로젝트', minutes: 30, accent: 'emerald' as const },
  { idx: 3, title: '휴식', minutes: 10, accent: 'slate' as const },
  { idx: 4, title: '아티팩트·커넥터(엑셀·PPT)', minutes: 30, accent: 'violet' as const },
  { idx: 5, title: '스킬 — 워드·PPT·회의록', minutes: 15, accent: 'indigo' as const },
  { idx: 6, title: '코워크 — HWPX·옵시디언·스마트폰', minutes: 40, accent: 'orange' as const },
  { idx: 7, title: '책임·검증·기밀 + Q&A', minutes: 20, accent: 'rose' as const },
];

export const SLIDES: Slide[] = [
  // ====== Block 0 — 오리엔테이션 ======
  {
    id: 'cover', block: 0, layout: 'cover',
    title: '노무사를 위한 Claude × Codex 실전',
    subtitle: 'Cowork · Excel · PowerPoint · HWPX 자동화',
    eyebrow: '이산노무법인 · 2026.06.11',
    body: '공인노무사 서재홍',
    accent: 'amber',
  },
  {
    id: '0-speaker', block: 0, layout: 'bullets',
    eyebrow: 'Block 0 · 오리엔테이션',
    title: '오늘 발표자',
    bullets: [
      '공인노무사 19기 (2010) · 노무법인 위너스 책임노무사',
      '한국공인노무사회 조정중재위원회 운영이사 (2025)',
      '한국고용노동교육원 직장 내 괴롭힘 전문강사',
      '서울시·노사발전재단 일생활균형·일터혁신 컨설턴트',
      '노란봉투법 가이드 — yellowenvelope.kr · 라이브 데모',
    ],
    callout: 'Claude 4개 에이전트가 매일 노동법 글 작성·검수·재작성 중',
    accent: 'amber',
  },
  {
    id: '0-why', block: 0, layout: 'quote',
    eyebrow: 'Block 0 · 왜 지금',
    body: '"의뢰인이 ChatGPT 먼저 보고 와요"',
    subtitle: '경쟁자는 옆 사무소가 아니라 의뢰인 손 안의 AI',
    accent: 'amber',
  },
  {
    id: '0-today', block: 0, layout: 'flow',
    eyebrow: 'Block 0 · 오늘 흐름',
    title: '3시간 동안 다룰 8가지',
    flow: [
      { step: 'B1', title: 'Claude 시작', desc: '가입·구독·인터페이스·프롬프트·맞춤설정' },
      { step: 'B2', title: '글쓰기·자료조사·프로젝트', desc: '의뢰인별 컨텍스트 영구 저장' },
      { step: 'B3', title: '아티팩트·커넥터', desc: 'PDF·구글드라이브·지메일·캘린더·Excel·PPT' },
      { step: 'B4', title: '스킬', desc: '워드·PPT·**회의록 자동 정리** 실습' },
      { step: 'B5', title: '코워크 — **HWPX**', desc: '**한글 양식 자동 채우기** 실습' },
      { step: 'B6', title: '책임·Q&A', desc: '환각·개인정보·요금 + 케이스' },
    ],
    callout: '두 실습 — 회의록 정리 스킬 + HWPX 양식 자동 채우기',
    accent: 'amber',
  },

  // ====== Block 1 — Claude 시작 ======
  {
    id: '1-cover', block: 1, layout: 'title',
    eyebrow: 'Block 1 · 25분',
    title: 'Claude 시작',
    subtitle: '가입 · 구독 · 인터페이스 · 프롬프트 · 맞춤 설정',
    body: '책 1장 핵심 — 30분 안에 다 끝낸다',
    accent: 'blue',
  },
  {
    id: '1-signup', block: 1, layout: 'flow',
    eyebrow: 'Block 1 · 가입·구독',
    title: 'Claude 시작 4단계',
    bookRef: '[바로 01~05]',
    flow: [
      { step: '1', title: '회원 가입', desc: 'claude.ai · 구글/마이크로소프트 계정' },
      { step: '2', title: '구독', desc: 'Pro $20/월 · Max · Team · Enterprise' },
      { step: '3', title: '데스크톱 앱 설치', desc: 'macOS · Windows · ARM64' },
      { step: '4', title: '채팅 시작', desc: 'Cmd+L (Mac) / Ctrl+L (Win) 단축키' },
    ],
    callout: 'Pro부터 Excel·PowerPoint·코워크 다 풀림 · 학습 비활성 가능',
    accent: 'blue',
  },
  {
    id: '1-engineering', block: 1, layout: 'concept',
    eyebrow: 'Block 1 · 프롬프트 이해',
    title: '3가지 엔지니어링 — 한 장으로',
    bookRef: '[1.4]',
    concept: [
      { term: '프롬프트 엔지니어링', def: '한 번의 질문을 잘 던지는 기술', example: '"~를 ~형식으로 ~조건에 맞춰 작성해줘"' },
      { term: '컨텍스트 엔지니어링', def: '이전 대화·자료·메모리를 어떻게 쌓을지 설계', example: 'Project에 의뢰인 자료 + 작업 지침 + 양식 미리 박기' },
      { term: '하네스 엔지니어링', def: '여러 에이전트·도구를 연결해 통제하는 설계', example: 'Claude Code + Skills + MCP 조합 (노란봉투법.com 운영)' },
    ],
    callout: '노무사는 1·2번이 핵심. 3번은 운영 단계에서.',
    accent: 'blue',
  },
  {
    id: '1-good-prompt', block: 1, layout: 'comparison',
    eyebrow: 'Block 1 · 좋은 프롬프트',
    title: '나쁜 프롬프트 vs 좋은 프롬프트',
    comparison: {
      left: {
        title: '❌ 나쁜 예',
        items: [
          '"부당해고 의견서 써줘"',
          '"이 계약서 봐줘"',
          '"질문 정리해줘"',
          '— 결과가 일반적이고 도움 안 됨',
        ],
      },
      right: {
        title: '✅ 좋은 예',
        items: [
          '"근속 5년 사무직, 회사 매출 30% 감소, 정리해고 통보 받은 의뢰인의 부당해고 구제신청서 초안을 노조법 제24조·근기법 제24조 4요건 기준으로 표 형태로 작성"',
          '역할 + 사실관계 + 출력 형식 + 인용 근거 명시',
          '— 결과를 즉시 의뢰인에게 보낼 수 있을 수준',
        ],
      },
    },
    accent: 'blue',
  },
  {
    id: '1-custom', block: 1, layout: 'bullets',
    eyebrow: 'Block 1 · 맞춤 설정',
    title: '나만의 업무 비서 세팅 5분',
    bookRef: '[바로 06~07]',
    bullets: [
      '설정 → 사용자 환경 설정 → "어떤 일을 하나" 자기소개',
      '"공인노무사 서재홍 — 노동법·근로기준법·판례 전문" 박기',
      '말투·답변 길이·인용 형식 지정',
      'ChatGPT·Gemini에서 메모리 이전 (수동 복붙)',
      '한 번 박으면 모든 대화에 자동 적용',
    ],
    accent: 'blue',
  },

  // ====== Block 2 — 글쓰기·자료조사·프로젝트 ======
  {
    id: '2-cover', block: 2, layout: 'title',
    eyebrow: 'Block 2 · 30분',
    title: '글쓰기 · 자료조사 · 프로젝트',
    subtitle: '책 2장 — 의견서 30분 컷의 핵심',
    body: '의뢰인별 컨텍스트 영구 저장 = Project',
    accent: 'emerald',
  },
  {
    id: '2-writing', block: 2, layout: 'bullets',
    eyebrow: 'Block 2 · 글쓰기',
    title: '맞춤 글쓰기 3단계',
    bookRef: '[바로 08~10]',
    bullets: [
      '스타일 정하기 — "사무적이고 법률 용어 정확하게"',
      '문서 첨부 — PDF·docx·hwpx 직접 업로드',
      '질의응답 반복 — 한 번에 완성 X, 단계별 다듬기',
      '"이 문장 더 부드럽게" "근거 더 추가해" 자연어 수정',
    ],
    callout: '의뢰인 진술서 → 자문 의견서 → 회신문, 한 흐름으로',
    accent: 'emerald',
  },
  {
    id: '2-research', block: 2, layout: 'concept',
    eyebrow: 'Block 2 · 자료 조사',
    title: '4가지 핵심 개념',
    bookRef: '[2.2]',
    concept: [
      { term: '환각 (Hallucination)', def: 'AI가 존재하지 않는 법조항·판례번호를 만들어내는 것', example: '"근기법 제111조의5"라는 가짜 조항 인용' },
      { term: '지식 컷오프', def: 'AI가 학습한 시점 이후의 정보는 모름', example: 'Claude는 2026년 X월까지 학습 — 최신 판례는 별도 확인' },
      { term: 'RAG (검색 증강)', def: '실시간 검색으로 외부 자료를 가져와 답하는 방식', example: '법제처 API + Claude 결합 = 항상 최신 법령' },
      { term: '연구 모드', def: '여러 출처 자료를 직접 찾아 전문가급 리포트 생성', example: '"노란봉투법 시행 후 판례 동향 리포트 만들어줘"' },
    ],
    accent: 'emerald',
  },
  {
    id: '2-research-demo', block: 2, layout: 'demo',
    eyebrow: 'Block 2 · 시연',
    title: '웹 검색 + 연구 모드',
    bookRef: '[바로 11~12]',
    demo: {
      tool: 'Claude.ai · 연구 모드 on',
      prompt: '"포괄임금제 적법성"에 관한 최근 1년 대법원 판례 5건과 그 핵심 논리, 노무사 실무에 미치는 영향을 정리해줘.',
      result: '✓ 실제 판례 검색 → 인용\n✓ 출처 링크 자동 첨부\n✓ 노무사 실무 적용 포인트 정리\n✓ 검증해야 할 부분 명시',
    },
    callout: '한 번 돌리면 10분 — 보고서 1장 자동',
    accent: 'emerald',
  },
  {
    id: '2-projects', block: 2, layout: 'flow',
    eyebrow: 'Block 2 · 프로젝트 ⭐',
    title: '의뢰인별 컨텍스트 영구 저장',
    bookRef: '[바로 13~15]',
    flow: [
      { step: '1', title: 'Project 만들기', desc: '"○○회사 자문" 1 의뢰인 = 1 Project' },
      { step: '2', title: '지침 설정', desc: '의뢰인 정보·자주 묻는 질문·답변 톤·인용 형식' },
      { step: '3', title: '자료 업로드', desc: '계약서·취업규칙·진정서·이전 의견서' },
      { step: '4', title: '메모리 관리', desc: '오래된 자료 정리, 새 자료 추가' },
    ],
    callout: 'Pro·Team — Project당 200K 컨텍스트 (책 500페이지)',
    accent: 'emerald',
  },
  {
    id: '2-visualizer', block: 2, layout: 'bullets',
    eyebrow: 'Block 2 · 비주얼라이저',
    title: '차트·다이어그램 자동 생성',
    bookRef: '[바로 16, 활용]',
    bullets: [
      '"의뢰인 산업·매출 추이·이슈 발생 시점 차트로 만들어줘"',
      '월간 트렌드 보고서 자동 완성',
      '의뢰인 미팅 자료 5분 안에 완성',
      'PNG·PDF·SVG 출력',
    ],
    accent: 'emerald',
  },

  // ====== Block 3 — 휴식 ======
  {
    id: '3-break', block: 3, layout: 'quote',
    eyebrow: 'Block 3 · 휴식 10분',
    body: '☕ 10분 쉬어가요',
    subtitle: '돌아오시면 커넥터 + 스킬 + 코워크 HWPX',
    accent: 'slate',
  },

  // ====== Block 4 — 아티팩트·커넥터 ======
  {
    id: '4-cover', block: 4, layout: 'title',
    eyebrow: 'Block 4 · 30분',
    title: '아티팩트 · 커넥터',
    subtitle: 'PDF·구글드라이브·지메일·캘린더·Excel·PowerPoint',
    body: '책 3장 + 4장 — 노무사 일상 도구 연결',
    accent: 'violet',
  },
  {
    id: '4-artifacts', block: 4, layout: 'bullets',
    eyebrow: 'Block 4 · 아티팩트',
    title: '결과물 바로 만들기',
    bookRef: '[바로 17~22]',
    bullets: [
      'PDF 보고서 — "이 자문 내용으로 5장짜리 PDF 만들어줘"',
      '머메이드 다이어그램 — 사건 흐름도·조직도·법적 절차 시각화',
      '간단한 앱 — 의뢰인용 임금 계산기·체크리스트',
      '스마트폰에서도 아티팩트 보기 가능',
    ],
    callout: '아티팩트 = "코드 없이 만들어지는 결과물" — 노무사도 쓸 만함',
    accent: 'violet',
  },
  {
    id: '4-mcp', block: 4, layout: 'concept',
    eyebrow: 'Block 4 · 커넥터',
    title: '2가지 핵심 개념',
    bookRef: '[4.1]',
    concept: [
      { term: 'MCP (Model Context Protocol)', def: 'AI가 외부 도구·데이터에 안전하게 접근하는 표준', example: '구글 드라이브·노션·캘린더 모두 같은 방식으로 연결' },
      { term: 'API', def: '프로그램끼리 데이터 주고받는 방법', example: '법제처 API → 항상 최신 법령 조회' },
    ],
    accent: 'violet',
  },
  {
    id: '4-google', block: 4, layout: 'flow',
    eyebrow: 'Block 4 · 구글 통합',
    title: '노무사 일상 — 구글 3종 세트',
    bookRef: '[바로 25~27]',
    flow: [
      { step: '1', title: '구글 드라이브', desc: '"○○회사 폴더에서 이번 달 자문 자료 찾아줘"' },
      { step: '2', title: '지메일', desc: '"이번 주 의뢰인 메일 정리하고 답장 초안"' },
      { step: '3', title: '구글 캘린더', desc: '"내일 회의 일정 등록 — 의뢰인 ○○, 14시"' },
    ],
    callout: '5분 만에 연결 → 매일 30분 절약',
    accent: 'violet',
  },
  {
    id: '4-excel', block: 4, layout: 'demo',
    eyebrow: 'Block 4 · Excel',
    title: 'Excel + Claude — Ctrl+Alt+C',
    bookRef: '[바로 33~35]',
    demo: {
      tool: 'Excel + Claude 추가 기능',
      prompt: '이 급여대장(200명)에서\n(1) 통상임금 계산 오류\n(2) 4대보험 산정 오류\n(3) 최저임금 미달자\n를 찾아 "검토결과" 열에 사유와 함께 적어줘.',
      result: '✓ 셀별 형광 강조\n✓ 검토결과 열 자동\n✓ 수식·시트 의존성 보존\n✓ 조건부 서식까지 자동',
    },
    callout: '50만 셀+은 분할 권장 · 의뢰인 정보는 마스킹',
    accent: 'violet',
  },
  {
    id: '4-ppt', block: 4, layout: 'demo',
    eyebrow: 'Block 4 · PowerPoint',
    title: 'PowerPoint + Claude — 슬라이드 마스터부터',
    bookRef: '[바로 36~37]',
    demo: {
      tool: 'PowerPoint + Claude 추가 기능',
      prompt: '취업규칙 컨설팅 보고서 슬라이드 8장 만들어줘:\n(1) 현황 진단 (2) 위반 법령 (3) 우선순위\n(4) 개선안 A/B (5) 일정 (6) 견적\n(7) 다음 단계 (8) 감사. 톤: 보수적·중역용.',
      result: '슬라이드 마스터 + 각 장 제목·불릿·차트 자리·이미지 자리 자동\nExcel 데이터에서 차트 자동 가져옴',
    },
    accent: 'violet',
  },

  // ====== Block 5 — 스킬 ======
  {
    id: '5-cover', block: 5, layout: 'title',
    eyebrow: 'Block 5 · 15분',
    title: '스킬 — 반복 작업 자동화',
    subtitle: '워드 · PPT · 회의록 자동 정리',
    body: '책 5장 — 한 번 만들면 평생 쓰는 워크플로우',
    accent: 'indigo',
  },
  {
    id: '5-what', block: 5, layout: 'comparison',
    eyebrow: 'Block 5 · 개념',
    title: '스킬 vs 커넥터',
    bookRef: '[5.1]',
    comparison: {
      left: {
        title: '커넥터 (외부 연결)',
        items: ['구글 드라이브·지메일 같은 외부 도구', '데이터를 가져오는 통로', '한 번 연결하면 끝', '예: "지메일에서 이번 주 메일 보여줘"'],
      },
      right: {
        title: '스킬 (반복 작업)',
        items: ['"~를 ~형식으로 만들어줘" 패턴', '자주 하는 작업의 자동화', '템플릿 + 로직 묶음', '예: "회의록 정리 스킬 실행"'],
      },
    },
    accent: 'indigo',
  },
  {
    id: '5-prebuilt', block: 5, layout: 'bullets',
    eyebrow: 'Block 5 · 기본 스킬',
    title: '바로 쓸 수 있는 스킬 4종',
    bookRef: '[바로 39~43]',
    bullets: [
      '이미지 생성 — 의뢰인 보고용 표지·아이콘',
      '워드 문서 만들기 — 자문 의견서·진정서·답변서 표준 양식',
      'PPT 발표 자료 — 슬라이드 마스터부터 자동',
      '프로젝트 보고서·수익성 분석 — 매월 정기 보고',
    ],
    callout: '스킬 마켓플레이스에 노무·법률 전용도 추가되는 중',
    accent: 'indigo',
  },
  {
    id: '5-practice-meeting', block: 5, layout: 'practice',
    eyebrow: '🎯 실습 1',
    title: '실습 1 · 회의록 자동 정리 스킬',
    bookRef: '[바로 활용] 회사 맞춤형 회의록 자동 정리 스킬',
    practice: {
      name: '회의록 자동 정리 스킬',
      goal: '의뢰인 미팅 녹취 → 자동 요약 · 후속 작업 추출 · 의뢰인 발송용 요약',
      steps: [
        '의뢰인 미팅 녹취 텍스트 (또는 메모) 준비',
        '"회의록 정리 스킬 만들기" → 사무소 양식 학습시킴',
        '"사실관계·쟁점·다음 액션·기한" 4섹션 자동 추출',
        '의뢰인 발송용 1장 요약 + 사무소 내부용 상세 회의록 동시 생성',
        '구글 드라이브·노션 자동 저장',
      ],
      output: '회의록 (사무소용) + 요약 (의뢰인 발송용) 2 파일',
      duration: '5분',
    },
    accent: 'indigo',
  },

  // ====== Block 6 — 코워크 (핵심!) ======
  {
    id: '6-cover', block: 6, layout: 'title',
    eyebrow: 'Block 6 · 40분 ⭐ 핵심',
    title: '코워크 — 진짜 자동화의 시작',
    subtitle: '한글 HWPX · 옵시디언 · 스마트폰 디스패치',
    body: '책 6장 — 노무사가 가장 많이 쓸 부분',
    accent: 'orange',
  },
  {
    id: '6-cowork-what', block: 6, layout: 'concept',
    eyebrow: 'Block 6 · 개념',
    title: '코워크가 뭔가?',
    bookRef: '[6.1]',
    concept: [
      { term: '파일 시스템', def: '내 컴퓨터의 폴더·파일 구조 — Claude가 직접 보고 만들 수 있게', example: '"~/노무사무소/2026/김○○ 자문/" 폴더 전체 권한' },
      { term: '코워크 (Cowork)', def: 'Claude가 다단계 작업을 실제로 실행하는 데스크톱 환경', example: 'PDF 5개 받아서 표 추출 → Excel → 보고서 → 메일 전송 한 흐름' },
    ],
    callout: '터미널 없이 데스크톱 앱에서 바로. Claude Code와 같은 엔진',
    accent: 'orange',
  },
  {
    id: '6-setup', block: 6, layout: 'flow',
    eyebrow: 'Block 6 · 시작',
    title: '코워크 시작 3단계',
    bookRef: '[바로 46]',
    flow: [
      { step: '1', title: '데스크톱 앱 실행', desc: 'Claude 데스크톱 앱 (Code 탭)' },
      { step: '2', title: '작업 폴더 선택', desc: '"노무사무소" 폴더 권한 부여' },
      { step: '3', title: '권한 확인', desc: '읽기·쓰기·실행 권한 단계별 OK' },
    ],
    callout: '권한은 폴더 단위 — 다른 폴더는 못 봄. 안전',
    accent: 'orange',
  },
  {
    id: '6-schedule', block: 6, layout: 'demo',
    eyebrow: 'Block 6 · 스케줄링',
    title: '매일 종합 업무 리포트',
    bookRef: '[바로 47]',
    demo: {
      tool: '코워크 + 스케줄링 (Routines)',
      prompt: '매일 오전 8시:\n(1) 어제 받은 메일 정리\n(2) 이번 주 마감 자문 진행 상황\n(3) 오늘 캘린더 일정\n(4) 미처리 의뢰인 답장 알림\n을 텔레그램으로 보내줘.',
      result: '매일 아침 휴대폰에 정리된 한 장 리포트\nPC 꺼져 있어도 Anthropic 인프라가 실행',
    },
    callout: 'Routines = PC 꺼져도 작동 / 데스크톱 예약 작업 = 로컬 파일 접근',
    accent: 'orange',
  },
  {
    id: '6-pdf', block: 6, layout: 'bullets',
    eyebrow: 'Block 6 · PDF 편집',
    title: 'PDF 작업 3가지 — 노무사 일상',
    bookRef: '[바로 48~50]',
    bullets: [
      'PDF 표 → Excel 추출 (의뢰인 급여 자료 PDF로 받았을 때)',
      '여러 PDF 한 파일로 합치기 (자문 자료 묶음)',
      'PDF에 내용 입력 (서명·날짜 자리 채우기)',
    ],
    callout: '인쇄 → 스캔 → 다시 입력하는 시간 절약',
    accent: 'orange',
  },
  {
    id: '6-hwpx-what', block: 6, layout: 'concept',
    eyebrow: 'Block 6 · HWPX ⭐',
    title: '한글 문서 편집 — 노무사 필수',
    bookRef: '[6.4]',
    concept: [
      { term: 'HWPX', def: '한글(HWP) 최신 표준 포맷 — XML 기반이라 AI가 다루기 좋음', example: '노동위 신청서·진정서·답변서·공문 다 HWPX' },
      { term: '한글 파일 변환 스킬', def: '마크다운/JSON 형식 데이터를 HWPX 양식에 자동으로 채워넣는 스킬', example: '의견서 초안 → 사무소 양식에 자동 배치' },
    ],
    callout: '관청 제출 문서는 95% 한글 — 이게 안 되면 AI 자동화는 반쪽',
    accent: 'orange',
  },
  {
    id: '6-hwpx-install', block: 6, layout: 'flow',
    eyebrow: 'Block 6 · HWPX 스킬 설치',
    title: '한글 변환 스킬 설치 30초',
    bookRef: '[바로 51]',
    flow: [
      { step: '1', title: '스킬 마켓플레이스', desc: '"한글 변환" 검색' },
      { step: '2', title: '설치', desc: '권한 검토 후 설치' },
      { step: '3', title: '템플릿 등록', desc: '사무소 양식 HWPX 미리 박아둠' },
    ],
    callout: '일단 박아두면 모든 의뢰인에게 일관된 양식',
    accent: 'orange',
  },
  {
    id: '6-practice-hwpx', block: 6, layout: 'practice',
    eyebrow: '🎯 실습 2',
    title: '실습 2 · HWPX 양식 자동 채우기',
    bookRef: '[바로 52~54]',
    practice: {
      name: '노동위 부당해고 구제신청서 자동 작성',
      goal: '의뢰인 사실관계 → HWPX 빈 양식에 자동 배치 → 사무소 표준 양식 그대로',
      steps: [
        '의뢰인 면담 메모 (사실관계·해고 통보일·근속·임금 등) 준비',
        'Claude에게 부당해고 구제신청서 양식(빈 HWPX) 첨부',
        '한글 변환 스킬 호출 → 사실관계·신청취지·신청이유 자동 작성',
        '근로기준법 제23조·제24조·제30조 자동 인용',
        '비슷한 판례 2~3건 자동 첨부 (Project에 있는 자료에서)',
        'HWPX 출력 → 한 번 검토 → 노동위 전산 접수',
      ],
      output: '완성된 부당해고 구제신청서 HWPX 1부 (1~2시간 → 10분)',
      duration: '10분 시연',
    },
    callout: '여러 의뢰인 동시 — 양식만 바꾸면 진정서·답변서·공문 다 응용',
    accent: 'orange',
  },
  {
    id: '6-hwpx-batch', block: 6, layout: 'bullets',
    eyebrow: 'Block 6 · HWPX 응용',
    title: '여러 한글 문서 서식 일괄 변경',
    bookRef: '[바로 54]',
    bullets: [
      '사무소 양식 통일 — 옛 의견서 100건을 새 로고로 일괄 변경',
      '연말 정기 갱신 자문 — 100개 회사 양식 한 번에',
      '폰트·로고·푸터 일괄 — 의뢰인 이름·날짜만 다르게',
      '코워크가 폴더 안 100건을 순차로 처리',
    ],
    callout: '사무소 신규 노무사 입사 → 양식 적응 시간 0',
    accent: 'orange',
  },
  {
    id: '6-practice-batch', block: 6, layout: 'practice',
    eyebrow: '🎯 실습 3',
    title: '실습 3 · 여러 한글 문서 서식 일괄 변경',
    bookRef: '[바로 54]',
    practice: {
      name: '사무소 양식 일괄 통일',
      goal: '옛 양식 100건의 자문 의견서를 새 사무소 로고·서식으로 한 번에',
      steps: [
        '대상 폴더 권한 부여 (~/노무사무소/2025/의견서/)',
        '"이 폴더 HWPX 100건의 로고·푸터를 새 디자인으로 일괄 변경"',
        '코워크가 폴더 안 순차로 처리 (1건당 2초)',
        '변경 결과 미리보기 → 일괄 적용 vs 건별 검토 선택',
        '변경 로그 자동 — 어떤 파일 어떻게 바뀌었는지 추적',
        '이름·날짜는 그대로, 서식만 통일',
      ],
      output: '100건 → 3분 (수동 100건 × 5분 = 8시간 → 3분)',
      duration: '5분 시연',
    },
    callout: '연말 정기 갱신 자문 + 사무소 양식 통일 한 번에',
    accent: 'orange',
  },
  {
    id: '6-obsidian', block: 6, layout: 'bullets',
    eyebrow: 'Block 6 · 옵시디언',
    title: '옵시디언 + 코워크 — 사무소 위키',
    bookRef: '[바로 55~56]',
    bullets: [
      '옵시디언 = 마크다운 기반 개인 위키 (무료)',
      '코워크로 매일 자료 자동 분류',
      '의뢰인별·사건별·법령별 자동 태그',
      '검색 한 번에 5년 전 자문 회상',
      '데모: yellowenvelope.kr이 옵시디언 vault 64,000건 기반 RAG',
    ],
    callout: '사무소 5년 노하우가 흩어진 폴더 → 통합 위키',
    accent: 'orange',
  },
  {
    id: '6-dispatch', block: 6, layout: 'flow',
    eyebrow: 'Block 6 · 디스패치',
    title: '스마트폰 ↔ 컴퓨터 어디서든',
    bookRef: '[바로 57~59]',
    flow: [
      { step: '1', title: 'Dispatch 연결', desc: '스마트폰 ↔ 데스크톱 페어링' },
      { step: '2', title: '어디서든 명령', desc: '의뢰인 미팅 중 폰에서 "○○ 자문 자료 찾아"' },
      { step: '3', title: '자동 작업', desc: '데스크톱이 자동으로 깨어나 폴더 찾고 다운로드' },
      { step: '4', title: '결과 전송', desc: '스마트폰으로 결과 전송 — 미팅 중 바로 확인' },
    ],
    callout: '의뢰인 미팅 중 사무실 컴퓨터 자료 즉시 가져오기',
    accent: 'orange',
  },

  // ====== Block 7 — 책임·Q&A ======
  {
    id: '7-cover', block: 7, layout: 'title',
    eyebrow: 'Block 7 · 20분',
    title: '책임 · 검증 · 기밀',
    subtitle: '노무사가 반드시 알아야 할 가드레일 + Q&A',
    body: 'AI는 도구. 책임은 노무사에게.',
    accent: 'rose',
  },
  {
    id: '7-hallu', block: 7, layout: 'bullets',
    eyebrow: 'Block 7 · 환각 검증',
    title: '⚠️ 법조항·판례 환각 — 가장 큰 위험',
    bullets: [
      '실제 사례: AI가 존재하지 않는 "근기법 제111조의5" 인용',
      '검증 절차: 법제처 OPEN API · 노동위 · 판례검색 사이트 이중 확인',
      '의뢰인 산출물 — 노무사 본인 검토 필수',
      'Opus + Thinking 켜도 100% 방지 안 됨',
    ],
    callout: '한 건의 잘못된 자문이 사무소 신뢰를 무너뜨린다',
    accent: 'rose',
  },
  {
    id: '7-privacy', block: 7, layout: 'comparison',
    eyebrow: 'Block 7 · 개인정보',
    title: '플랜별 학습 옵션 + 운영 룰',
    comparison: {
      left: {
        title: '❌ 위험',
        items: [
          '무료 — 학습 옵트인 기본',
          '의뢰인 자료 raw 업로드',
          '회사명·이름·주민·계좌 그대로',
          '동의 없이 사용',
        ],
      },
      right: {
        title: '✅ 안전',
        items: [
          'Pro+ → 학습 비활성 설정',
          '마스킹 후 업로드',
          'Project별 권한 분리',
          '의뢰인 동의서 필수',
          '코워크 폴더 권한 단계별 OK',
        ],
      },
    },
    accent: 'rose',
  },
  {
    id: '7-pricing', block: 7, layout: 'metrics',
    eyebrow: 'Block 7 · 도구·요금',
    title: '규모별 추천 조합',
    metrics: [
      { value: 'Pro', label: '1인 노무사', hint: '$20/월' },
      { value: 'Team', label: '소규모 3~5명', hint: '$25/인·월 · 공유 Projects' },
      { value: 'Enterprise', label: '중대형 10+', hint: '맞춤 보안·SLA' },
      { value: 'API', label: '자동화 운영', hint: '봇·사이트' },
    ],
    callout: 'Codex CLI는 별도 — 한 달 무료 한도 후 종량',
    accent: 'rose',
  },
  {
    id: '7-qa', block: 7, layout: 'bullets',
    eyebrow: 'Block 7 · Q&A',
    title: '핸즈온 Q&A',
    bullets: [
      '여러분의 케이스 즉석 시연 3~4명',
      '의뢰인 자료 준비해 오신 경우 직접 실습',
      '강의 후 카톡 채널에서 후속 질문',
    ],
    accent: 'rose',
  },
  {
    id: '7-closing', block: 7, layout: 'closing',
    eyebrow: '감사합니다',
    title: '내일부터 하나만 써보세요',
    body: '한 주만 지나면 자문 시간이 절반이 됩니다',
    bullets: [
      '공인노무사 서재홍 · 노무법인 위너스',
      'yellowenvelope.kr',
      '이 URL = 강의 자료 + 워크북 + 프롬프트 30개 + 실습 2개',
    ],
    accent: 'amber',
  },
];

// 워크북 6개 (실습 2개 포함)
export const WORKBOOK = [
  {
    id: 'wb1', icon: '📝', color: 'blue',
    title: '자문 의견서 30분 컷',
    steps: [
      '의뢰인 진술서·근로계약서·취업규칙을 Claude Project에 업로드',
      '"사실관계 표 + 쟁점 + 근거 법령" 프롬프트로 1차 정리',
      'Artifacts로 의견서 초안 생성 → 노무사 검토 + 수정',
      '같은 Project에서 PPT add-in으로 의뢰인 보고용 슬라이드',
      '한글 변환 스킬로 사무소 표준 HWPX 양식에 자동 배치',
    ],
    output: '의견서 HWPX + 보고 슬라이드 + 이메일 한 묶음',
  },
  {
    id: 'wb2', icon: '💰', color: 'emerald',
    title: '다중 사업장 급여대장 검수',
    steps: [
      'Excel + Claude 사이드패널 → 급여대장 분석 시작 (Ctrl+Alt+C)',
      '"통상임금·4대보험·최저임금 위반 찾기" 프롬프트',
      '셀별 코멘트 + 검토결과 열 자동',
      '위반 건만 필터 → 사업주 알림 시트',
      '매월 같은 흐름 반복 — 1시간 → 10분',
    ],
    output: '월 정기 검수 자동화 시트',
  },
  {
    id: 'wb3', icon: '📋', color: 'violet',
    title: '근로계약서 일괄 검토',
    steps: [
      '100건 PDF 업로드 (Claude Project 또는 Excel)',
      '4대 핵심 조항(임금·근로시간·휴일·해고사유) 누락 체크',
      '위반 리스크 점수화 (1~5점)',
      '우선순위 보고서 자동 생성',
      '사업주에게 한 장 요약 + 개선안',
    ],
    output: '계약서 검토 보고서 + 개선 권고안',
  },
  {
    id: 'wb4', icon: '🎤', color: 'indigo',
    title: '🎯 실습 1 · 회의록 자동 정리 스킬',
    steps: [
      '의뢰인 미팅 녹취 텍스트 (또는 메모) 준비',
      '"회의록 정리 스킬 만들기" → 사무소 양식 학습',
      '"사실관계·쟁점·다음 액션·기한" 4섹션 자동 추출',
      '의뢰인 발송용 1장 요약 + 사무소 내부용 상세 회의록 동시 생성',
      '구글 드라이브·노션 자동 저장',
    ],
    output: '회의록 + 의뢰인 요약 (2 파일, 5분)',
  },
  {
    id: 'wb5', icon: '📄', color: 'orange',
    title: '🎯 실습 2 · HWPX 양식 자동 채우기 (노동위 신청서)',
    steps: [
      '의뢰인 면담 메모 (사실관계·해고 통보일·근속·임금 등) 준비',
      'Claude에게 부당해고 구제신청서 빈 HWPX 양식 첨부',
      '한글 변환 스킬 호출 → 사실관계·신청취지·신청이유 자동',
      '근로기준법 제23조·제24조·제30조 자동 인용',
      '비슷한 판례 2~3건 Project에서 자동 첨부',
      'HWPX 출력 → 노무사 검토 → 노동위 전산 접수',
    ],
    output: '완성된 부당해고 구제신청서 HWPX (1~2시간 → 10분)',
  },
  {
    id: 'wb6', icon: '👥', color: 'cyan',
    title: '사무소 Cowork 표준 운영',
    steps: [
      'Claude Team 결제 ($25/인/월)',
      '"팀 공유 라이브러리"에 자주 쓰는 양식·체크리스트 업로드',
      '의뢰인별 Project에 권한 부여 (담당 노무사·실장)',
      '의뢰인 보고 직전 셰어 링크로 사전 검토',
      '활동 로그로 누가 언제 뭘 봤는지 추적',
    ],
    output: '사무소 단위 AI 표준 운영',
  },
];

export const PROMPTS = [
  // 자문 (1~7)
  { id: 'p1', tag: '자문', text: '아래 사실관계를 근거로 (1) 적용 법령 (2) 쟁점 (3) 결론 초안을 작성해줘. 결론에는 근거 조항·판례를 명시하고 불확실한 부분은 [검토필요]로 표시.\n\n[사실관계]' },
  { id: 'p2', tag: '자문', text: '이 사건을 노동위 부당해고 구제신청으로 진행할 때 사용자 측 예상 항변 3가지와 우리 측 반박 논리를 만들어줘.' },
  { id: 'p3', tag: '자문', text: '징계 사유서를 보고 양정 적정성 5단계 체크 (사실관계·중대성·고의·과거·평등) 표로 만들어줘.' },
  { id: 'p4', tag: '자문', text: '직장 내 괴롭힘 신고서를 보고 근기법 제76조의2 해당 여부 + 1차 권고 조치 3가지를 만들어줘.' },
  { id: 'p5', tag: '자문', text: '이 사건 의뢰인이 가장 묻고 싶을 5가지 질문을 예측하고 각 답변 초안을 만들어줘.' },
  { id: 'p6', tag: '자문', text: '의뢰인 진술서를 정리한 사실관계 표(시간순) + 쟁점 매트릭스를 만들어줘.' },
  { id: 'p7', tag: '자문', text: '이 사건이 노동위/형사/민사 어느 경로로 가야 의뢰인 이익이 가장 큰지 의사결정 표로 만들어줘.' },
  // 계약·규칙 (8~14)
  { id: 'p8', tag: '계약/규칙', text: '근로계약서를 읽고 (1) 누락 필수 조항 (2) 위법 조항 (3) 권고 추가 조항을 표로 정리해줘.' },
  { id: 'p9', tag: '계약/규칙', text: '취업규칙에서 (1) 최근 법령 미반영 (2) 회사 불리 조항 (3) 분쟁 자주 일어나는 조항 3개를 우선순위로 골라줘.' },
  { id: 'p10', tag: '계약/규칙', text: '이 회사 업종·규모에 맞는 표준 취업규칙 목차(40개 조항)를 만들어줘.' },
  { id: 'p11', tag: '계약/규칙', text: '근로계약서를 일용/단시간/기간제/무기계약 4유형별로 핵심 차이만 한 줄씩 정리해줘.' },
  { id: 'p12', tag: '계약/규칙', text: '취업규칙 개정 시 근로자대표 동의 절차 체크리스트를 만들어줘.' },
  { id: 'p13', tag: '계약/규칙', text: '연봉계약서에 포괄임금 약정이 들어있는데 무효 위험 진단 + 대체안.' },
  { id: 'p14', tag: '계약/규칙', text: '근로조건 자문 미팅 시 의뢰인에게 처음 물어볼 12가지 질문 리스트.' },
  // 급여·4대보험 (15~20)
  { id: 'p15', tag: '급여/4대보험', text: '이 급여대장에서 통상임금 산정 오류 가능성 높은 항목을 찾아 사유와 함께 정리해줘.' },
  { id: 'p16', tag: '급여/4대보험', text: '이 시트의 4대보험 산정 오류(단가·산정 기간·상한)를 셀별로 지적해줘.' },
  { id: 'p17', tag: '급여/4대보험', text: '최저임금 미달자 자동 추출 — 통상시급 산정 → 최저임금 비교 → 사유 분석.' },
  { id: 'p18', tag: '급여/4대보험', text: '연차수당·미사용 연차 정산 계산을 셀별로 자동 작성해줘 (입사일 + 회계연도 기준).' },
  { id: 'p19', tag: '급여/4대보험', text: '퇴직금 계산 — 평균임금 산정 기간·산입 항목 점검 + 최종 산정 표.' },
  { id: 'p20', tag: '급여/4대보험', text: '60시간 미만 단시간·재학생 등 4대보험 제외 대상 자동 분류 시트.' },
  // 인사 (21~25)
  { id: 'p21', tag: '인사', text: '권고사직 면담 시나리오(인사담당자 vs 근로자) 대본 — 위법 발언 회피 가이드 포함.' },
  { id: 'p22', tag: '인사', text: '신규 입사자 온보딩 체크리스트 — 4대보험·근로계약·취업규칙 동의·교육 의무.' },
  { id: 'p23', tag: '인사', text: '직장 내 괴롭힘 사건 조사 보고서 표준 양식 (사실관계·진술·증거·판단·조치).' },
  { id: 'p24', tag: '인사', text: '경영상 해고(정리해고) 4요건 진단 — 우리 회사 사례에 적용.' },
  { id: 'p25', tag: '인사', text: '평가·승진 결과 통보문 — 법적 안전성 검토(차별·불이익 처우 위험 점검).' },
  // 자동화·HWPX (26~30)
  { id: 'p26', tag: '자동화·HWPX', text: '한글 변환 스킬: 첨부한 HWPX 양식에 의뢰인 사실관계를 자동 배치해줘. 신청취지·신청이유는 근로기준법 제23조·제24조 기준으로.' },
  { id: 'p27', tag: '자동화·HWPX', text: '폴더 안 100건의 HWPX 자문 의견서에서 사무소 로고·푸터를 새 로고로 일괄 변경.' },
  { id: 'p28', tag: '자동화', text: 'Codex에게: 폴더 안 모든 docx 근로계약서에서 [성명·생년월일·계약기간·임금]을 뽑아 csv로.' },
  { id: 'p29', tag: '자동화', text: '의뢰인별 이번 주 진행 사항 자동 작성 — 캘린더·메일·문서 폴더 스캔 후 한 줄 요약. (매주 월요일 아침 스케줄)' },
  { id: 'p30', tag: '자동화', text: '회의록 정리 스킬: 첨부 녹취록 → 사실관계·쟁점·다음 액션·기한 4섹션 + 의뢰인 발송용 1장 요약.' },
];
