// 일용근로소득 원천징수 계산기의 문장은 모두 여기서 만든다. 시험(tests/unit/calc-daily-worker-tax.test.ts)이 allCopy 전부를 금지어로 훑는다.
// 세액 계산 도구 공통 장치(261028) — 결과는 「예상」으로만 말하고, 대행이 아니라고 늘 적고, 결과 화면에서 따로 찾아오라고 권하지 않는다. 도구 이름·소개의 금지 낱말은 시험이 막는다.
// 끝수 순서(날마다 원 미만을 먼저 버리는지)는 원문으로 닫히지 않았다 — 값이 갈리면 두 값을 함께 말하고 확인하지 못했다고 밝힌다.
import { DAILY_WORKER_RULE as RULE, type DailyWorkerTaxResult, type Frac, type PaymentResult } from '@/lib/calc/daily-worker-tax';

export const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

/** n/d 원을 원 미만까지 그대로 — d 는 10의 거듭제곱(100·1000·10000) */
export function frac({ n, d }: Frac): string {
  const digits = Math.round(Math.log10(d));
  if (10 ** digits !== d) return won(n / d);
  const int = Math.floor(n / d);
  const rest = String(n % d).padStart(digits, '0').replace(/0+$/, '');
  return `${int.toLocaleString('ko-KR')}${rest ? `.${rest}` : ''}원`;
}
const milli = (m: number) => frac({ n: m, d: 1_000 });

const ded = won(RULE.deduction);
const ratePct = `${(RULE.rate[0] * 100) / RULE.rate[1]}%`;
const creditPct = `${(RULE.credit[0] * 100) / RULE.credit[1]}%`;

/** 첫 질문 — 일용근로자인지는 도구가 가리지 않고 이용자가 답한다. 제외 문구는 별지 제24호서식(3)(4) 작성방법 그대로 */
export const ELIGIBILITY_NOTE =
  '일용근로자는 근로를 제공한 날이나 시간에 따라 급여를 계산해 받는 사람입니다. 동일 고용주에게 3개월(건설공사 종사자는 1년) 이상 계속하여 고용되어 있는 근로자는 제외합니다(소득세법 제14조 제3항 제2호, 소득세법 시행령 제20조 제1항).';
export const ELIGIBILITY_YES = '일용근로자다';
export const ELIGIBILITY_NO = '3개월(건설공사 종사자는 1년) 이상 계속 고용되어 있다';
export const ELIGIBILITY_STOP = [
  '이 경우는 이 계산기가 계산하지 않습니다.',
  '일용근로자가 아니면 매달 근로소득 간이세액표로 소득세를 뗍니다. 한 달 급여에서 떼는 금액은 실수령액 계산기에서 볼 수 있습니다.',
];

/** 입력 칸 아래 안내 */
export const INPUT_GUIDE = [
  '한 번에 지급한 날들은 한 지급으로 묶어 넣습니다. 따로 지급했으면 「지급 더하기」로 지급마다 나눠 넣고, 매일 지급했으면 하루치를 한 지급으로 넣습니다. 같은 날 나눠 준 금액은 한 지급으로 넣습니다.',
  '일급에는 비과세를 뺀 금액을 넣습니다. 날마다 일급이 다르면 「일급이 다른 날 더하기」로 줄을 나눕니다. 총액을 일수로 나눈 평균을 넣으면 세액이 달라집니다.',
  '같은 날 두 곳 이상에서 일했으면 지급하는 곳마다 따로 계산합니다.',
];

/** 결과 아래 늘 붙는 고지 */
export const NOTICE = [
  '예상 금액입니다. 지급하는 곳이 실제로 뗀 금액과 대조합니다.',
  '세무대리·신고서 작성 대행이 아닙니다. 지급명세서나 신고서를 만들지 않습니다.',
];

/** 국세청 일용근로소득 안내 — 리서치에서 원문을 연 주소 */
export const NTS = {
  href: 'https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7863',
  text: '국세청 「일용근로소득」 안내',
  after: '에서 계산식과 소액부징수 예시를 한 번 더 볼 수 있습니다.',
} as const;

