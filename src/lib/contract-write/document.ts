// 근로계약서 작성 — 계약서 본문 모델. 엑셀·한글·PDF 가 이 한 벌을 그대로 그린다(형제 산출물이 서로 어긋나지 않게).
// 조항은 근로기준법 §17·시행령 §8(서면 명시 사항)과 기간제법 §17(단시간 근로일·근로일별 시간)을 기준으로 직접 썼다.
// 화면 금지어(src/lib/tool-kit/banned.ts)는 계약서 본문에도 적용한다 — tests/unit/contract-write-document.test.ts.
// 「포괄」은 쓰지 않는다(공개 명칭 = 임금 구성).
// 사업장 양식의 자동 종료 조항(매년 재계약 자동종료·불응 시 자동만료)은 넣지 않는다(HRMS 수원 건 재홍님 결정).

import { ROUNDING_UNIT, weeklySchedule, type DesignResult, type ItemKey } from './design';
import { dailyWorkHours, leaveTerms, PROBATION_PCT, rateText, reducedMonthsOf, restDayTerm, type WriteForm } from './contract';
import { hoursText, wonText } from './text';

export interface WageRow {
  label: string;
  hours: string;
  basis: string;
  amount: number;
}

export interface WageTable {
  caption: string;
  header: string[];
  rows: WageRow[];
  total: number;
}

export interface ContractClause {
  heading: string;
  lines: string[];
  /** 조항 아래 붙는 표(제5조 임금 구성). 출력은 조항 이름을 찾지 않고 이 칸으로 표 자리를 안다 */
  table?: WageTable;
}

export interface ContractDocument {
  title: string;
  preamble: string;
  clauses: ContractClause[];
  signature: { date: string; employer: string[]; employee: string[] };
}

/** 표를 칸 글자로(머리행·항목·합계) — 한글·PDF·줄 글자가 같은 행을 쓴다 */
export function wageTableCells(t: WageTable): string[][] {
  return [t.header, ...t.rows.map((r) => [r.label, r.hours, r.basis, wonText(r.amount)]), ['합계', '', '', wonText(t.total)]];
}


