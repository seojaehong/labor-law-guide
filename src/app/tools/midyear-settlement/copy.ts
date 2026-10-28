// 중도퇴사 연말정산 계산기의 문장은 모두 여기서 만든다. 시험이 이 함수들의 출력 전부를 금지어로 훑는다.
// 세액 계산 도구 공통 장치(261028) — 결과는 「예상」으로만 말하고, 대행이 아니라고 늘 적고, 연락을 권하지 않는다.
import type { MidyearDetail, MidyearInput, MidyearOutcome } from '@/lib/calc/midyear-settlement';

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const signed = (n: number) => (n > 0 ? `+${won(n)}` : n < 0 ? `−${won(-n)}` : '0원');

export type MoneyField = Exclude<keyof MidyearInput, 'year'>;

/**
 * 입력 칸 — 화면이 이 순서·이름 그대로 쓴다. 칸마다 끝 달을 적는다: 급여·4대보험료는 퇴직월분까지(퇴직월 급여에서도 뗀다,
 * §52① 「해당 과세기간에 … 근로자가 부담하는 보험료를 지급한 경우」), 이미 낸 세금은 퇴직월 전 달까지(PR #112 사후 검토 3).
 * 운영 절차(verify.mts)가 칸을 이름의 앞 글자로 부분 일치해 집는다 — 앞 글자를 바꾸면 절차도 고친다.
 */
export const INPUT_FIELDS: { key: MoneyField; label: string; optional?: true }[] = [
  { key: 'totalPay', label: '받은 급여 합계(비과세 포함, 퇴직월까지)' },
  { key: 'nonTaxable', label: '비과세 급여 합계(퇴직월까지)' },
  { key: 'pension', label: '국민연금(근로자 부담, 퇴직월까지 합계)' },
  { key: 'health', label: '건강보험료(근로자 부담, 퇴직월까지 합계)' },
  { key: 'longTermCare', label: '장기요양보험료(근로자 부담, 퇴직월까지 합계)' },
  { key: 'employment', label: '고용보험료(근로자 부담, 퇴직월까지 합계)' },
  { key: 'paidIncomeTax', label: '이미 낸 소득세(퇴직월 전 달까지)' },
  { key: 'paidLocalTax', label: '이미 낸 지방소득세(퇴직월 전 달까지)' },
  { key: 'lastMonthSimpleTax', label: '퇴직월 간이세액(대조용, 있으면)', optional: true },
];

/** 입력 칸 아래 안내 문단 */
export const INPUT_GUIDE = [
  '금액은 모두 그해 1월부터의 합계(원)입니다. 급여·비과세는 퇴직월분까지, 이미 낸 세금은 퇴직월 전 달까지 넣습니다.',
  '4대보험료는 퇴직월분까지 급여에서 뗀 근로자 부담분이고, 퇴직정산으로 더 뗀 건강·장기요양보험료는 더하고 돌려받은 것은 뺍니다.',
  '퇴직월 간이세액은 따로 적으면 회사가 그것을 먼저 뗀 경우의 정산액도 함께 보여 줍니다. 그 칸 말고는 비워 두면 계산하지 않으니, 없는 금액은 0을 넣습니다.',
];

/**
 * 빈 칸 안내. 계산할 수 있으면 null.
 * 빈 칸을 0 으로 읽으면 이미 낸 세금 0 · 보험료 0 으로 계산한 답이 「예상」으로 나가므로, 대조용 칸 말고는 다 채워야 계산한다
 * (PR #112 사후 검토 8). 0 을 적은 칸은 채운 것으로 본다.
 */
export function firstMissing(vals: Record<MoneyField, string>): string | null {
  const f = INPUT_FIELDS.find((x) => !x.optional && !vals[x.key].trim());
  if (!f) return null;
  if (f.key === 'totalPay') return '받은 급여 합계를 넣어 주세요.';
  return `「${f.label}」 칸이 비어 있습니다. 없는 금액이면 0을 넣어 주세요.`;
}