// 2026-10-29 홈택스 전체 메뉴를 확인했다 — 모의계산은 부가가치세·근로/종교인 세액비교·주택임대·양도·증여·상속·주세·퇴직소득 지급명세서·
// 종교인 연말정산·연말정산 자동계산뿐이고, 일용근로소득만 따로 계산하는 화면은 없다. 없는 메뉴 경로를 지어내지 않는다.
export const HOMETAX = {
  href: 'https://www.hometax.go.kr',
  text: '홈택스(첫 화면)',
  after: '에는 일용근로소득 원천징수만 따로 계산하는 모의계산 화면이 없습니다(2026. 10. 29. 메뉴 확인).',
} as const;

/** 끝수 — 계산 과정 접기에 늘 싣는다 */
export const ROUNDING_NOTE =
  '끝수 — 날별 세액은 원 미만까지 그대로 더하고, 지급 건 합계에서 10원 미만을 버립니다(국고금 관리법 제47조 제1항). 날마다 1원 미만을 먼저 버리고 더하는 방식으로 계산하면 지급 건마다 10원까지 다를 수 있는데, 어느 순서로 버리는지 정한 조문·서식은 확인하지 못했습니다. 두 값이 다르면 답에 함께 보여 줍니다. 지방소득세는 뗀 소득세의 10%에서 10원 미만을 버립니다(지방세법 제103조의13 제1항, 서식 예시 9,450원 → 940원).';

/** 그래서 생기는 일 */
export const CONSEQUENCES = [
  '매일 지급하면 1일분 세액으로, 여러 날분을 한 번에 지급하면 그 합계로 1,000원 미만인지 판단합니다(소득세법 시행규칙 별지 제24호서식(3)·(4) 작성방법, 국세청 「일용근로소득」 안내). 그래서 같은 일급·같은 일수라도 나눠 지급했는지에 따라 떼는 세금이 다를 수 있습니다.',
  '하루치만 지급하면 일급 187,037원까지는 세액이 1,000원 미만이라 떼지 않고, 187,038원부터 뗍니다(187,038원이면 1,000원). 일급이 15만원 이하인 날은 세액이 없습니다.',
  '일용근로소득은 종합소득과세표준을 계산할 때 합산하지 않습니다(소득세법 제14조 제3항 제2호). 지급할 때 떼는 원천징수로 끝납니다.',
  '1,000원 미만이라 떼지 않은 지급분도 일용근로소득 지급명세서에는 과세소득으로 적습니다. 지급명세서는 지급일이 속한 달의 다음 달 말일까지 내고, 12월 31일까지 지급하지 않은 소득은 다음 해 1월 31일까지 냅니다(별지 제24호서식(3)·(4) 작성방법).',
];

/** 이 계산기가 다루지 않는 것 */
export const NOT_COVERED = [
  '일용근로자인지 가리는 것 — 맨 위 질문에 답한 대로 계산합니다.',
  '고용보험·국민연금·건강보험 — 계산하지 않습니다. 고용보험의 일용근로자는 고용보험법이 따로 정한 개념이라 소득세법의 일용근로자와 같지 않습니다(행정해석 보험적용부-290, 2005. 1. 14.).',
  '비과세 소득을 가리는 것(생산직 일용근로자의 연장·야간·휴일근로수당 등, 소득세법 시행령 제17조) — 일급에는 비과세를 뺀 금액을 넣습니다.',
  '지급명세서 작성·제출과 원천세 신고·납부 — 서식을 만들지 않습니다.',
  '같은 날 두 곳 이상에서 일한 소득을 합치는 것 — 이 계산기는 지급하는 곳 한 곳 기준입니다.',
  '비거주자 — 거주자를 전제로 계산합니다.',
  '2018년 12월 31일 이전에 발생한 소득 — 1일 15만원 공제는 2019년 1월 1일 이후 발생한 소득분부터입니다(법률 제16104호 부칙 제1조·제2조 제1항).',
];

