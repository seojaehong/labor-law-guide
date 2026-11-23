// 양정 판결 골라 내려받기 화면 문구 — 공개 금지어(src/lib/tool-kit/banned.ts)를 쓰지 않는다(시험이 검사한다).
export const TITLE = '양정 판결 골라 내려받기';
export const LEAD =
  '법원이 징계 수위를 판단한 문단을 의견서 [관련 판결] 블록 모양으로 모아 두었습니다. 필요한 판결을 골라 한글(hwpx)·md·jsonl로 내려받거나 AI 대화창에 붙일 묶음으로 복사합니다. 블록 본문은 판결 원문이며 글자를 바꾸지 않았습니다.';
export const KEY = {
  head: '이용 열쇠',
  help: '이 화면은 지금 열쇠를 받은 사람만 씁니다. 열쇠는 이 브라우저에만 남고, 판결을 불러올 때만 함께 보냅니다.',
  save: '열쇠 넣기',
  clear: '열쇠 지우기',
  wrong: '열쇠가 맞지 않습니다. 다시 넣어 주세요.',
};
export const STEP = { find: '1. 판결 찾기', pick: '2. 고른 판결', out: '3. 내려받기' };
export const SANCTION_LABEL = { all: '전부', ok: '적정', heavy: '과중' } as const;
export const LONG_TOGGLE = '긴 판단(원문 전체)도 보기';
export const LONG_BADGE = '긴 판단 · 원문 전체';
export const KEYWORD = '낱말(예: 팀장, 폭언, 해고)';
export const SEARCH = '찾기';
export const MORE = '더 불러오기';
export const EMPTY = '조건에 맞는 판결이 없습니다. 이 유형을 아직 싣지 않았을 수도 있습니다.';
export const LOAD_FAIL = '판결을 불러오지 못했습니다. 잠시 뒤 다시 찾아 주세요.';
export const PICK_EMPTY = '아직 고른 판결이 없습니다. 위 목록에서 체크하면 고른 순서대로 여기에 쌓입니다. 이 순서가 문서 안 순서입니다.';
export const FORMATS = [
  { id: 'hwpx', label: '한글(hwpx)', help: '의견서·보고서에 바로 붙이는 [관련 판결] 블록 서식' },
  { id: 'md', label: 'md', help: '메모·노션·사내 위키' },
  { id: 'jsonl', label: 'jsonl', help: '사내 시스템·자기 AI 자료로 넣기(한 줄 = 판결 하나)' },
  { id: 'ai', label: 'AI 붙여넣기', help: '원문을 바꾸지 말라는 안내를 붙여 클립보드로 복사' },
] as const;
export const FONT_HEAD = '글꼴';
export const FONT_NOTE = '정본 서식은 휴먼고딕 11pt·줄간격 180%·머리줄 굵게입니다. 다른 글꼴을 골라도 크기와 줄간격은 같습니다. 휴먼 글꼴은 한컴오피스가 깔린 PC에서 보이고, 없으면 한글이 비슷한 글꼴로 바꿔 보여 줍니다.';
export const BUTTON = { download: '내려받기', copy: '복사하기', making: '만드는 중…', up: '위로', down: '아래로', remove: '빼기', clearAll: '모두 빼기' };
export const DONE = { file: '파일을 내려받았습니다.', copy: 'AI 붙여넣기 묶음을 복사했습니다.', copyFail: '복사가 막혀 있어 파일로 내려받았습니다.' };
export const FAIL = '파일을 만들지 못했습니다. 다시 눌러 주세요.';