/** 계산 전에 묻는 것 — 하나라도 해당하면 고정형 계산이 회사 정산과 달라진다 */
export const SCOPE_ITEMS = [
  '부양가족(배우자·자녀·부모 등) 공제를 회사에 신청했다',
  '본인 추가공제(70세 이상·장애인·부녀자·한부모)를 신청했다',
  '주택임차차입금·장기주택저당차입금(주택자금), 주택청약종합저축, 신용카드 등 사용액 소득공제를 신청했다',
  '올해 다른 회사에서 받은 급여가 있다',
  '중소기업 취업자 소득세 감면을 받는다',
  '보장성보험료·의료비·교육비·기부금·월세·연금계좌 세액공제를 신청했다',
  '올해 혼인신고를 해 혼인세액공제(50만원)를 신청했다',
  '일용근로자이거나 비거주자이거나, 외국인 단일세율을 적용받는다',
  '회사가 세금을 대신 내주는 세후 금액으로 계약했다',
];

export const SCOPE_STOP = [
  '이 경우는 이 도구가 계산하지 않습니다.',
  '본인 기본공제·국민연금 공제에 보험료 소득공제나 표준세액공제 중 하나만 더하는 고정형으로 계산하면 회사가 실제로 정산한 금액과 달라집니다. 회사가 준 근로소득 원천징수영수증과 홈택스 연말정산 모의계산으로 확인합니다.',
];

/** 결과 아래 늘 붙는 고지 */
export const NOTICE = [
  '예상 금액입니다. 회사가 실제로 적용한 공제에 따라 달라질 수 있습니다.',
  '세무대리·신고서 작성 대행이 아닙니다. 원천징수영수증이나 신고서를 만들지 않습니다.',
];

// 연말정산 모의계산 화면의 고정 주소는 확인하지 못했다 — 첫 화면으로 간다는 것을 글자로 밝힌다(PR #112 검토 3·13)
export const HOMETAX_URL = 'https://www.hometax.go.kr';
export const HOMETAX_LINK = { text: '홈택스(첫 화면)', after: '에서 연말정산 모의계산 메뉴를 찾아 한 번 더 확인할 수 있습니다.' };

// 법은 「작은 쪽」을 정하지 않는다(§52⑧·§59의4⑨1호 — 신청했는지로 갈린다). 답이 가정한 값임을 답 문장에 밝힌다(PR #112 검토 7)
function taxLine(s: number, method: MidyearDetail['method']): string {
  const tail = method === 'same' ? '(보험료 소득공제와 표준세액공제 어느 쪽으로 계산해도 같음).' : '(보험료 소득공제와 표준세액공제 중 근로자에게 유리한 쪽으로 가정).';
  if (s < 0) return `퇴직월에 소득세 ${won(-s)}을 돌려받는 것으로 예상합니다${tail}`;
  if (s > 0) return `퇴직월에 소득세 ${won(s)}을 더 내는 것으로 예상합니다${tail}`;
  return `퇴직월에 더 내거나 돌려받을 소득세가 없는 것으로 예상합니다${tail}`;
}

function localLine(s: number): string {
  if (s < 0) return `지방소득세는 ${won(-s)}을 돌려받는 것으로 예상합니다.`;
  if (s > 0) return `지방소득세는 ${won(s)}을 더 내는 것으로 예상합니다.`;
  return '지방소득세는 더 내거나 돌려받을 금액이 없는 것으로 예상합니다.';
}

/** 답 한 문장(두 줄) */
export function headline(o: MidyearOutcome): string[] {
  if (o.kind === 'ok') return [taxLine(o.detail.settleIncomeTax, o.detail.method), localLine(o.detail.settleLocalTax)];
  if (o.reason === 'year') return [`${o.year}년 기준은 이 도구에 아직 넣지 않았습니다.`, '다른 해 기준으로 대신 계산하지 않습니다.'];
  if (o.reason === 'high-pay') {
    return [`총급여(받은 급여 − 비과세) ${won(o.gross)}은 1억 2천만원 이상이라 이 도구가 계산하지 않습니다.`, '고정형은 총급여 1억 2천만원 미만까지만 계산합니다.'];
  }
  return [
    `더 낼 소득세가 ${won(o.detail.settleIncomeTax)}으로 1천원 미만이라 이 도구의 범위 밖입니다.`,
    '원천징수세액이 1천원 미만이면 징수하지 않는다는 규정(소득세법 제86조)이 걸리는 경우라 여기서 멈춥니다.',
  ];
}

function cut(diff: number, settled: number): string {
  return diff === settled ? `${signed(settled)}입니다` : `${signed(diff)}, 10원 미만을 0 쪽으로 버려 ${signed(settled)}입니다`;
}

/** 1천원 미만 추징 — 소득세법 §86 1호로 징수하지 않는다 */
const small = (n: number) => n > 0 && n < 1_000;

