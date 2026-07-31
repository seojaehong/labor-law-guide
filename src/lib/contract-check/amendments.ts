// 수정안 제시기 — Python amendments.py 포트. findings를 조항별 수정안 행으로 변환.
//
// violation/risk finding마다 [조항 / 현행 문안 / 문제점·근거조문 / 수정 문안] 행을 만들고,
// 우선순위(즉시 수정=violation, 권고=risk)순으로 정렬한다.
// 수정문안 원칙: 금품청산 14일 · 해고는 정당한 이유+30일 예고+서면통지 ·
// 자동만료/부제소 삭제 · 가산율 1.5 환산시간 명시 · 추가수당 시간수 = amount÷통상시급(0.1H 반올림).

import { checkContract } from './engine';
import { fixedTermsMissing, requiredTermsMissing } from './rules/required_terms';
import { WAGE_MATH_TOLERANCE } from './rules/wage';
import type { Contract, Finding, FindingSeverity, FindingStatus } from './types';

export const PRIORITY_LABEL: Partial<Record<FindingStatus, string>> = {
  violation: '즉시 수정',
  risk: '권고',
  needs_data: '자료 필요',
};

const PRIORITY_ORDER: Partial<Record<FindingStatus, number>> = {
  violation: 0,
  risk: 1,
  needs_data: 2,
};

// 태그 규칙 → risk_clauses 태그 (현행 문안 원문 추출용)
const RULE_TAG: Record<string, string> = {
  'PAY-14D': '금품청산',
  'PAY-DIRECT': '조건부지급',
  'DISMISS-NOTICE': '즉시해고',
  'DISMISS-JUST': '자동만료',
  'NO-LAWSUIT-WAIVER': '부제소',
  'PENALTY-BAN': '위약예정',
};

// rule_code → 표준 수정문안 (계약 무관 고정 문안) — rewrite.ts가 교정 조문 추출에 재사용
export const AMEND_LIBRARY: Record<string, string> = {
  'PAY-14D':
    '「사용자는 근로자가 퇴직한 경우 지급 사유가 발생한 때부터 14일 이내에 ' +
    '임금·보상금 그 밖의 일체의 금품을 지급한다. 다만 특별한 사정이 있을 경우 ' +
    '당사자 간 합의에 의하여 지급기일을 연장할 수 있다.」로 교체 (지급기일 1개월 약정 삭제)',
  'PAY-DIRECT':
    '「임금은 근로자에게 직접, 그 전액을 통화(계좌이체 포함)로 지급한다.」로 교체 — ' +
    '유니폼 반납·점포 방문 등 일체의 지급 조건 문구 삭제',
  'DISMISS-NOTICE':
    '즉시해고 문구를 「사용자는 근로자를 해고하려면 정당한 이유가 있어야 하며, ' +
    '적어도 30일 전에 해고를 예고하고 해고사유와 해고시기를 서면으로 통지한다.」로 교체',
  'DISMISS-JUST':
    '자동만료 조항 전부 삭제 — 수습평가·지시 불응은 근로계약 자동만료 사유가 될 수 없고, ' +
    '근로관계 종료는 근로기준법 제23조의 정당한 이유와 해고 절차에 따른다',
  'NO-LAWSUIT-WAIVER':
    '이의제기 금지·부제소 특약 삭제 — 강행법규 위반으로 무효이므로 존치 실익 없음',
  'PENALTY-BAN': '위약금·손해배상액 예정 조항 삭제 (근로기준법 §20 금지)',
  'OT-RATE':
    '연장근로수당 산출근거에 「가산율 1.5 반영 환산시간」임을 명시 — ' +
    '예: 통상시급 × 월간 19H(실연장 12.7H × 가산율 1.5 환산)',
  'OT-COVER': '약정 연장 환산시간을 법정 필요시간(주 연장 × 4.345 × 1.5) 이상으로 증액',
  MINWAGE: '기본급을 해당연도 최저시급 × 209H 이상으로 인상',
  'MINWAGE-PROBATION':
    '수습 감액 미적용 사업장은 90% 감액 문구를 삭제하고 「수습기간 해당사항 없음」으로 통일',
  'WH-52CAP':
    '주 실근로를 52시간 미만으로 조정(스케줄·휴게 재설계)하거나 ' +
    '초과 즉시 위반이 됨을 전제로 출퇴근기록 관리 강화',
  'WH-BREAK':
    '10분 미만 조각 휴게를 통합해 30분 이상 연속 휴게로 재편성 ' +
    '(4시간당 30분·8시간당 1시간, 실질적 자유이용 보장)',
  'NIGHT-WORK': '야간근로(22시~06시)가 있는 경우 야간근로수당 항목(가산율 0.5)을 명시',
  'REST-DAY': '주휴일 요일을 특정 명시 (예: 「주휴일은 매주 일요일로 한다」)',
  'WRITTEN-TERMS':
    '근로계약서는 근로 개시 전 작성·교부하고, 근로조건 변경 시 즉시 재작성 — ' +
    '소급 작성 관행 중단',
  'ANNUAL-LEAVE':
    '연차수당 선지급과 무관하게 연차휴가 사용권이 보장됨을 명시하고, ' +
    '미사용 연차는 별도 정산한다는 문구 추가',
  'INCLUSIVE-WAGE':
    '고정 스케줄로 근로시간 산정이 가능하므로 포괄임금 유효성 다툼 대비 — ' +
    '출퇴근기록을 관리하고 실근로 초과분은 별도 정산한다는 문구 추가',
  'MINOR-WORKER':
    '연소자 특칙 적용 — 친권자 동의서·가족관계증명서 비치, 근로시간·야간근로 제한 준수',
  'FIXED-TERM-2Y':
    '계약기간(갱신 누계 포함)을 2년 이내로 조정하거나, 2년 초과 시 ' +
    '기간의 정함이 없는 근로자로 간주됨(기간제법 §4②)을 전제로 무기계약 전환을 검토',
  'PART-TIME-OT':
    '단시간 근로자의 초과근로는 근로자 동의를 받아 주 12시간 이내로 제한하고, ' +
    '초과근로에 대하여 통상시급의 50%를 가산하여 지급한다는 문구 명시 (기간제법 §6)',
};

