/**
 * A1~A4 화면 데모용 **가상** 표본.
 * 🔒 실제 개인정보가 아니다. 외부 파일을 받지 않고 이 고정 표본만 읽는다.
 */

import type { UsageRecord, UsageUnitPolicy } from "./leave-usage";
import type { PromotionScheduleInput } from "./leave-promotion";

/* A1 — 사용 단위 */
export const DEMO_USAGE_POLICY: UsageUnitPolicy = {
  hoursPerDay: 8,
  allowHalf: true,
  allowQuarter: true,
  allowHourly: true,
  hourlyIncrement: 1,
};

export const DEMO_USAGE_RECORDS: UsageRecord[] = [
  { date: "2026-03-04", kind: "full", note: "종일" },
  { date: "2026-04-17", kind: "half", note: "오후 반차" },
  { date: "2026-05-22", kind: "quarter", note: "반반차" },
  { date: "2026-06-11", kind: "hourly", hours: 2, note: "병원" },
  { date: "2026-07-03", kind: "hourly", hours: 1.5, note: "1시간 단위 규칙 위반 사례" },
  { date: "2026-08-19", kind: "hourly", note: "시간이 누락된 사례" },
];

/* A2 — 출근율 */
export const DEMO_ATTENDANCE = [
  { name: "가상직원 A", hireDate: "2019-03-02", ratio: 0.93, point: "80% 이상 — 정상 발생" },
  { name: "가상직원 B", hireDate: "2019-03-02", ratio: 0.72, point: "80% 미만 — §60② 적용, 일수 미산출" },
  { name: "가상직원 C", hireDate: "2019-03-02", ratio: undefined, point: "출근율 미입력 — 확인 불가" },
  { name: "가상직원 D", hireDate: "2026-03-01", ratio: 0.5, point: "1년 미만 — 출근율과 무관" },
];

/* A3 — 회계연도 첫해 비례부여 */
export const DEMO_PRORATED = [
  { hireDate: "2024-07-01", point: "최영우 교재 산정 예 — 15일 × 6/12" },
  { hireDate: "2024-01-01", point: "연초 입사 — 12개월" },
  { hireDate: "2024-11-01", point: "연말 입사 — 2개월" },
];

/* A4 — 촉진 일정 */
export const DEMO_PROMOTION: { label: string; input: PromotionScheduleInput; point: string }[] = [
  {
    label: "1년 이상 연차 · 기록 있음",
    input: {
      usagePeriodEnd: "2026-12-31",
      kind: "annual-15plus",
      firstNoticeSentOn: "2026-07-02",
      firstNoticeReceivedOn: "2026-07-06",
      workerRepliedOn: "2026-07-14",
      secondNoticeSentOn: "2026-10-20",
    },
    point: "응답기한은 수령일(7-06) 기준 10일입니다. 발송일로 세지 않습니다.",
  },
  {
    label: "수령일이 없는 경우",
    input: {
      usagePeriodEnd: "2026-12-31",
      kind: "annual-15plus",
      firstNoticeSentOn: "2026-07-02",
    },
    point: "수령일이 없으면 기한을 만들지 않고 「확인 불가」로 둡니다.",
  },
  {
    label: "1년 미만 월단위 연차",
    input: { usagePeriodEnd: "2026-12-31", kind: "monthly-under-1year" },
    point: "§61②는 §61①과 기간이 달라 「지원 범위 밖」입니다. 추정하지 않습니다.",
  },
];