/** 소득세 정산액. 1천원 미만 추징이면 징수하지 않는다고 붙인다(PR #112 사후 검토 12 — 답 밖의 대조값에도 같은 문턱) */
const incomeSigned = (n: number) => (small(n) ? `${signed(n)}(1천원 미만이라 징수하지 않음, 소득세법 제86조 제1호)` : signed(n));

/** 근거 — 왜 그 금액인가 */
export function whyLines(d: MidyearDetail): string[] {
  const path = (p: MidyearDetail['a']) => `소득세 ${incomeSigned(p.settleIncomeTax)}·지방소득세 ${signed(p.settleLocalTax)}`;
  const other = d.method === 'A' ? 'B' : 'A';
  // 끝수를 홈택스와 대조하지 못했으므로(LIMITS) 영수증과 「맞는다」고 단정하지 않는다(PR #112 사후 검토 5)
  const which =
    d.method === 'same'
      ? '두 방식의 결정세액이 같아 어느 쪽으로 정산해도 답이 같습니다.'
      : `위 답은 결정세액이 작은 ${d.method}로 계산해 근로자에게 유리한 쪽으로 가정한 값입니다. 회사가 ${other}로 정산했다면 영수증은 ${other} 금액과 대조합니다.`;
  return [
    `보험료 소득공제(A)로 계산하면 ${path(d.a)}, 표준세액공제 13만원(B)으로 계산하면 ${path(d.b)}입니다.`,
    `둘은 함께 받을 수 없습니다. 건강·장기요양·고용보험료 소득공제를 신청하면 표준세액공제 13만원은 붙지 않습니다(소득세법 제52조 제8항, 제59조의4 제9항 제1호). ${which}`,
    `예상 결정세액 ${won(d.decided)} − 이미 낸 소득세 ${won(d.paidIncomeTax)} = ${cut(d.decided - d.paidIncomeTax, d.settleIncomeTax)}(국고금 관리법 제47조).`,
    `예상 결정 지방소득세 ${won(d.decidedLocal)}(결정세액의 10%) − 이미 낸 지방소득세 ${won(d.paidLocalTax)} = ${cut(d.decidedLocal - d.paidLocalTax, d.settleLocalTax)}(지방세법 제103조의13, 지방세기본법 제59조).`,
  ];
}

/** 그래서 생기는 일 */
export function effectLines(d: MidyearDetail): string[] {
  const lines = ['회사가 준 근로소득 원천징수영수증의 차감징수세액 칸과 대조합니다.'];
  // 회사 처리 방식을 단정하지 않는다 — 퇴직월 간이세액을 먼저 뗐다면 그것도 기납부세액이다(§137①3호, PR #112 검토 10)
  if (d.settleWithSimple !== null) {
    const ifFirst = `퇴직월 간이세액 ${won(d.lastMonthSimpleTax)}은 계산에 쓰지 않았습니다. 회사가 퇴직월 급여에서 이 간이세액을 먼저 떼고 그것까지 이미 낸 소득세로 넣어 정산했다면`;
    lines.push(
      small(d.settleWithSimple)
        ? `${ifFirst} 차감 소득세는 ${signed(d.settleWithSimple)}이고, 1천원 미만이라 징수하지 않는 금액으로 예상합니다(소득세법 제86조 제1호, 제137조 제1항 제3호).`
        : `${ifFirst} 영수증의 차감징수세액은 ${signed(d.settleWithSimple)}으로 예상합니다(소득세법 제137조 제1항 제3호).`,
      `퇴직월 급여에 간이세액 ${won(d.lastMonthSimpleTax)}과 위 정산액 ${signed(d.settleIncomeTax)}을 둘 다 반영했다면 같은 달 세금이 두 번 들어간 것입니다.`,
    );
  }
  // 지방소득세 자체의 1천원 기준은 조문·해석례에서 찾지 못했다 — 계산한 금액을 보여 주고 그렇다고 밝힌다(PR #112 사후 검토 2·11)
  if (small(d.settleLocalTax)) {
    lines.push(
      `더 낼 지방소득세 ${won(d.settleLocalTax)}은 1천원 미만입니다. 소득세의 1천원 미만 부징수(소득세법 제86조 제1호)가 지방소득세에도 따로 걸리는지는 조문·해석에서 확인하지 못해 계산한 금액을 그대로 보여 줍니다. 영수증의 지방소득세 칸과 대조합니다.`,
    );
  }
  return lines;
}

