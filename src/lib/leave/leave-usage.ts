/**
 * 연차 사용분 — 반차·반반차·시간차 차감 단위.
 *
 * ⚠️ 법정 제도가 아니다. 근로기준법에는 「일」 단위만 있고,
 *    반차(0.5일)·반반차(0.25일)·시간차는 **취업규칙이나 노사 합의로 정하는 운영 방식**이다.
 *    그래서 이 모듈은 「맞다/틀리다」를 판정하지 않는다 — 회사가 정한 규칙을 받아
 *    **합계가 맞는지, 규칙에 없는 단위가 쓰였는지**만 본다.
 *
 * ⚠️ 시간단위 연차에 대한 행정해석 — 임금근로시간과-2819 (2021-12-11)
 *   "근로기준법 제62조에 … 시간 단위의 대체에 대해서는 규정하고 있지 않음 …
 *    1일 단위로 연차유급휴가를 대체하는 것이 법 취지에 부합한다"
 *   (같은 취지 임금근로시간과-647, 2021-03-22)
 *   → 시간차는 **법에 근거가 없고 행정해석이 부정적**이다. 실무에서 쓰더라도
 *     이 사실을 화면에 표시해야 한다. 우리가 "괜찮다"고 말하지 않는다.
 *     `HOURLY_LEAVE_CAUTION` 을 쓰는 쪽에서 반드시 노출한다.
 *
 * 시간 단위 환산의 함정
 *   1일 = 8시간이 기본이지만 사업장마다 소정근로시간이 다르다(단시간 근로자 특히).
 *   그래서 `hoursPerDay` 를 반드시 입력받는다. 기본값을 몰래 쓰지 않는다.
 */

/** 회사가 허용한 사용 단위 */
export interface UsageUnitPolicy {
  /** 1일로 치는 소정근로시간. 단시간 근로자는 8이 아니다 */
  hoursPerDay: number;
  allowHalf: boolean; // 반차 0.5
  allowQuarter: boolean; // 반반차 0.25
  allowHourly: boolean; // 시간차
  /** 시간차를 쓸 때 최소 단위(시간). 예: 1시간 단위만 허용 */
  hourlyIncrement?: number;
}

/** 시간차를 쓸 때 화면에 반드시 붙이는 고지 */
export const HOURLY_LEAVE_CAUTION =
  "시간 단위 연차는 근로기준법에 규정이 없고, 행정해석은 1일 단위 부여가 법 취지에 부합한다고 봅니다(임금근로시간과-2819, 2021-12-11). 취업규칙·노사합의로 운영하더라도 다툼의 여지가 있습니다.";

export type UsageKind = "full" | "half" | "quarter" | "hourly";

export interface UsageRecord {
  date: string;
  kind: UsageKind;
  /** kind === "hourly" 일 때만 의미 */
  hours?: number;
  note?: string;
}

export type UsageIssueCode =
  | "unit-not-allowed"
  | "hours-missing"
  | "hours-not-multiple"
  | "hours-exceed-day";

export interface UsageIssue {
  index: number;
  date: string;
  code: UsageIssueCode;
  message: string;
}

export interface UsageSummary {
  /** 일 단위로 환산한 총 사용일수 */
  totalDays: number;
  /** 시간차가 하나라도 있으면 true — 화면에서 HOURLY_LEAVE_CAUTION 을 띄운다 */
  needsHourlyCaution: boolean;
  byKind: Record<UsageKind, { count: number; days: number }>;
  /** 규칙에 어긋나는 기록 — 「틀렸다」가 아니라 「회사 규칙과 다르다」는 뜻이다 */
  issues: UsageIssue[];
}

const KIND_LABEL: Record<UsageKind, string> = {
  full: "종일",
  half: "반차",
  quarter: "반반차",
  hourly: "시간차",
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 사용 기록을 일 단위로 환산하고, 회사 규칙과 어긋나는 건을 뽑는다.
 *
 * 판정하지 않는 것: 그 사용이 적법했는지, 승인받았는지, 연차촉진 대상인지.
 */
export function summarizeUsage(
  records: UsageRecord[],
  policy: UsageUnitPolicy
): UsageSummary {
  const byKind: UsageSummary["byKind"] = {
    full: { count: 0, days: 0 },
    half: { count: 0, days: 0 },
    quarter: { count: 0, days: 0 },
    hourly: { count: 0, days: 0 },
  };
  const issues: UsageIssue[] = [];
  let totalDays = 0;

  records.forEach((r, index) => {
    let days = 0;

    if (r.kind === "full") {
      days = 1;
    } else if (r.kind === "half") {
      days = 0.5;
      if (!policy.allowHalf) {
        issues.push({
          index,
          date: r.date,
          code: "unit-not-allowed",
          message: "반차를 허용하지 않는 사업장인데 반차로 기록됐습니다",
        });
      }
    } else if (r.kind === "quarter") {
      days = 0.25;
      if (!policy.allowQuarter) {
        issues.push({
          index,
          date: r.date,
          code: "unit-not-allowed",
          message: "반반차를 허용하지 않는 사업장인데 반반차로 기록됐습니다",
        });
      }
    } else {
      // hourly
      if (!policy.allowHourly) {
        issues.push({
          index,
          date: r.date,
          code: "unit-not-allowed",
          message: "시간차를 허용하지 않는 사업장인데 시간 단위로 기록됐습니다",
        });
      }
      if (r.hours === undefined || r.hours === null || Number.isNaN(r.hours)) {
        issues.push({
          index,
          date: r.date,
          code: "hours-missing",
          message: "시간차인데 사용 시간이 없습니다 — 환산할 수 없습니다",
        });
      } else {
        if (r.hours > policy.hoursPerDay) {
          issues.push({
            index,
            date: r.date,
            code: "hours-exceed-day",
            message: `사용 시간 ${r.hours}시간이 1일 소정근로시간(${policy.hoursPerDay}시간)을 넘습니다`,
          });
        }
        const inc = policy.hourlyIncrement;
        if (inc && round2(r.hours % inc) !== 0) {
          issues.push({
            index,
            date: r.date,
            code: "hours-not-multiple",
            message: `${inc}시간 단위로만 쓸 수 있는데 ${r.hours}시간으로 기록됐습니다`,
          });
        }
        days = r.hours / policy.hoursPerDay;
      }
    }

    byKind[r.kind].count += 1;
    byKind[r.kind].days = round2(byKind[r.kind].days + days);
    totalDays = round2(totalDays + days);
  });

  return {
    totalDays,
    byKind,
    issues,
    needsHourlyCaution: records.some((r) => r.kind === "hourly"),
  };
}

export function usageKindLabel(kind: UsageKind): string {
  return KIND_LABEL[kind];
}

/** 화면에 "0.25일" 처럼 쓰기 위한 표기 */
export function formatDays(days: number): string {
  return Number.isInteger(days) ? `${days}일` : `${round2(days)}일`;
}