/** 계산 기준 상자 */
export const BASIS = [
  '소득세법 제14조 제3항 제2호, 시행령 제20조 제1항 — 일용근로자의 근로소득은 종합소득에 합산하지 않음(분리과세)',
  `소득세법 제47조 제2항·제3항 — 일용근로자의 근로소득공제는 1일 15만원, 일급이 그보다 적으면 일급만큼만 공제`,
  `소득세법 제129조 제1항 제4호 단서 — 원천징수세율 ${ratePct}`,
  `소득세법 제59조 제3항 — 근로소득세액공제는 산출세액의 ${creditPct}(제2항의 연간 한도는 걸리지 않음)`,
  '소득세법 제134조 제3항 — 지급할 때 근로소득공제·세율·세액공제를 적용해 원천징수. 일급이 날마다 다르면 날마다 계산해 더함(별지 제24호서식(3)·(4) 작성방법 「일급여액」)',
  '소득세법 제86조 제1호 — 원천징수세액 1천원 미만은 징수하지 않음. 지급할 때마다, 한 번에 지급한 날들의 합계로 판단(별지 제24호서식(3)·(4) 작성방법, 국세청 「일용근로소득」 안내)',
  '국고금 관리법 제47조 제1항 — 소득세 10원 미만 버림. 지방세법 제103조의13 제1항 — 지방소득세는 소득세의 10%, 10원 미만 버림(지방회계법 제55조, 서식 예시)',
  `2019년 1월 1일 이후 발생한 소득 기준(법률 제16104호 부칙 제1조·제2조 제1항), 조문 확인 ${RULE.checked.split('-').map(Number).join('. ')}.`,
];

/** 이 지급의 결과 한 줄 */
function settled(p: PaymentResult): string {
  if (p.milli === 0) return '세액 0원(일급이 1일 15만원 이하)';
  if (p.small) return `세액 ${milli(p.milli)} → 1,000원 미만이라 0원`;
  return `소득세 ${won(p.incomeTax)}, 지방소득세 ${won(p.localTax)}`;
}

function floorAlt(p: PaymentResult): string {
  return p.dailyFloor.small
    ? '1,000원 미만이라 0원'
    : `소득세 ${won(p.dailyFloor.incomeTax)}, 지방소득세 ${won(p.dailyFloor.localTax)}`;
}

const altDiffers = (p: PaymentResult) => p.incomeTax !== p.dailyFloor.incomeTax || p.localTax !== p.dailyFloor.localTax;

/** 지급 건마다 한 줄 — 답 카드 아래 목록 */
export function paymentLine(p: PaymentResult, i: number): string {
  const alt = altDiffers(p) ? ` (날마다 1원 미만을 먼저 버리면 ${floorAlt(p)})` : '';
  return `지급 ${i + 1} — ${p.days.length}일분 ${won(p.gross)}: ${settled(p)}${alt}`;
}

/** 답 문장 */
export function headline(r: DailyWorkerTaxResult): string[] {
  const lines: string[] = [];
  if (r.payments.length > 1) {
    lines.push(
      `지급 ${r.payments.length}건의 예상 원천징수 소득세는 모두 ${won(r.incomeTax)}, 지방소득세는 ${won(r.localTax)}입니다.`,
      '1,000원 미만인지는 지급 건마다 따로 봅니다(소득세법 제86조 제1호).',
    );
  } else {
    const p = r.payments[0];
    if (p.incomeTax > 0) lines.push(`예상 원천징수 소득세는 ${won(p.incomeTax)}, 지방소득세는 ${won(p.localTax)}입니다.`);
    else if (p.small) lines.push('예상 원천징수 소득세는 0원입니다.', `이번 지급분 세액 ${milli(p.milli)}이 1,000원 미만이라 징수하지 않습니다(소득세법 제86조 제1호).`);
    else lines.push('예상 원천징수 소득세는 0원입니다.', '일급이 모두 1일 근로소득공제 15만원 이하라 과세표준이 0원입니다(소득세법 제47조 제2항·제3항).');
  }
  if (r.differs) {
    lines.push(
      `날마다 1원 미만을 먼저 버리고 더하면 소득세 ${won(r.dailyFloor.incomeTax)}, 지방소득세 ${won(r.dailyFloor.localTax)}입니다. 어느 순서로 버리는지 정한 조문·서식을 확인하지 못해 두 값을 함께 보여 줍니다.`,
    );
  }
  return lines;
}