/** 접어 둔 계산 과정 */
export function formulaLines(d: MidyearDetail): string[] {
  const r = d.rules;
  const credit = (p: MidyearDetail['a']) =>
    p.creditRaw > p.creditLimit ? `근로소득세액공제 ${won(p.credit)}(공제액 ${won(p.creditRaw)}, 한도 ${won(p.creditLimit)})` : `근로소득세액공제 ${won(p.credit)}`;
  const floorB = d.b.computed - d.b.credit - d.b.standard < 0 ? '(0 아래는 0, 소득세법 제61조)' : '';
  return [
    `총급여 = 받은 급여 합계 − 비과세 = ${won(d.gross)}(소득세법 제20조 제2항)`,
    `근로소득공제 ${won(d.earnedDeduction)}(제47조 제1항) → 근로소득금액 ${won(d.earnedIncome)}`,
    `A 과세표준 = ${won(d.earnedIncome)} − 본인 ${won(r.personal)} − 국민연금 ${won(d.pension)} − 건강·장기요양·고용 ${won(d.insurance)} = ${won(d.a.taxBase)}`,
    `A 산출세액 ${won(d.a.computed)} − ${credit(d.a)} = 결정세액 ${won(d.a.decided)}`,
    `B 과세표준 = ${won(d.earnedIncome)} − 본인 ${won(r.personal)} − 국민연금 ${won(d.pension)} = ${won(d.b.taxBase)}`,
    `B 산출세액 ${won(d.b.computed)} − ${credit(d.b)} − 표준세액공제 ${won(d.b.standard)} = 결정세액 ${won(d.b.decided)}${floorB}`,
    `답에 쓴 결정세액 = 둘 중 작은 쪽(근로자에게 유리한 쪽으로 가정) ${won(d.decided)} · 지방소득세 = ${won(d.decided)} × 10% = ${won(d.decidedLocal)}`,
    '끝수: 근로소득공제·과세표준·산출세액·근로소득세액공제·결정세액은 원 미만을, 정산액은 10원 미만을 0 쪽으로 버립니다.',
    `기준: ${r.year}년 귀속, ${r.basis}(조문 확인 ${r.checked}).`,
  ];
}

/** 이 도구가 다루지 않거나 확인하지 못한 것 */
export const LIMITS = [
  '부양가족·종전 근무지·감면·추가공제·주택자금·신용카드 등 소득공제·특별세액공제·혼인세액공제는 계산에 넣지 않습니다. 해당하면 위에서 멈춥니다.',
  '총급여 1억 2천만원 이상이거나, 더 낼 소득세가 1천원 미만인 경우도 계산하지 않습니다.',
  '공제신고서를 내지 않은 근로자에게 회사가 본인 기본공제와 표준세액공제만 적용했다면(소득세법 제137조 제3항) 국민연금 공제도 빠져 위 A·B 금액과 다릅니다. 이 도구는 그 경우를 따로 계산하지 않으므로, 영수증이 위 두 값과 다르면 이 경우인지 확인합니다.',
  '비과세인지는 급여명세서에 비과세로 적힌 금액(식대 등)을 따릅니다. 이 도구가 가리지 않습니다.',
  '칸마다 원 미만을 버리는 방식은 원천징수영수증이 칸마다 원 단위로 적는 것에 맞춘 것이고, 홈택스 모의계산과는 대조하지 못했습니다. 1원이 다르면 10원 단위 정산액이 달라질 수 있습니다.',
];

/** 시험용 — 한 결과에서 화면에 나올 수 있는 문장 전부 */
export function allCopy(o: MidyearOutcome): string[] {
  // 빈 칸 안내 — 칸마다 그 칸만 비운 경우의 문장
  const filled = Object.fromEntries(INPUT_FIELDS.map((f) => [f.key, '0'])) as Record<MoneyField, string>;
  const missing = INPUT_FIELDS.map((f) => firstMissing({ ...filled, [f.key]: '' })).filter((m): m is string => m !== null);
  const lines = [
    ...headline(o), ...NOTICE, `${HOMETAX_LINK.text}${HOMETAX_LINK.after}`, ...SCOPE_ITEMS, ...SCOPE_STOP, ...LIMITS,
    ...INPUT_FIELDS.map((f) => f.label), ...INPUT_GUIDE, ...missing,
  ];
  if (o.kind === 'ok') lines.push(...whyLines(o.detail), ...effectLines(o.detail), ...formulaLines(o.detail));
  return lines;
}
