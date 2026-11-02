// 건강보험 자격 취득·상실 신고서 작성 화면의 문장. 시험이 allCopy() 전부를 금지어로 훑는다.
// 이 도구는 사업주가 직접 쓰고 직접 내는 서식을 채워 줄 뿐이다 — 위임·제출을 맡는 말은 쓰지 않는다(행정사법 §2·§3).
import { ACQ_LATE_ATTACH_NOTE } from '@/lib/nhis-forms/build';

export const KIND_LABEL = { loss: '자격상실(퇴사)', acq: '자격취득(입사)' } as const;

export const STEP = {
  branch: '1. 받을 지사 찾기',
  biz: '2. 사업장',
  people: '3. 대상자 (한 장에 4명까지)',
  reason: '4. 늦어진 이유',
  stamp: '5. 사업장 도장 (선택)',
};

export const FIELD = {
  addr: '사업장 주소',
  mgmtNo: '사업장관리번호',
  bizName: '사업장 명칭',
  owner: '대표자 성명',
  tel: '전화번호',
  fax: '팩스번호',
  zip: '우편번호',
  name: '성명',
  rrn: '주민등록번호',
  lastWorkDay: '마지막 근무일',
  acqDate: '자격취득일(입사일)',
  nhisLossCode: '건강보험 상실부호',
  nhisAcqCode: '건강보험 취득부호',
  payCur: '올해 보수 총액(원)',
  monthsCur: '올해 근무개월수',
  payPrev: '전년도 보수 총액(원)',
  monthsPrev: '전년도 근무개월수',
  monthlyPay: '월 보수액(원)',
  reason: '늦어진 이유',
  stamp: '도장 그림(PNG, 투명 배경)',
};

export const LOSS_CODES = [
  { v: '01', label: '01 퇴직' },
  { v: '02', label: '02 사망' },
  { v: '16', label: '16 취득취소' },
];
export const ACQ_CODES = [
  { v: '00', label: '00 최초취득' },
  { v: '13', label: '13 기타' },
];

export const LEAD =
  '공식 서식(국민건강보험법 시행규칙 별지 제6호·제8호)에 입력한 값을 채우고, 늦어진 이유를 적은 사업주확인서를 붙여 PDF 한 파일로 내려받습니다. 제출은 사업주가 EDI·팩스·방문으로 직접 합니다.';

export const PRIVACY =
  '주민등록번호를 포함한 입력값은 이 브라우저 안에서만 PDF 로 만들어지고 서버로 보내지 않습니다. 지사를 찾을 때는 사업장 주소만 보냅니다.';

export const LOSS_DATE_LINE = (d: string) => `상실일 ${d} (마지막 근무일 다음 날)`;

export const BRANCH_LINE = {
  none: '주소로 건강보험 지사를 찾지 못했습니다. 지사 이름을 직접 적어 주세요.',
  candidates: '주소만으로는 지사가 한 곳으로 좁혀지지 않습니다. 고지서에 적힌 관리지사를 고르세요.',
  manual: '받을 지사(직접 입력)',
  notice: '고지서나 EDI 에 적힌 관리지사가 따로 있으면 그 지사로 내세요.',
};

export const ACQ_NOTE = ACQ_LATE_ATTACH_NOTE;

export const ATTACH_SIZE = (kb: number) => `PDF ${kb}KB — 건강보험 EDI 첨부 한도(1MB) 안입니다.`;

export const BUTTON = { find: '지사 찾기', add: '사람 더하기', remove: '빼기', make: 'PDF 만들기', making: '만드는 중' };

export const CHECK_BEFORE =
  '내려받은 PDF 를 열어 칸이 맞게 들어갔는지 확인한 뒤 내세요. 사업장관리번호·보수 총액은 공단 고지 자료와 같아야 합니다.';

export function failLine(msg: string): string {
  return `PDF 를 만들지 못했습니다: ${msg}`;
}

export function allCopy(): string[] {
  return [
    ...Object.values(KIND_LABEL), ...Object.values(STEP), ...Object.values(FIELD),
    ...LOSS_CODES.map(c => c.label), ...ACQ_CODES.map(c => c.label), LEAD, PRIVACY, LOSS_DATE_LINE('2026.06.01'),
    ...Object.values(BRANCH_LINE), ACQ_NOTE, ATTACH_SIZE(520), ...Object.values(BUTTON), CHECK_BEFORE, failLine('x'),
  ];
}
