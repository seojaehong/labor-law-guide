// 계산기 결과 블록의 글자 모델 — 화면(ResultBlock)과 시험이 같이 쓴다. React 를 쓰지 않는 순수 데이터다.
// 순서는 /exit 「확인용 추정」 띠를 기준으로 했다(261124):
//   상태 → 판정 문장 → 금액 → 산식 → 주의 → 근거 조문 → 기준일·확인일 → 한계 → 다음 할 일.
// 기준일은 코드에 있는 실제 값(rates.ts 의 from·checked, exit-worker-data 의 CHECKED)에서만 만든다. 값이 없으면 비운다.

import type { Rate } from '@/content/rates';

export interface ResultLink {
  label: string;
  href: string;
}

export interface ResultAmount {
  label: string;
  value: string;
  /** 금액 바로 아래 산식(줄마다) */
  note?: string[];
}

export interface ResultView {
  /** 맨 위 상태 — 「확인용 추정 · 확정 금액이 아닙니다」 */
  status: string;
  /** 판정 문장(첫 줄이 가장 굵다) */
  verdict: string[];
  /** 판정 아래 보조 줄(재직일수 등) */
  meta?: string[];
  amounts: ResultAmount[];
  /** 산식 한 줄(금액이 하나일 때) */
  formula?: string;
  /** 입력을 다시 볼 만한 경우의 주의 문장 — 계산은 그대로 한다 */
  warnings?: string[];
  /** 근거 조문(법제처 원문 링크) */
  basis: ResultLink[];
  /** 「2026년 최저임금 기준 · 확인 2026.10.28.」 — 코드에 근거 데이터가 없는 계산기는 빈 배열 */
  asOf: string[];
  /** 한계·면책 한 줄 */
  caveat?: string;
  /** 0원·해당 없음일 때 왜 그런지와 그다음 */
  nextNote?: string;
  /** 다음 할 일 링크 1~2개 */
  next: ResultLink[];
}

export const STATUS_ESTIMATE = '확인용 추정 · 확정 금액이 아닙니다';
export const STATUS_COMPARE = '확인용 비교 · 확정 판단이 아닙니다';
/** 계산하지 않는 상태(적용 대상 밖·범위 밖·멈춤) — 추정값처럼 보이지 않게 한 문구로 쓴다(261124) */
export const STATUS_STOP = '계산하지 않음 · 이 계산기가 다루는 범위 밖입니다';

export const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

/**
 * 정적 html 계산기(public/tools/*.html) 링크인가 — ?·# 뒤는 떼고 본다.
 * /tools/severance.html?weeklyHours=40&hoursChanged=1 도 Next <Link> 가 아니라 <a> 로 연다(261126 E3).
 */
export function isStaticHtmlHref(href: string): boolean {
  return href.split(/[?#]/)[0].endsWith('.html');
}

/** '2026-10-28' → '2026.10.28.' (exit-worker-data CHECKED 와 같은 모양) */
export function dotDate(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${y}.${m}.${d}.`;
}

/** 법제처 조문 주소 — 법령명은 띄어쓰기 없이, 조는 「제55조」 */
export function lawLink(label: string, law: string, article: string): ResultLink {
  return { label, href: `https://www.law.go.kr/법령/${law.replace(/\s/g, '')}/${article}` };
}

/** 최저임금 고시 한 줄 — 해는 고시의 적용 시작일(from)에서 읽는다. 오늘 날짜에서 만들지 않는다 */
export function minWageAsOf(rate: Pick<Rate, 'from' | 'value' | 'checked'>): string {
  return `${rate.from.slice(0, 4)}년 최저임금(시간당 ${won(rate.value)}) 기준 · 확인 ${dotDate(rate.checked)}`;
}