// 필수 명시사항 누락 라벨(접두 매칭, 긴 라벨 우선) → 보완 문안
const REQUIRED_TERMS_SUPPLEMENT: Array<[string, string]> = [
  [
    '근로일 및 근로일별 근로시간',
    '근로일별 근로시간 표 양식(근로일 | 시업 | 종업) 삽입 — 기간제법 §17 제6호 (단시간 한정)',
  ],
  ['임금의 구성항목·계산방법·지불방법', '임금 구성항목표·산출근거(통상시급 × 시간수)·지급방법 명시'],
  ['취업장소·종사업무', '취업 장소와 종사 업무 내용 명시'],
  ['근로계약기간', '계약기간 조에 근로개시일과 종료일 명시'],
  ['근로시간·휴게', '시업·종업 시각과 휴게시간 명시'],
  ['휴일·휴가', '주휴일 요일 특정 및 연차유급휴가 조항 추가'],
  ['임금 구성항목', '임금 구성항목표(항목별 금액) 신설'],
  ['임금 계산방법', '각 임금 항목에 산출근거(통상시급 × 시간수) 명시'],
  ['임금 지급방법', '「임금은 근로자 명의 예금계좌로 직접 전액 지급한다」 문구 추가'],
  ['소정근로시간', '시업·종업 시각과 주 근로일수 명시'],
  ['주휴일', AMEND_LIBRARY['REST-DAY']],
  ['연차유급휴가', '「연차유급휴가는 근로기준법 제60조에 따라 부여한다」 조항 추가'],
  ['취업장소', '취업 장소(근무지) 명시'],
  ['종사업무', '종사 업무 내용 명시'],
];

export interface AmendmentRow {
  rule_code: string;
  priority: string;
  status: FindingStatus;
  severity: FindingSeverity;
  clause: string;
  current: string;
  problem: string;
  amendment: string;
}

export interface AmendmentResult {
  contract_id: string;
  employee_name: string | null;
  rows: AmendmentRow[];
}

const fmt = (n: number) => n.toLocaleString('ko-KR');

/** 누락 라벨 리스트 → 항목별 보완 문안 병기. */
function requiredTermsAmendment(missing: string[]): string {
  return missing
    .map((label) => {
      const found = REQUIRED_TERMS_SUPPLEMENT.find(([prefix]) => label.startsWith(prefix));
      return `${label} → ${found ? found[1] : '해당 항목을 서면 명시'}`;
    })
    .join(' / ');
}

/** 태그 규칙의 조항 ref·현행 원문. */
function clauseRowSource(contract: Contract, code: string): [string, string] {
  const tag = RULE_TAG[code];
  const clauses = (contract.risk_clauses ?? []).filter((rc) => (rc.tags ?? []).includes(tag));
  const refs = clauses.map((rc) => rc.clause_ref || '?').join('·');
  const texts = clauses.map((rc) => rc.text ?? '').join(' / ');
  return [refs || '—', texts || '—'];
}

/** 불일치 항목별 재산정 시간수 = amount ÷ 통상시급 (0.1H 반올림). */
function wageMathAmendment(contract: Contract): [string, string] {
  const wage = contract.wage ?? {};
  const rate = wage.ordinary_hourly_rate;
  const parts: string[] = [];
  const currents: string[] = [];
  for (const item of wage.items ?? []) {
    const { amount, basis_hours: hours } = item;
    if (rate == null || amount == null || hours == null) continue;
    const expected = Math.round(rate * hours * (item.rate_multiplier ?? 1.0));
    if (Math.abs(amount - expected) > WAGE_MATH_TOLERANCE) {
      const recalc = (Math.round((amount / rate) * 10) / 10).toFixed(1);
      parts.push(
        `${item.label ?? item.code} 시간수를 ${fmt(amount)} ÷ ${fmt(rate)} = ${recalc}H로 ` +
          `재산정해 산출근거를 「통상시급×월간 ${recalc}H」로 정정 (금액 유지)`,
      );
      currents.push(`${item.basis_text ?? ''} = ${fmt(amount)}원`);
    }
  }
  return [currents.join(' / ') || '—', parts.join(' / ')];
}