function dateText(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

function hm(hours: number): string {
  const total = Math.round(hours * 60);
  const m = total % 60;
  return m ? `${Math.floor(total / 60)}시간 ${m}분` : `${total / 60}시간`;
}

function basisText(key: ItemKey, period: DesignResult['period'], fivePlus: boolean, under15: boolean): string {
  switch (key) {
    case 'base':
      if (period === 'day') return '소정근로(하루 8시간 이내)';
      // 1주 15시간 미만은 주휴가 없다(근로기준법 제18조 제3항)
      return under15 ? '소정근로' : '소정근로 + 주휴';
    case 'weeklyHoliday':
      return '하루 소정근로 ÷ 5(1주 소정근로 비례)';
    case 'overtime':
      return fivePlus ? '하루 8시간·1주 40시간 넘는 시간 × 1.5' : '하루 8시간·1주 40시간 넘는 시간(가산 없음)';
    case 'night':
      return '22시~06시 근로 × 0.5';
    case 'holiday':
      return period === 'month' ? '공휴일 근무 예정 × 1.5(8시간 넘는 시간 × 2.0)' : '공휴일 근무 예정 × 1.5, 근무일 평균';
    case 'leave':
      return period === 'month' ? '연차유급휴가 미사용분 월 평균' : '연차유급휴가 미사용분 근무일 평균';
  }
}

/** 파트 일 지급액에 나눠 넣은 주휴수당을 결근한 주에 어떻게 할지(재홍님 261103 — 선택, 기본 = 공제) */
function absentWeekLines(form: WriteForm, design: DesignResult): string[] {
  const weekly = design.items.find((i) => i.key === 'weeklyHoliday');
  if (!weekly || weekly.amount <= 0) return [];
  const lead = '일 지급액의 주휴수당은 1주 소정근로일을 개근한 주의 주휴수당을 근무일마다 나누어 미리 지급하는 것이다.';
  // 공제 문구 = PR #144 검토(결근 아닌 날·정산 한도·시기·명세서) 뒤 재홍님 261103 확정 문구. 법조는 개근 요건(시행령 제30조 제1항)이라
  // 명세서 기재(제48조 제2항 영역) 뒤가 아니라 「주휴일이 발생하지 않은 주 … 정산하고」 뒤에 둔다
  return form.absentWeekHoliday === 'keep'
    ? [`${lead} 소정근로일에 결근한 주에도 그 주 근무일에 지급한 주휴수당은 공제하지 않는다.`]
    : [
        `${lead} 지각·조퇴와 유급휴일·법정 유급휴가로 근무하지 않은 날은 결근으로 보지 않는다. ` +
          '소정근로일에 결근하여 주휴일이 발생하지 않은 주에는 그 주 근무일에 미리 지급한 주휴수당 합계에 한하여, ' +
          '그 주의 마지막 날이 속한 달의 임금(그 달 임금을 지급한 뒤에 확정된 경우에는 다음 달 임금, 퇴직하는 경우에는 마지막 임금)에서 ' +
          '정산하고(근로기준법 제55조 제1항, 같은 법 시행령 제30조 제1항), 임금명세서에 해당 주와 금액을 적는다.',
      ];
}

/**
 * 파트 일 지급액은 근무한 날에만 생긴다 — 유급휴일·법정 유급휴가로 쉰 소정근로일에 줄 금액(PR #140 검토 6, 재홍님 261103 확정 문구).
 * 문장이 드는 공휴일 유급휴일(제55조 제2항)·연차(제60조)는 5명 이상·1주 15시간 이상에만 있다. 5명 미만은 둘 다 적용하지 않고
 * (시행령 제7조 별표 1, 제4·6조가 그렇게 적는다) 15시간 미만은 제55조·제60조 자체가 없어(제18조 제3항) 넣지 않는다
 */
function paidDayOffLines(form: WriteForm, design: DesignResult, under15: boolean): string[] {
  if (!form.employeeCount5plus || under15) return [];
  const weekly = design.items.find((i) => i.key === 'weeklyHoliday');
  const paid = weekly && weekly.amount > 0 ? '기본급과 주휴수당' : '기본급';
  return [
    `관공서의 공휴일·대체공휴일 등 유급휴일과 연차유급휴가 등 법정 유급휴가로 근무하지 않은 소정근로일에는 그날의 일 지급액 중 ${paid}을 지급한다. 이런 날은 결근으로 보지 않는다.`,
  ];
}

export function buildContractDocument(form: WriteForm, design: DesignResult): ContractDocument {
  const daily = dailyWorkHours(form);
  const scheduledDaily = Math.min(daily, 8);
  const weeklyScheduledRaw = scheduledDaily * form.workDays.length;
  const weeklyScheduled = Math.min(weeklyScheduledRaw, 40);
  const under15 = weeklyScheduledRaw < 15;
  const extraDaily = Math.max(daily - 8, 0);
  const days = form.workDays.join('·');
  const fivePlus = form.employeeCount5plus;
  const hourly = design.period === 'day';
  const prob = form.probation;

  const periodLines = [form.endDate ? `${dateText(form.startDate)}부터 ${dateText(form.endDate)}까지` : `${dateText(form.startDate)}부터 기간의 정함 없이`];
  if (prob) {
    periodLines.push(`수습기간: 계약 시작일부터 ${prob.months}개월`);
    if (prob.reduced) {
      const reducedMonths = reducedMonthsOf(prob);
      periodLines.push(
        `수습을 시작한 날부터 ${reducedMonths}개월 동안은 제5조 임금의 100분의 ${PROBATION_PCT}를 지급한다. 다만 시간급으로 환산한 금액이 최저임금법 제5조 제2항과 같은 법 시행령 제3조에 따른 금액(시간급 최저임금의 100분의 90) 이상이 되게 한다.`,
      );
    }
  }

  const weeklyOvertime = weeklySchedule(daily, form.workDays.length).overtime;
  const workLines = [
    `근로일: 매주 ${days}(주 ${form.workDays.length}일)`,
    `근로일별 근로시간: ${days} 각 ${form.start}~${form.end}, 휴게시간 ${form.breakMinutes}분(실근로 ${hm(daily)})`,
    weeklyScheduledRaw > 40
      ? `소정근로시간: 1주 40시간(근로기준법 제50조 제1항 한도), 하루 ${hm(scheduledDaily)} 이내`
      : `소정근로시간: 하루 ${hm(scheduledDaily)}, 1주 ${hm(weeklyScheduled)}`,
  ];
  // 5명 미만은 제53조(연장근로 한도·합의)를 적용하지 않는다(시행령 제7조 별표 1) — 법조 없이 소정근로시간을 넘는 근로로 적는다.
  // 가산하지 않는다는 것은 제4조가 적는다
  const overWork = fivePlus ? '연장근로' : '소정근로시간을 넘는 근로';
  const overCite = fivePlus ? '(근로기준법 제53조 제1항)' : '';
  if (weeklyOvertime > extraDaily * form.workDays.length + 1e-9) {
    workLines.push(`하루 8시간 또는 1주 40시간을 넘는 시간(1주 ${hm(weeklyOvertime)})은 ${overWork}이며, 근로자는 이에 동의한다${overCite}.`);
  } else if (extraDaily > 0) {
    workLines.push(`하루 8시간을 넘는 ${hm(extraDaily)}은 ${overWork}이며, 근로자는 이에 동의한다${overCite}.`);
  }
  if (design.hours.night > 0) workLines.push('22시부터 다음 날 6시 사이의 근로는 야간근로이며, 통상임금의 100분의 50을 가산한다(근로기준법 제56조 제3항).');

  const restLines = [restDayTerm(form)];
  if (fivePlus) {
    if (!under15) restLines.push('관공서의 공휴일과 대체공휴일은 근로기준법 제55조 제2항에 따른 유급휴일로 하고, 그날 근무하면 휴일근로수당을 지급한다.');
  } else {
    restLines.push('상시 5명 미만 사업장이므로 근로기준법 제55조 제2항(공휴일 유급휴일)과 제56조(연장·야간·휴일 가산)는 적용하지 않는다(근로기준법 시행령 제7조 별표 1).');
  }

  const wageLines = hourly
    ? [
        `시간당 지급액: ${wonText(form.hourlyWage!)}(휴게시간을 포함한 출근~퇴근 시간 기준)`,
        `일 지급액: ${wonText(design.total)}(구성은 아래 표)`,
        `통상시급: ${rateText(design.rate)}원(일 지급액 ÷ 아래 표의 하루 인정시간 합 ${hoursText(design.totalHours)})`,
        '월 임금은 그 달에 실제 근무한 날의 일 지급액을 합한 금액으로 한다.',
        ...paidDayOffLines(form, design, under15),
        ...absentWeekLines(form, design),
        '표의 연장 시간은 제3조의 근무를 기준으로 미리 정한 시간이다. 실제 근로가 이 시간을 넘으면 넘는 시간의 수당을 따로 계산해 추가로 지급한다.',
      ]
    : [
        `월 임금 총액: ${wonText(design.total)}(구성은 아래 표)`,
        `통상시급: ${rateText(design.rate)}원(월 임금 총액 ÷ 아래 표의 월 인정시간 합 ${hoursText(design.totalHours)})`,
        '표의 연장·휴일 시간은 제3조·제4조의 근무를 기준으로 미리 정한 월 예정 시간이다. 실제 근로가 이 시간을 넘으면 넘는 시간의 수당을 따로 계산해 추가로 지급한다.',
      ];
  // 출력 숫자를 다시 셈할 수 있게(#139 적대 검토 9) — 시간은 둘째 자리로 줄여 적지만 금액은 줄이기 전 시간으로 셈했다
  wageLines.push('표의 시간은 소수 둘째 자리까지 적었고, 금액은 그 전의 시간(통상시급 × 시간)으로 계산했다.');
  const absorber = design.items.find((i) => i.absorbs);
  const unit = ROUNDING_UNIT[form.rounding ?? 'won'];
  if (absorber && unit) {
    wageLines.push(`${absorber.label}을 뺀 항목 금액은 ${unit}원 단위로 올렸고, 남는 금액은 ${absorber.label}에 넣었다.`);
  }
  if (prob?.reduced) {
    wageLines.push(`수습 감액 기간의 ${hourly ? '일 지급액' : '월 임금 총액'}: ${wonText(Math.round((design.total * PROBATION_PCT) / 100))}(100분의 ${PROBATION_PCT})`);
  }
  wageLines.push(`임금 지급일: ${form.payday}`, `지급방법: ${form.paymentMethod}`);

  const leaveLines = leaveTerms(form, design);

  const rows: WageRow[] = design.items
    .filter((item) => item.amount !== 0 || item.hours > 0)
    .map((item) => ({ label: item.label, hours: hoursText(item.hours), basis: basisText(item.key, design.period, fivePlus, under15), amount: item.amount }));
  const table: WageTable = {
    caption: hourly ? '일 지급액 구성(항목별 하루 인정시간·금액)' : '임금 구성(항목별 월 인정시간·금액)',
    header: ['항목', hourly ? '하루 인정시간' : '월 인정시간', '산정 기준', '금액'],
    rows,
    total: design.total,
  };

  const clauses: ContractClause[] = [
    { heading: '제1조(계약기간)', lines: periodLines },
    { heading: '제2조(근무장소와 업무)', lines: [`근무장소: ${form.location}`, `업무: ${form.duty}`] },
    { heading: '제3조(근로일과 근로시간)', lines: workLines },
    { heading: '제4조(휴일)', lines: restLines },
    { heading: '제5조(임금)', lines: wageLines, table },
    { heading: '제6조(연차유급휴가)', lines: leaveLines },
    { heading: '제7조(사회보험)', lines: ['고용보험·산재보험·국민연금·건강보험에 가입한다.'] },
    { heading: '제8조(계약서 교부)', lines: ['사업주는 이 계약을 맺는 즉시 계약서 사본을 근로자에게 교부한다(근로기준법 제17조 제2항).'] },
    { heading: '제9조(그 밖의 사항)', lines: ['이 계약에 정하지 않은 사항은 근로기준법 등 관계 법령에 따른다.'] },
  ];

  return {
    title: '근로계약서',
    preamble: `${form.workplaceName}(이하 「사업주」)와 ${form.employeeName}(이하 「근로자」)은 다음과 같이 근로계약을 맺는다.`,
    clauses,
    signature: {
      date: dateText(form.writtenDate),
      employer: [`사업체명: ${form.workplaceName}`, `대표자: ${form.ownerName ?? ''}  (서명 또는 인)`],
      employee: [`성명: ${form.employeeName}  (서명 또는 인)`],
    },
  };
}

/** 계약서 전체를 줄 글자로(금지어 검사·PDF·미리보기 공용) */
export function documentLines(doc: ContractDocument): string[] {
  const out = [doc.title, doc.preamble];
  for (const c of doc.clauses) {
    out.push(c.heading, ...c.lines);
    if (c.table) out.push(c.table.caption, ...wageTableCells(c.table).map((r) => r.filter(Boolean).join(' ')));
  }
  out.push(doc.signature.date, ...doc.signature.employer, ...doc.signature.employee);
  return out;
}
