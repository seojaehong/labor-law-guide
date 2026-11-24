// 퇴고 소개·체험 화면의 글. 예시는 전부 합성 글이다(실제 고객·사건 글을 넣지 않는다).
// tests/unit/toego-copy.test.ts 가 금지어(banned.ts)·보증 표현·화면 문장의 공개 규범 A 걸림을 막는다.
// 검사 종류를 늘릴 때(엔진에 새 검사가 들어온 뒤)는 CHECK_LABELS·WHAT_WE_CATCH 에 한 줄씩, 화면 계산은 src/lib/toego/highlight.ts 의 CHECKS 에 한 줄.

export const META = {
  title: '퇴고 | 업무 문서 문체·띄어쓰기·문장 부호 점검 | 일의 무늬',
  ogTitle: '퇴고 — 업무 문서 문체·맞춤법 점검 | 일의 무늬',
  description:
    '의견서·보고서·강의안·공문을 붙여 넣으면 AI 문체 상투어, 띄어쓰기, 문장 부호, 연결어미 뒤 쉼표를 줄과 칸 단위로 찾아 원문에 표시합니다. 점검은 브라우저 안에서만 돌고 글은 서버로 보내지 않습니다.',
  keywords: ['퇴고', '윤문', '맞춤법 점검', '띄어쓰기 점검', '문장 부호', 'AI 문체', '보고서 교정', 'k-labor', 'MCP'],
};

export const HERO = {
  title: '퇴고',
  lead: '업무 문서를 붙여 넣으면 상투어와 띄어쓰기·문장 부호·쉼표를 줄마다 찾아 원문에 표시합니다.',
  note: '글은 이 브라우저 안에서만 점검하고 서버로 보내지 않습니다.',
  back: '← 계산·점검 도구',
};

export const CATCH = {
  heading: '무엇을 찾나',
  lead: '누가 썼는지 가리는 도구가 아닙니다. 아래 규칙에 걸린 표현만 찾습니다. 고칠지는 글쓴이가 정합니다.',
  sourceLabel: '규칙 출처',
};

export type ToegoGenre = 'legal' | 'consulting' | 'lecture' | 'general' | 'official';

export const GENRE_OPTIONS: { value: ToegoGenre; label: string; hint: string }[] = [
  { value: 'legal', label: '법률', hint: '의견서·답변서·조사보고서' },
  { value: 'consulting', label: '컨설팅', hint: '컨설팅 보고서·기획안' },
  { value: 'lecture', label: '강의안', hint: '교육 자료·발표 원고' },
  { value: 'general', label: '일반', hint: '그 밖의 업무 문서' },
  { value: 'official', label: '공문', hint: '기관에 보내는 공문·안내문' },
];

export const EXAMPLES: { label: string; genre: ToegoGenre; text: string }[] = [
  {
    label: '의견서',
    genre: 'legal',
    text: [
      '가상 회사의 징계 처분은 절차상 하자가 있다고 볼수 밖에 없으며, 재심 절차를 다시 밟아야 한다.',
      '이는 정보에 입각한 판단을 위해 회사가 진술 기회를 충분히 주어야 함을 의미한다.',
      '회사가 제출한 자료는 강력한 증거로 기능하기 어렵다 .',
    ].join('\n'),
  },
  {
    label: '보고서',
    genre: 'consulting',
    text: [
      '이번 조사는 현장의 숨결을 들여다보고, 부서 사이의 틈을 메우는 단단한 토대를 마련하는 자리였다.',
      '담당 부서는 개선안을 검토할수 있는 것으로 보이며, 세부 일정은 다음 회의에서 정한다 .',
      '구성원의 공감을 도모하고 성공을 달성하는 것이 목표다.',
    ].join('\n'),
  },
  {
    label: '강의안',
    genre: 'lecture',
    text: [
      '오늘은 일터의 풍경을 천천히 들여다보는 배움 여정입니다.',
      '그야말로 제도와 현장이 맞물리는 지점을 짚어 보겠습니다...',
      '근로시간 , 휴게 , 휴일을 차례로 봅니다.',
    ].join('\n'),
  },
  {
    label: '공문',
    genre: 'official',
    text: [
      '1. 관련 근거 : 근로기준법 제 17조 및 가상 회사 취업규칙 ( 2026. 3. 1. 시행 )',
      '2. 대상 부서는 인사팀및 총무팀이며, 회신 기한은 12월 5일입니다.',
      '3. 궁극적으로 서식 정비를 마치고자 하오니 협조 바랍니다.',
    ].join('\n'),
  },
];

export const CHECK_LABELS = {
  prose: '문체',
  spacing: '띄어쓰기',
  punct: '문장 부호',
  comma: '쉼표',
} as const;

export const GRADE_LABELS = { A: '반드시 교정', B: '문맥 확인' } as const;

export const TRIAL = {
  heading: '바로 점검해 보기',
  genreLabel: '문서 종류',
  textLabel: '점검할 글',
  placeholder: '점검할 글을 붙여 넣어 주세요. 예시 버튼을 누르면 합성 예문이 들어갑니다.',
  examplesLabel: '합성 예문 넣기',
  run: '점검하기',
  clear: '지우기',
  running: '점검 중입니다.',
  limit: '40만 자까지 점검합니다.',
  empty: '점검할 글을 넣어 주세요.',
  tooLong: '글을 나눠서 다시 점검해 주세요.',
  rrnLines: '해당 줄',
  failed: '점검을 끝내지 못했습니다. 글을 조금 줄여 다시 점검해 주세요.',
  none: '걸린 곳이 없습니다. 이 점검이 보는 규칙 안에서는 고칠 곳을 찾지 못했다는 뜻입니다.',
  resultHeading: '점검 결과',
  originalHeading: '원문에 표시',
  listHeading: '걸린 곳',
  truncated: '걸린 곳이 많아 검사마다 500곳까지만 보여 줍니다(반드시 교정 먼저).',
  gradeNote: '반드시 교정은 고쳐 쓰라는 표시입니다. 띄어쓰기·문장 부호는 맞춤법 규정이, 쉼표는 업무 문서 관행이 근거입니다. 문맥 확인은 문맥에 따라 그대로 둘 수도 있는 표현입니다.',
  fixLabel: '고칠 방향',
  basisLabel: '근거',
  caption: '점검 결과는 규칙에 걸린 곳만 보여 줍니다. 글의 내용이 맞는지는 보지 않습니다.',
};

