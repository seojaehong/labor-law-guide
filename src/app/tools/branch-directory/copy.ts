// 관할 지사 찾기 화면의 문장. 시험이 allCopy() 전부를 금지어로 훑는다.
// 표 안의 부서·담당업무·번호는 각 공단 홈페이지 원문이라 여기서 만들지 않는다.

export const AGENCY_LABEL: Record<'comwel' | 'nhis' | 'nps', string> = {
  comwel: '근로복지공단 (고용·산재보험)',
  nhis: '국민건강보험공단 (건강보험)',
  nps: '국민연금공단 (국민연금)',
};

/** 결과 맨 위 — 번호 목록보다 먼저 보인다 (SPEC 필수 문구) */
export function noticeLines(dates: Record<'comwel' | 'nhis' | 'nps', string>): string[] {
  return [
    '안내된 지사는 사업장 주소로 찾은 것입니다. 공단이 주소와 다른 지사를 관리지사로 정해 둔 사업장도 있으니, 보험료 고지서나 EDI 에 적힌 관리지사를 먼저 확인하세요.',
    `전화번호는 각 공단 홈페이지 공개값입니다(수집일 근로복지공단 ${dates.comwel} · 건강보험 ${dates.nhis} · 국민연금 ${dates.nps}). 인사이동으로 바뀔 수 있습니다.`,
  ];
}

export const STATUS_LINE = {
  confirmed: '주소로 찾은 지사',
  candidates: (n: number) => `주소만으로는 한 곳으로 좁혀지지 않습니다 — 후보 ${n}곳. 고지서의 관리지사와 같은 곳을 쓰세요.`,
  none: '이 주소로 관할 지사를 찾지 못했습니다. 시·군·구까지 적었는지 확인해 주세요.',
};

export const HIT_LABEL = '이 주소의 동·읍·면이 적힌 담당';

export const FILTERS = [
  { id: 'all', label: '전체', re: null },
  { id: 'member', label: '취득·상실(자격)', re: /자격|취득|상실|피보험자|가입지원|가입자|적용|사업장가입/ },
  { id: 'premium', label: '보험료(부과·징수)', re: /부과|징수|고지|보험료|수납|체납/ },
  { id: 'daily', label: '일용·근로내용확인', re: /일용|근로내용/ },
] as const;

export const INPUT_LABEL = { biz: '사업자등록번호', addr: '사업장 주소' };
export const PLACEHOLDER = { biz: '123-45-67890', addr: '예: 충북 청주시 상당구 상당로81번길 63 (서문동)' };
export const ADDR_TIP = '도로명 주소 뒤 괄호의 동 이름까지 넣으면 지사 안 담당자까지 좁혀집니다.';
export const PRIVACY = '입력한 번호와 주소는 저장하지 않습니다.';

export function failLine(reason: string): string {
  switch (reason) {
    case 'invalid': return '사업자등록번호 10자리를 확인해 주세요. 끝자리 검증 숫자가 맞지 않습니다.';
    case 'none': return '이 번호로 고용·산재보험에 성립된 사업장이 없습니다. 주소로 찾아 주세요.';
    case 'limit': return '오늘 조회 횟수를 넘었습니다. 주소로 찾아 주세요.';
    default: return '지금 공단 사업장 조회가 되지 않습니다. 주소로 찾아 주세요.';
  }
}

export const MO_LABEL = 'MO(문자 접수) 번호';
export const SOURCE_LABEL = '공단 홈페이지에서 보기';
export const SHOW_ALL = (n: number) => `담당 ${n}개 모두 보기`;

export function allCopy(): string[] {
  return [
    ...Object.values(AGENCY_LABEL), ...noticeLines({ comwel: '2026-11-02', nhis: '2026-11-02', nps: '2026-11-02' }),
    STATUS_LINE.confirmed, STATUS_LINE.candidates(2), STATUS_LINE.none, HIT_LABEL, ...FILTERS.map(f => f.label),
    ...Object.values(INPUT_LABEL), ...Object.values(PLACEHOLDER), ADDR_TIP, PRIVACY,
    ...['invalid', 'none', 'limit', 'upstream'].map(failLine), MO_LABEL, SOURCE_LABEL, SHOW_ALL(70),
  ];
}
