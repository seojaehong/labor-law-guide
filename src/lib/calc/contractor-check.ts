// 3.3% 계약 점검 — 「프리랜서(사업소득 3.3%)로 계약했는데 근로자인가」를 단정하지 않고 두 가지를 보인다.
//
// ① 근로자성 요소 대조 — 대법원 2006. 12. 7. 선고 2004다29736 판결 【이유】 1. 가.의 요소를 질문으로 묻고,
//   항목마다 「근로자로 볼 요소가 있습니다 / 적습니다」만 낸다. 점수·개수·합계는 만들지 않는다(결과 타입에 그런 칸이 없다).
//   판결은 요소들을 「종합하여 판단」하라고 했다 — 입력 몇 개로 근로자인지 정할 수 없다.
//   판결 단서 항목(light — Q6 고정급 · Q7 근로소득세·4대보험): 첫 문단 단서가 「사용자가 경제적으로 우월한 지위를 이용하여
//   임의로 정할 여지가 크다」고 든 세 사정(고정급·근로소득세 원천징수·사회보장)이다. 근로자 쪽 답이면 「있습니다」,
//   반대쪽 답이어도 「적습니다」로 쓰지 않고 단서를 요약한 문장을 낸다.
//   두 근거를 나란히 보는 항목(split — Q5 보수 · Q8 취업규칙): 반대쪽 답을 「적습니다」 하나로 맺지 않고, 판례 요소와 반대쪽 근거를 함께 쓴다.
//   - Q8: 첫 문단은 취업규칙 적용을 업무 지정·지휘·감독과 한 묶음의 종속성 요소로 들고 단서에는 넣지 않았다. 포섭 문단은 취업규칙
//     미적용을 다른 사정과 함께 「실질적인 노무 제공 실태와 부합하지 않는 계약서 문언에 불과하거나 … 사실상 임의로 정할 수 있는
//     사정에 불과하여」 근로자성을 뒤집기에 부족하다고 했다 — 어느 쪽인지 가르지 않은 그 사안의 포섭이지 일반 법리가 아니다.
//     근로개선정책과-1333 도 「② 취업규칙 적용 여부」를 판단 요소로 두고 다만 절에는 근로소득세·사회보장만 든다.
//     판결 단서 항목으로 둘지 「적습니다」로 둘지는 제품 결정이 남아 있다(PR #126 미확정 1, 검토 2·10).
//   - Q5: 판결은 「보수의 성격이 근로 자체의 대상적 성격인지」를 요소로 들고, 포섭에서 수입 증감과 관계없는 시간당 보수를
//     근로자 쪽 사정으로 썼다. 근로기준정책과-2947 은 「매출 대비 일정 비율(30%)」 지급을 「사용자가 경제적으로 우월한 지위를
//     이용하여 임의로 정할 여지가 큰 사항」으로 보아 그것만으로 근로자성을 부정할 수 없다고 했다(검토 7·8). 「예」 쪽은 「있습니다」.
//   판결의 다른 두 요소(이윤 창출·손실 위험을 스스로 안는지, 계속성·전속성)는 따로 묻지 않는다 — 화면이 그렇다고 밝히고 원문을 싣는다.
//
// ② 금액 — 같은 월 보수를 사업소득으로 3.3% 뗄 때와 근로소득(4대보험 근로자 몫 + 간이세액)으로 뗄 때의 예상 실수령.
//   근로소득 쪽은 take-home-pay.ts 를 그대로 쓴다(공제대상가족 수만 받고 자녀 0·비율 100%·감면 없음).
//   사업소득 쪽:
//   - 원천징수 대상: 소득세법 §127①3호 → 시행령 §184①(부가가치세법 §26①5호·15호 용역). 세율: §129①3호 「100분의 3」.
//     외국인 직업운동가 100분의 20(같은 호 단서)은 다루지 않는다.
//   - 지방소득세: 지방세법 §103조의13① 「원천징수하는 소득세 … 의 100분의 10」.
//   - 과세 대상은 지급액 전액이다. 식대 비과세(소득세법 §12 3호 러목)는 근로소득 비과세라 사업소득에는 없다.
//   - 끝수: 소득세 = 지급액 × 3/100 의 10원 미만 버림(국고금 관리법 §47① 「10원 미만의 끝수 … 계산하지 아니하고」).
//     지방소득세 = 버린 소득세 × 10/100 의 10원 미만 버림(지방회계법 §55 는 「계산하지 아니할 수 있고」 임의 규정 —
//     take-home-pay.ts 와 같이 버린다).
//   - 소액 부징수(소득세법 §86 1호, 1천원 미만)는 적용하지 않는다. §86 1호 괄호가 「같은 항 제3호의 원천징수대상 사업소득 중
//     대통령령으로 정하는 사업소득」을 빼고, 시행령 §149조의3 이 「「부가가치세법」 제26조제1항제15호에 따른 인적 용역을
//     계속적ㆍ반복적으로 공급하고 그 대가로 받은 소득」으로 정했다(법률 제19933호 부칙 §1 2호·§6, 대통령령 제34265호 부칙
//     §1 1호 — 2024. 7. 1. 이후 지급분부터). 이 도구는 계속 일하는 3.3% 계약을 전제로 하므로 990원이어도 뗀다.
//     그 전 지급분·15호 밖 소득은 도구 밖이다(분기를 두지 않는다).
//
// 정수 원 단위. 월 보수는 10억원까지(take-home-pay.ts 와 같은 한도 — 곱이 2^53 안에 든다). BigInt 는 쓰지 않는다.
import { calcTakeHomePay, takeHomeRatesOn, type TakeHomeRates, type TakeHomeResult } from './take-home-pay';