/** 접어 둔 계산 과정 */
export function formulaLines(r: DailyWorkerTaxResult): string[] {
  const lines = [
    `1일 세액 = (일급 − 1일 근로소득공제 ${ded}) × ${ratePct} − 그 산출세액의 ${creditPct}(근로소득세액공제) = (일급 − ${ded}) × 2.7%`,
  ];
  const multi = r.payments.length > 1;
  r.payments.forEach((p, i) => {
    const pre = multi ? `지급 ${i + 1} · ` : '';
    // 같은 일급의 날은 한 줄로 — 1일 세액은 일급으로만 정해진다
    const groups = new Map<number, { d: PaymentResult['days'][number]; n: number }>();
    for (const d of p.days) {
      const g = groups.get(d.wage);
      if (g) g.n += 1;
      else groups.set(d.wage, { d, n: 1 });
    }
    for (const { d, n } of groups.values()) {
      const days = n > 1 ? ` × ${n}일` : '';
      if (d.taxBase === 0) {
        lines.push(`${pre}일급 ${won(d.wage)}${days} — 1일 공제 ${ded} 이하라 과세표준 0원, 1일 세액 0원(소득세법 제47조 제3항)`);
        continue;
      }
      const total = n > 1 ? ` → ${milli(d.milli)} × ${n}일 = ${milli(d.milli * n)}` : '';
      lines.push(
        `${pre}일급 ${won(d.wage)}${days} — 과세표준 = ${won(d.wage)} − ${ded} = ${won(d.taxBase)} → 산출세액 = ${won(d.taxBase)} × ${ratePct} = ${frac(d.computed)} → 근로소득세액공제 = ${frac(d.computed)} × ${creditPct} = ${frac(d.credit)} → 1일 세액 = ${milli(d.milli)}${total}`,
      );
    }
    if (p.milli === 0) lines.push(`${pre}세액 합계 0원 — 뗄 소득세가 없습니다.`);
    else if (p.small) lines.push(`${pre}세액 합계 ${milli(p.milli)} → 1,000원 미만이라 징수하지 않음(소득세법 제86조 제1호) = 0원`);
    else {
      lines.push(
        `${pre}세액 합계 ${milli(p.milli)} → 1,000원 이상이라 징수, 10원 미만 버림 = 소득세 ${won(p.incomeTax)}(국고금 관리법 제47조 제1항)`,
        `${pre}지방소득세 = ${won(p.incomeTax)} × 10% = ${won(p.incomeTax / 10)} → 10원 미만 버림 ${won(p.localTax)}(지방세법 제103조의13 제1항)`,
      );
    }
    if (altDiffers(p)) {
      lines.push(`${pre}날마다 1원 미만을 먼저 버리면 — 1일 세액 원 미만 버림 합계 ${won(p.dailyFloor.sum)} → ${floorAlt(p)}`);
    }
  });
  if (multi) lines.push(`합계 — 소득세 ${won(r.incomeTax)}, 지방소득세 ${won(r.localTax)}`);
  lines.push(ROUNDING_NOTE);
  return lines;
}

/** 시험용 — 한 결과에서 화면에 나올 수 있는 문장 전부 */
export function allCopy(r: DailyWorkerTaxResult): string[] {
  return [
    ...headline(r),
    ...r.payments.map(paymentLine),
    ...formulaLines(r),
    ...CONSEQUENCES,
    ...NOT_COVERED,
    ...NOTICE,
    ...INPUT_GUIDE,
    ...BASIS,
    ...ELIGIBILITY_STOP,
    ELIGIBILITY_NOTE,
    ELIGIBILITY_YES,
    ELIGIBILITY_NO,
    NTS.text,
    NTS.after,
    HOMETAX.text,
    HOMETAX.after,
  ];
}
