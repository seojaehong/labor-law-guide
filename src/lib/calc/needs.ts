// 계산 도구 공통 형식 — 빠진 사실(needs)·가정한 값(assumptions). 상태어 표와 「이것이 아니다」 = docs/engine-needs-assumptions-261127.md
// 261127 재홍님 승인(대화형 방향 판정표 1단계). 규칙:
//   · needs 가 하나라도 남으면 결론 금액(amount 등)은 null 이다. 「같은 식으로 세면 ○○원」 같은 동반 금액도 내지 않는다.
//   · 결론(금액·지급 대상 여부)을 바꾸는 기본값은 assumptions 가 아니라 needs 로 보낸다.
//   · 해석이 갈리는 상태(주휴 joined-unclear 등)는 needs 가 아니다 — 사실을 더 물어도 결론이 나지 않으므로 상태 그대로 둔다.
//   · question 은 평가가 아니라 관찰할 수 있는 사실을 묻는다(「퇴직금 지급 대상인가요」 ×, 「근로계약서에 적힌 1주 근로시간」 ○).

/** 결론을 바꾸는데 입력에 없는 사실 — key = 입력 이름, question = 사용자에게 물을 말, why = 그 사실이 왜 결론을 바꾸나(근거 조문) */
export interface Need {
  key: string;
  question: string;
  why: string;
}

/** 입력이 없어 기본값으로 채운 값 — 결론(대상 여부)은 그대로이고 금액만 달라질 수 있는 것 */
export interface Assumption {
  key: string;
  value: string | number | boolean;
  note: string;
}