/** 비태그 규칙의 현행 문안 — 계약 내 관련 원문이 있으면 사용. */
function currentText(contract: Contract, code: string): string {
  const wt = contract.work_time ?? {};
  const hl = contract.holidays_leave ?? {};
  const probation = contract.period?.probation ?? {};
  const sources: Record<string, string | null | undefined> = {
    'INCLUSIVE-WAGE': wt.flexible_clause,
    'ANNUAL-LEAVE': hl.annual_leave_clause,
    'REST-DAY': hl.weekly_rest,
    'WH-52CAP':
      `주 ${wt.days_per_week}일 ${wt.start}~${wt.end} (실근로 주 ${wt.weekly_actual_hours}h)`,
    'WH-BREAK': `휴게 ${(wt.breaks ?? []).length}회 총 ${wt.break_total_minutes}분`,
    'WRITTEN-TERMS':
      `입사 ${contract.period?.start_date} / 작성 ${contract.signatures?.written_date}`,
    'MINWAGE-PROBATION': `수습 ${probation.months}개월 ${probation.wage_rate_pct}% 문구`,
    'OT-RATE': (contract.wage?.items ?? [])
      .filter((i) => String(i.code ?? '').startsWith('OT_'))
      .map((i) => i.basis_text ?? '')
      .join(' / '),
  };
  return sources[code] || '—';
}

/** finding 1건 → 수정안 행. */
export function buildRow(contract: Contract, finding: Finding): AmendmentRow {
  const code = finding.rule_code;
  let clause: string;
  let current: string;
  let amendment: string;
  if (code in RULE_TAG) {
    [clause, current] = clauseRowSource(contract, code);
    amendment = AMEND_LIBRARY[code];
  } else if (code === 'WAGE-MATH') {
    clause = '임금 구성항목표';
    [current, amendment] = wageMathAmendment(contract);
  } else if (code === 'REQUIRED-TERMS' || code === 'REQUIRED-TERMS-FIXED') {
    clause = '계약서 전반';
    current = '(해당 조항 없음)';
    const missing =
      code === 'REQUIRED-TERMS' ? requiredTermsMissing(contract) : fixedTermsMissing(contract);
    amendment = requiredTermsAmendment(missing);
  } else {
    clause = code === 'OT-RATE' ? '임금 구성항목표' : '—';
    current = currentText(contract, code);
    amendment = AMEND_LIBRARY[code] ?? '관련 규정 정비 검토';
  }
  return {
    rule_code: code,
    priority: PRIORITY_LABEL[finding.status] ?? finding.status,
    status: finding.status,
    severity: finding.severity,
    clause,
    current,
    problem: `${finding.detail} (${finding.statute})`,
    amendment,
  };
}

/** 계약 1건 → 수정안 결과 (violation/risk만, 우선순위→rule_code순). */
export function amendContract(contract: Contract, findings?: Finding[]): AmendmentResult {
  const all = findings ?? checkContract(contract);
  const actionable = all
    .filter((f) => f.status === 'violation' || f.status === 'risk')
    .sort(
      (a, b) =>
        (PRIORITY_ORDER[a.status] ?? 9) - (PRIORITY_ORDER[b.status] ?? 9) ||
        (a.rule_code < b.rule_code ? -1 : a.rule_code > b.rule_code ? 1 : 0),
    );
  return {
    contract_id: contract.contract_id || '(no id)',
    employee_name: contract.employee?.name ?? null,
    rows: actionable.map((f) => buildRow(contract, f)),
  };
}

const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** 수정안 결과 리스트 → 고객사 송부용 md 보고서. */
export function renderMd(results: AmendmentResult[]): string {
  const lines: string[] = ['# 근로계약서 수정안 보고서', ''];
  for (const r of results) {
    const immediate = r.rows.filter((x) => x.status === 'violation').map((x) => x.rule_code);
    const advisory = r.rows.filter((x) => x.status === 'risk').map((x) => x.rule_code);
    lines.push(
      `## ${r.contract_id} — ${r.employee_name || '(이름 미상)'}`,
      '',
      '**우선순위 요약**',
      `- 즉시 수정 (위반) ${immediate.length}건: ${immediate.join(', ') || '없음'}`,
      `- 권고 (리스크) ${advisory.length}건: ${advisory.join(', ') || '없음'}`,
      '',
      '| 구분 | 조항 | 현행 문안 | 문제점·근거조문 | 수정 문안 |',
      '|---|---|---|---|---|',
    );
    for (const row of r.rows) {
      lines.push(
        `| ${row.priority} | ${cell(row.clause)} | ${cell(row.current)} ` +
          `| ${cell(row.problem)} | ${cell(row.amendment)} |`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}
