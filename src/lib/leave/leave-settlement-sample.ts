/**
 * 퇴직 정산 데모용 **가상** 사례.
 *
 * 🔒 실제 개인정보가 아니다. 외부 파일을 받지 않고 이 고정 표본만 읽는다.
 *
 * 사례 1은 고용노동부 행정해석 **근로기준과-5802(2009-12-31)** 본문의 사실관계를
 * 그대로 옮긴 것이다. 그 해석이 제시한 답(입사일 기준 79일, 정산 26일)이 있어
 * 화면에서 "우리 계산 = 해석 답"임을 보여줄 수 있다.
 */

export interface SettlementCase {
  id: string;
  label: string;
  hireDate: string;
  endDate: string;
  /** 회사가 회계연도 기준으로 실제 부여한 누계 */
  fiscalGrantedTotal: number;
  /** 이미 사용했거나 수당으로 지급한 누계 */
  usedOrPaidTotal: number;
  /** 취업규칙에 「퇴직 시 입사일 기준 재산정」 규정이 있는가 (없으면 확인 불가로 판정) */
  hasRecalcClause?: boolean;
  /** 이 사례가 무엇을 보여주는지 */
  point: string;
  /** 출처가 있으면 표시 */
  source?: string;
}

export const SETTLEMENT_CASES: SettlementCase[] = [
  {
    id: "moel-5802",
    label: "회계연도 운영 · 5년 재직 후 퇴사",
    hireDate: "2004-08-01",
    endDate: "2009-09-30",
    fiscalGrantedTotal: 69,
    usedOrPaidTotal: 53,
    point:
      "입사일 기준이 더 많은 경우. 차액을 미사용수당으로 정산해야 한다.",
    source: "고용노동부 근로기준과-5802 (2009-12-31) 본문 사실관계",
  },
  {
    id: "fiscal-favourable",
    label: "같은 사람이 두 달 먼저 퇴사했다면",
    hireDate: "2004-08-01",
    endDate: "2009-07-30",
    fiscalGrantedTotal: 69,
    usedOrPaidTotal: 69,
    hasRecalcClause: false,
    point:
      "회계연도 부여분이 더 많은 경우. 취업규칙에 재산정 규정이 없으면 그대로 유지된다.",
    source: "같은 해석 후단 — 입사일기준 62일 / 회계연도기준 69일",
  },
  {
    id: "mid-year-joiner",
    label: "(가상) 연도 중 입사 · 3년 재직",
    hireDate: "2022-05-10",
    endDate: "2026-09-30",
    fiscalGrantedTotal: 44,
    usedOrPaidTotal: 40,
    point: "연도 중 입사자는 회계연도 첫해 비례부여 때문에 차이가 나기 쉽다.",
  },
];
