// 건강보험 자격 취득·상실 신고서 작성 화면의 문장. 시험이 allCopy() 전부를 금지어로 훑는다.
// 이 도구는 사업주가 직접 쓰고 직접 내는 서식을 채워 줄 뿐이다 — 위임·제출을 맡는 말은 쓰지 않는다(행정사법 §2·§3).
import { EDI_LIMIT_BYTES } from '@/lib/nhis-forms/dates';

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
  bizNo: '사업자등록번호',
  mgmtNo: '사업장관리번호',
  bizName: '사업장 명칭',
  owner: '대표자 성명',
  tel: '전화번호',
  fax: '팩스번호',
  zip: '우편번호',
  name: '성명',
  rrn: '주민등록번호',
  lastWorkDay: '마지막 근무일(사망이면 사망일)',
  acqDate: '자격취득일(입사일)',
  nhisLossCode: '건강보험 상실부호',
  nhisAcqCode: '건강보험 취득부호',
  payCur: '해당 연도(퇴직한 해) 보수 총액(원)',
  monthsCur: '해당 연도 근무개월수',
  payPrev: '전년도 보수 총액(원, 연말정산을 안 했을 때만)',
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
// 별지 제6호서식(개정 2025. 12. 1.) 작성방법의 건강보험 자격취득부호 전부. 종전 자격에 따라 다르므로 미리 고르지 않는다(261125).
export const ACQ_CODES = [
  { v: '00', label: '00 최초취득' },
  { v: '04', label: '04 의료급여 수급권자등에서 제외' },
  { v: '05', label: '05 직장가입자 변경' },
  { v: '06', label: '06 직장피부양자 상실' },
  { v: '07', label: '07 지역가입자에서 변경' },
  { v: '10', label: '10 국가유공자 등 건강보험 적용 신청' },
  { v: '13', label: '13 기타' },
  { v: '14', label: '14 거주불명 등록 후 재등록' },
  { v: '29', label: '29 직장가입자 이중가입' },
  { v: '30', label: '30 상실취소' },
];
export const CODE_PICK = '골라 주세요';

export const LEAD =
  '기한을 넘긴 건강보험 자격 취득·상실 신고에 쓰는 도구입니다. 공식 서식(국민건강보험법 시행규칙 별지 제6호·제8호)의 건강보험 칸만 채우고(국민연금·고용보험·산재보험 칸은 비워 둡니다), 늦어진 이유를 적은 사업주확인서를 붙여 PDF 한 파일로 내려받습니다. 제출은 사업주가 EDI·팩스·방문으로 직접 합니다.';

export const PRIVACY =
  '주민등록번호를 포함한 입력값은 이 브라우저 안에서만 PDF 로 만들어지고 서버로 보내지 않습니다. 지사를 찾을 때는 사업장 주소나 사업자등록번호만 보냅니다.';

export const LOSS_DATE_LINE = (d: string) => `상실일 ${d} (마지막 근무일 다음 날)`;
export const LOSS_DAY_NOTE =
  '마지막 근무일은 근로관계가 이어진 마지막 날입니다. 마지막 출근 뒤 연차·휴무가 이어졌다면 그 마지막 날을 넣습니다. 사망이면 사망한 날을 넣습니다.';

export const BRANCH_LINE = {
  none: '주소로 건강보험 지사를 찾지 못했습니다. 지사 이름을 직접 적어 주세요.',
  candidates: '주소만으로는 지사가 한 곳으로 좁혀지지 않습니다. 고지서에 적힌 관리지사를 고르세요.',
  manual: '받을 지사(직접 입력)',
  notice: '고지서나 EDI 에 적힌 관리지사가 따로 있으면 그 지사로 내세요.',
};

export const BRANCH_ERROR = {
  limit: '지사 찾기를 잠시 너무 많이 했습니다. 1분 뒤 다시 누르거나 지사 이름을 직접 적어 주세요.',
  failed: '지사를 찾는 중 오류가 났습니다. 다시 누르거나 지사 이름을 직접 적어 주세요.',
  bizNone: '이 사업자등록번호로 공개된 사업장을 찾지 못했습니다. 주소를 직접 적어 주세요.',
  bizInvalid: '사업자등록번호 10자리를 확인해 주세요.',
};

export const ACQ_NOTE =
  '6개월 이상 늦은 취득 신고는 입사 시점을 확인할 수 있는 서류(근로계약서, 임금대장, 임금명세서, 급여이체내역 등) 1부를 함께 내야 합니다.';

const EDI_LIMIT_KB = Math.round(EDI_LIMIT_BYTES / 1000);
/** size = PDF 바이트 수 */
export const ATTACH_SIZE = (size: number, kb = Math.round(size / 1024)) =>
  size < EDI_LIMIT_BYTES
    ? `PDF ${kb}KB — 건강보험 EDI 첨부 한도(${EDI_LIMIT_KB}KB) 안입니다.`
    : `PDF ${kb}KB — 건강보험 EDI 첨부 한도(${EDI_LIMIT_KB}KB)를 넘습니다. 도장 그림을 더 작게 해서 다시 만들어 주세요.`;

export const CEO = { label: '대표자 여부', yes: '대표자', no: '대표자 아님', pick: '골라 주세요' };

export const INPUT_ERROR = {
  number: (label: string, i: number) => `${i}번째 사람 ${label}에는 숫자만 적어 주세요`,
  noName: (i: number) => `${i}번째 사람 성명을 적어 주세요(다른 칸이 채워져 있습니다)`,
  ceo: (i: number) => `${i}번째 사람 대표자 여부를 골라 주세요`,
  stamp: '도장 그림을 읽지 못했습니다. PNG 파일인지 확인해 주세요.',
};

export const REASON_MAX = 300;
export const REASON_COUNT = (n: number) => `${n} / ${REASON_MAX}자`;

export const BIZ_PICK = '사업장이 여러 곳입니다. 신고할 곳을 고르세요.';

export const BUTTON = { findBiz: '사업자번호로 찾기', find: '지사 찾기', add: '사람 더하기', remove: '빼기', make: 'PDF 만들기', making: '만드는 중' };

export const CHECK_BEFORE =
  '내려받은 PDF 를 열어 칸이 맞게 들어갔는지 확인한 뒤 내세요. 사업장관리번호·보수 총액은 공단 고지 자료와 같아야 합니다.';

export function failLine(msg: string): string {
  return `PDF 를 만들지 못했습니다: ${msg}`;
}

export function allCopy(): string[] {
  return [
    ...Object.values(KIND_LABEL), ...Object.values(STEP), ...Object.values(FIELD),
    ...LOSS_CODES.map(c => c.label), ...ACQ_CODES.map(c => c.label), LEAD, PRIVACY, LOSS_DATE_LINE('2026.06.01'), LOSS_DAY_NOTE, CODE_PICK,
    ...Object.values(BRANCH_LINE), ...Object.values(BRANCH_ERROR), BIZ_PICK, ACQ_NOTE, ATTACH_SIZE(520_000), ATTACH_SIZE(1_200_000),
    ...Object.values(CEO), INPUT_ERROR.number('월 보수액', 1), INPUT_ERROR.noName(1), INPUT_ERROR.ceo(1), INPUT_ERROR.stamp,
    REASON_COUNT(10), ...Object.values(BUTTON), CHECK_BEFORE, failLine('x'),
  ];
}
