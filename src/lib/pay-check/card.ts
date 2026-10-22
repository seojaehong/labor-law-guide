// 원본: ~/dev/pay-exception-check @3263456
// Result card (spec 화면 7): 관찰 → 근거 → 조건부 해석 → 필요한 자료 → 회사에 물어볼 문장.
// The wording never states a legal conclusion or an owed amount (spec §6).

import type { CheckResult, Status } from "./types";

export const STATUS_TEXT: Record<Status, string> = {
  MATCH: "대조 일치",
  POTENTIAL_MISMATCH: "어긋남 가능성",
  NEEDS_CONFIRMATION: "계산 기준 확인 필요",
  OUTSIDE_SCOPE: "범위 밖",
};

/** Words the card must never contain (spec §6, NOW.md 금지). */
export const FORBIDDEN = ["체불", "위법", "불법", "받을 수 있는 금액", "받을 돈", "승소", "적법", "문제없", "확률", "가능성이 높"];

export function forbiddenHits(text: string): string[] {
  return FORBIDDEN.filter((w) => text.includes(w));
}

export function renderCard(r: CheckResult): string {
  const lines = [`[${STATUS_TEXT[r.status]}] ${r.observation}`];
  if (r.grounds.length) lines.push("", "근거", ...r.grounds.map((g) => `- ${g}`));
  if (r.conditions.length) lines.push("", "이 결과가 달라지는 경우", ...r.conditions.map((g) => `- ${g}`));
  if (r.evidence_needed.length) lines.push("", "필요한 자료", ...r.evidence_needed.map((g) => `- ${g}`));
  if (r.required_question) lines.push("", "회사에 물어볼 문장", r.required_question);
  if (r.citations.length) lines.push("", `관련 조문: ${r.citations.join(" · ")}`);
  lines.push("", "이 결과는 입력하고 확인한 값의 대조이며 법률 판단이 아닙니다.");
  return lines.join("\n");
}