export type Answer = 'yes' | 'no' | 'unknown';
export type QuestionId = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'Q5' | 'Q6' | 'Q7' | 'Q8';
export type Answers = Partial<Record<QuestionId, Answer>>;

export interface Question {
  id: QuestionId;
  /** 화면 질문 */
  text: string;
  /** 판결 요소(요약 — 인용부호에 넣지 않는다) */
  element: string;
  yesLabel: string;
  noLabel: string;
  /** 「예」가 근로자 쪽인가. Q3(비품)·Q4(대행)는 「예」가 독립 쪽이다 */
  yesIsWorker: boolean;
  /** 판결 첫 문단 단서가 사용자가 임의로 정할 여지가 크다고 든 사정(고정급·근로소득세·사회보장) */
  light: boolean;
  /** 반대쪽 답에 판례 요소와 반대쪽 근거(포섭 문단·행정해석)를 나란히 쓰는 항목 */
  split: boolean;
}

export const QUESTIONS: readonly Question[] = [
  { id: 'Q1', text: '회사가 업무 내용을 정하고, 일하는 동안 지휘·감독을 하나요?', element: '업무 내용 지정, 업무 수행 과정의 지휘·감독', yesLabel: '예', noLabel: '아니요', yesIsWorker: true, light: false, split: false },
  { id: 'Q2', text: '회사가 근무시간과 근무장소를 정하고, 그에 매여 일하나요?', element: '근무시간·근무장소 지정과 구속', yesLabel: '예', noLabel: '아니요', yesIsWorker: true, light: false, split: false },
  { id: 'Q3', text: '일에 쓰는 비품·원자재·작업도구를 본인이 갖추나요?', element: '비품·원자재·작업도구 소유(독립하여 자신의 계산으로 사업을 하는지)', yesLabel: '예, 본인이 갖춘다', noLabel: '아니요, 회사 것을 쓴다', yesIsWorker: false, light: false, split: false },
  { id: 'Q4', text: '다른 사람을 써서 내 일을 대신하게 할 수 있나요?', element: '제3자를 고용해 업무를 대행하게 할 수 있는지', yesLabel: '예, 대신하게 할 수 있다', noLabel: '아니요, 본인이 해야 한다', yesIsWorker: false, light: false, split: false },
  { id: 'Q5', text: '보수가 일한 시간·일수 자체의 대가로 정해지나요?', element: '보수가 근로 자체의 대가인지', yesLabel: '예, 시간·일수로 정해진다', noLabel: '아니요, 성과·매출·이윤에 따라 달라진다', yesIsWorker: true, light: false, split: true },
  { id: 'Q6', text: '기본급이나 고정급이 정해져 있나요?', element: '기본급·고정급', yesLabel: '예', noLabel: '아니요', yesIsWorker: true, light: true, split: false },
  { id: 'Q7', text: '보수에서 근로소득세를 떼거나, 4대보험에 직장가입자로 들어 있나요?', element: '근로소득세 원천징수, 사회보장제도에서 근로자로 인정받는지', yesLabel: '예', noLabel: '아니요, 3.3%를 떼고 직장가입이 없다', yesIsWorker: true, light: true, split: false },
  { id: 'Q8', text: '회사 취업규칙·복무규정을 적용받나요?', element: '취업규칙·복무(인사)규정 적용', yesLabel: '예', noLabel: '아니요', yesIsWorker: true, light: false, split: true },
];