/** 무엇을 잡나 — 검사마다 한 장. 출처는 규칙이 나온 곳 */
export const WHAT_WE_CATCH: { key: keyof typeof CHECK_LABELS; title: string; body: string; source: string }[] = [
  {
    key: 'prose',
    title: '문체 상투어',
    body: '「정보에 입각한 판단」「단단한 토대」처럼 번역투와 비유가 섞인 상투어를 공개 사전에서 찾습니다. 문맥에 따라 그대로 둘 수도 있어 모두 「문맥 확인」으로 표시하고 고칠 방향을 함께 적습니다.',
    source: 'im-not-ai 사전 v1.3 전 115항목(MIT 라이선스). 일부 항목은 법률·컨설팅·강의안에서만 봅니다.',
  },
  {
    key: 'spacing',
    title: '띄어쓰기',
    body: '「및」, 「수밖에」, 「제1조」의 「제-」, 의존 명사 「수·것」, 열거 뒤 「등」, 수의 만 단위를 봅니다. 규정이 둘 다 허용하는 표기(단위 명사·보조 용언 등)는 보지 않습니다.',
    source: '한글 맞춤법(문화체육관광부 고시 제2017-12호) 제5장 제41~45항',
  },
  {
    key: 'punct',
    title: '문장 부호',
    body: '쉼표·마침표·쌍점·괄호·따옴표 앞뒤 띄어쓰기, 줄임표, 일본식 모점, 가운뎃점과 쉼표를 섞어 쓴 열거를 봅니다.',
    source: '한글 맞춤법 부록 「문장 부호」',
  },
  {
    key: 'comma',
    title: '연결어미 뒤 쉼표',
    body: '「~하였고,」「~경우,」처럼 연결어미 뒤에 찍은 쉼표를 찾습니다. 「경고, 견책」처럼 「고」로 끝나는 명사는 뺍니다.',
    source: '맞춤법 규정이 아니라 업무 문서에서 굳어진 관행입니다. 필요한 쉼표인지는 글쓴이가 정합니다.',
  },
];

export const BEFORE_AFTER = {
  heading: '고치기 전과 후(합성 예문)',
  genre: 'consulting' as ToegoGenre,
  before: [
    '이번 조사는 현장의 숨결을 확인하였고, 부서 사이의 틈을 메우는 자리였다.',
    '담당 부서는 개선안을 검토할수 있다 .',
  ].join('\n'),
  after: [
    '이번 조사에서 현장 의견을 듣고 부서 간 업무 분담을 정리했다.',
    '담당 부서는 개선안을 검토할 수 있다.',
  ].join('\n'),
  changes: [
    '「현장의 숨결」「사이의 틈을 메우는」 — 비유를 빼고 한 일을 그대로 적었습니다.',
    '「확인하였고,」 — 연결어미 뒤 쉼표를 뺐습니다.',
    '「검토할수」 — 의존 명사 「수」를 띄었습니다.',
    '「있다 .」 — 마침표 앞 빈칸을 지웠습니다.',
  ],
  beforeLabel: '고치기 전',
  afterLabel: '고친 뒤',
  afterNote: '고친 글은 이 점검에서 걸린 곳이 없습니다.',
  changesLabel: '바꾼 곳',
};

export const MCP = {
  heading: '내 AI 도구에 연결해 쓰기',
  lead: '같은 점검을 Claude Code 같은 AI 도구에서 부를 수 있습니다. 일의 무늬가 공개한 MCP 서버 k-labor 의 문서 묶음(docs)에 들어 있습니다.',
  command: 'claude mcp add --scope user k-labor -- npx -y k-labor mcp --groups docs',
  tools: [
    { name: 'check_prose', body: '문체 상투어 점검. 이 화면과 같은 공개 사전을 씁니다. 내가 만든 규칙 묶음(JSON)을 더 얹을 수도 있습니다.' },
    { name: 'check_norms', body: '띄어쓰기·문장 부호·연결어미 뒤 쉼표 점검.' },
  ],
  note: '두 도구는 npm 에 올라간 k-labor 0.2.2 에는 아직 들어 있지 않습니다. 다음 판이 올라가면 위 명령 그대로 연결됩니다.',
  privacy: '연결해 쓰면 점검은 내 PC 에서 돕니다. 다만 AI 도구에 붙여 넣은 글은 그 서비스의 약관대로 처리됩니다.',
  more: 'AI 도구 연결 전체 안내',
  toolsLabel: '들어 있는 도구',
};

export const PRIVACY = {
  heading: '글은 어디로도 가지 않습니다',
  items: [
    '점검은 이 브라우저 안에서 돕니다. 점검하기를 눌러도 글을 서버로 보내지 않습니다.',
    '글을 저장하지 않습니다. 창을 닫으면 사라집니다.',
    '방문 통계에도 글을 싣지 않습니다. 주소창에도 글이 붙지 않습니다.',
    '주민등록번호 모양의 숫자가 보이면 점검하지 않고 멈춥니다. 가린 뒤 다시 점검해 주세요.',
  ],
};
