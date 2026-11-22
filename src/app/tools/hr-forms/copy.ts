// 모성보호 서식 작성 화면의 문장. 시험이 allCopy() 전부와 서식 목록의 글을 금지어로 훑는다.
// 이 도구는 근로자·사업주가 직접 쓰는 서식을 채워 줄 뿐이다 — 결론을 내리거나 맡아 처리한다는 말은 쓰지 않는다.
export const LEAD =
  '법정 서식인 출산전후휴가(배우자 출산전후휴가)ㆍ육아휴직 통합 신청서, 육아휴직·단기 육아휴직·배우자 출산전후휴가·난임치료휴가 신청서와 사업주의 육아휴직 허용·단기 육아휴직 시기변경 통지서를 칸에 맞춰 채우고 한글(hwpx) 파일로 내려받습니다. 입력값은 브라우저 안에서만 쓰입니다.';

export const STEP = { pick: '1. 서식 고르기', fill: '2. 칸 채우기', check: '3. 확인하고 내려받기' };
export const WRITER = { employee: '근로자가 사업주에게 내는 서식', employer: '사업주가 근로자에게 주는 서식' } as const;
export const REQUIRED_MARK = '(필수)';
export const BUTTON = { make: '한글 파일 내려받기', making: '만드는 중…', reset: '칸 비우기' };
export const PROBLEMS_HEAD = '파일을 만들기 전에 고칠 칸';
export const NOTES_HEAD = '근거 조문과 대조한 안내';
export const NOTES_FOOT = '안내는 입력한 날짜를 조문의 기한·기간과 견준 것입니다. 회사 취업규칙이 더 유리하게 정했으면 그쪽을 따릅니다.';
export const PRIVACY = '주민등록번호는 받지 않습니다. 입력값은 서버로 보내지 않고 이 브라우저 안에서 파일로 만듭니다.';
export const DONE = '내려받았습니다. 한글에서 열어 칸을 확인한 뒤 서명하세요.';
export const FAIL = '파일을 만들지 못했습니다. 잠시 뒤 다시 눌러 주세요.';
export const AI_LINE = 'Claude 등 AI 에서 쓰려면 k-labor 의 forms 묶음(list_hr_forms · check_hr_form · make_hr_form)을 켭니다.';

export function allCopy(): string[] {
  return [LEAD, ...Object.values(STEP), ...Object.values(WRITER), REQUIRED_MARK, ...Object.values(BUTTON), PROBLEMS_HEAD, NOTES_HEAD, NOTES_FOOT, PRIVACY, DONE, FAIL, AI_LINE];
}