/** worker = 근로자로 볼 요소가 있음 · few = 적음 · light = 판결 단서 항목의 반대쪽 답 · split = 두 근거를 나란히 쓰는 반대쪽 답 · unknown = 답 없음 */
export type Reading = 'worker' | 'few' | 'light' | 'split' | 'unknown';

export interface ItemCheck {
  id: QuestionId;
  question: Question;
  answer: Answer;
  reading: Reading;
}

export function checkItems(answers: Answers): ItemCheck[] {
  return QUESTIONS.map((q) => {
    const answer = answers[q.id] ?? 'unknown';
    const reading: Reading =
      answer === 'unknown' ? 'unknown'
        : (answer === 'yes') === q.yesIsWorker ? 'worker'
          : q.light ? 'light' : q.split ? 'split' : 'few';
    return { id: q.id, question: q, answer, reading };
  });
}

/**
 * 판결 원문 — 법제처 판례 전문(판례일련번호 194093) 【이유】 1. 가.에서 글자 그대로. 판결요지[1]은 【이유】와 세 군데가 달라
 * (「여기에서 종속적인」·「안고 있는지, 보수의」·「여지가 크기 때문에,」) 쓰지 않는다. 문장 안의 참조 괄호도 빼지 않는다.
 * 2026-10-29 DRF XML 과 글자 단위로 대조했다.
 */
export const SOURCES = {
  standard: {
    cite: '대법원 2006. 12. 7. 선고 2004다29736 판결',
    where: '이유 1. 가. 첫 문단',
    quote: '근로기준법상의 근로자에 해당하는지 여부는 계약의 형식이 고용계약인지 도급계약인지보다 그 실질에 있어 근로자가 사업 또는 사업장에 임금을 목적으로 종속적인 관계에서 사용자에게 근로를 제공하였는지 여부에 따라 판단하여야 하고, 위에서 말하는 종속적인 관계가 있는지 여부는 업무 내용을 사용자가 정하고 취업규칙 또는 복무(인사)규정 등의 적용을 받으며 업무 수행 과정에서 사용자가 상당한 지휘·감독을 하는지, 사용자가 근무시간과 근무장소를 지정하고 근로자가 이에 구속을 받는지, 노무제공자가 스스로 비품·원자재나 작업도구 등을 소유하거나 제3자를 고용하여 업무를 대행케 하는 등 독립하여 자신의 계산으로 사업을 영위할 수 있는지, 노무 제공을 통한 이윤의 창출과 손실의 초래 등 위험을 스스로 안고 있는지와 보수의 성격이 근로 자체의 대상적 성격인지, 기본급이나 고정급이 정하여졌는지 및 근로소득세의 원천징수 여부 등 보수에 관한 사항, 근로 제공 관계의 계속성과 사용자에 대한 전속성의 유무와 그 정도, 사회보장제도에 관한 법령에서 근로자로서 지위를 인정받는지 등의 경제적·사회적 여러 조건을 종합하여 판단하여야 한다(대법원 1994. 12. 9. 선고 94다22859 판결 등 참조). 다만, 기본급이나 고정급이 정하여졌는지, 근로소득세를 원천징수하였는지, 사회보장제도에 관하여 근로자로 인정받는지 등의 사정은 사용자가 경제적으로 우월한 지위를 이용하여 임의로 정할 여지가 크다는 점에서 그러한 점들이 인정되지 않는다는 것만으로 근로자성을 쉽게 부정하여서는 안 된다.',
  },
  applied: {
    cite: '대법원 2006. 12. 7. 선고 2004다29736 판결',
    where: '이유 1. 가. 사업소득세를 원천징수당한 사정을 다룬 문단',
    quote: '그리고 비록 기록상 알 수 있는 다음과 같은 사정들, 즉 원·피고 사이에 매년 ‘강의용역제공계약서’라는 이름의 계약서가 작성되었고, 그 계약서에는 수강생 인원이 10명 미만인 경우 강의용역 제공을 거부할 수 있고 다른 학원에 강의를 나가더라도 학원측이 이의를 제기하지 못하도록 되어 있으며, 일반 직원들에게 적용되는 취업규칙·복무(인사)규정·징계 규정 등의 적용을 받지 않았고 보수에 고정급이 없으며 부가가치세법상 사업자등록을 하고 근로소득세가 아닌 사업소득세를 원천징수당하였으며 직장의료보험이 아닌 지역의료보험에 가입한 사정이 있다 하더라도, 이러한 사정들은 실질적인 노무 제공 실태와 부합하지 않는 계약서 문언에 불과하거나 사용자인 피고가 경제적으로 우월한 지위에서 사실상 임의로 정할 수 있는 사정에 불과하여 원고들의 근로자성을 뒤집는 사정이라고 보기에는 부족하다.',
  },
} as const;

// ── 금액 ──

const MAX_PAY = 1_000_000_000;
/** 0 이상 정수의 몫(나머지 버림) */
const div = (a: number, d: number) => (a - (a % d)) / d;
/** 10원 미만 버림 */
const f10 = (n: number) => n - (n % 10);
const isWon = (n: number | undefined) => n !== undefined && Number.isInteger(n) && n >= 0;

export interface BusinessWithholding {
  pay: number;
  incomeTax: number;
  localTax: number;
  takeHome: number;
}

/** 사업소득 원천징수(3% + 지방 0.3%) — 위 머리 주석의 끝수·소액 부징수 예외 */
export function calcBusinessWithholding(pay: number): BusinessWithholding {
  if (!isWon(pay) || pay === 0 || pay > MAX_PAY) throw new Error('월 보수를 확인해 주세요(원 단위, 10억원까지)');
  const incomeTax = f10(div(pay * 3, 100));
  const localTax = f10(div(incomeTax * 10, 100));
  return { pay, incomeTax, localTax, takeHome: pay - incomeTax - localTax };
}

export interface MoneyInput {
  /** 월 보수(지급 총액, 원) */
  pay: number;
  /** 그중 식대 — 근로소득 쪽에서만 비과세(월 한도까지) */
  meal?: number;
  /** 공제대상가족 수(본인 포함) — 근로소득 간이세액표 칸 */
  family: number;
}

/** 근로소득 쪽: ok·aboveTable = take-home-pay 결과 · notComputed = 그 계산이 멈춘 이유 · noRates = 기준일 요율 없음 */
export type WageColumn = TakeHomeResult | { status: 'notComputed'; reason: string } | { status: 'noRates' };

export interface MoneyResult {
  business: BusinessWithholding;
  wage: WageColumn;
  /** 근로소득 쪽에 쓴 요율(산식 표시용). 기준일 줄이 없으면 null */
  rates: TakeHomeRates | null;
}

/**
 * date(YYYY-MM-DD) 요율로 같은 보수의 두 실수령을 낸다.
 * 월 보수가 틀리면 두 쪽 다 낼 수 없어 멈춘다(throw). 식대·공제대상가족 수는 근로소득 쪽에만 쓰므로, 틀려도 3.3% 쪽은 내고
 * 근로소득 쪽만 notComputed 로 둔다(PR #126 검토 1·16). 이유 문장은 이 도구의 입력 이름(월 보수·식대)으로 쓴다(검토 3).
 */
export function compareTakeHome(input: MoneyInput, date: string): MoneyResult {
  const business = calcBusinessWithholding(input.pay);
  const rates = takeHomeRatesOn(date);
  return { business, wage: wageColumn(input, rates), rates };
}

function wageColumn(input: MoneyInput, rates: TakeHomeRates | null): WageColumn {
  const meal = input.meal ?? 0;
  const stop = (reason: string): WageColumn => ({ status: 'notComputed', reason });
  if (!isWon(meal)) return stop('식대를 확인해 주세요.');
  if (meal > input.pay) return stop('식대가 월 보수보다 많습니다.');
  if (!Number.isInteger(input.family) || input.family < 1) return stop('공제대상가족 수를 확인해 주세요(본인 포함 1명 이상).');
  if (!rates) return { status: 'noRates' };
  // 식대 비과세는 월 한도까지(소득세법 §12 3호 러목) — 보수가 한도 이하이고 식대가 보수와 같을 때만 과세 급여가 없다
  if (Math.min(meal, rates.mealNonTaxCap) >= input.pay) {
    return stop(`식대가 월 보수와 같고 비과세 한도(월 ${rates.mealNonTaxCap.toLocaleString('ko-KR')}원) 안이라 과세 급여가 없습니다.`);
  }
  try {
    return calcTakeHomePay({ pay: input.pay, meal, family: input.family }, rates);
  } catch (e) {
    // 입력은 위에서 걸렀다 — 남는 것은 국민연금 기준소득월액·건강보험 하한 때문에 공제가 보수보다 큰 경우다.
    // 실수령액 계산기 문장은 「월 급여」라 이 도구 말로 바꾼다. 다른 이유가 생기면 그 문장을 그대로 낸다
    const m = (e as Error).message;
    return stop(/^공제 합계/.test(m) ? '공제 합계(국민연금·건강보험 하한 포함)가 월 보수보다 많습니다. 금액을 원 단위로 넣었는지 확인해 주세요.' : m);
  }
}
