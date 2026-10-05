/**
 * 연차 사용 촉진 — **일정 계산 보조**. 적법성은 판정하지 않는다.
 *
 * 근로기준법 제61조는 **두 절차를 구분한다.**
 *   ① 제61조 제1항 — 1년 이상 발생한 연차(15일+)
 *        사용기간 끝 6개월 전 기준 10일 이내: 미사용일수 통지 + 사용시기 지정 요구
 *        근로자가 10일 이내 미통보 → 사용기간 끝 2개월 전까지 사용자가 시기 지정 통보
 *   ② 제61조 제2항 — 계속근로 1년 미만자의 월단위 연차
 *        기간이 다르다. **①의 6개월·2개월을 그대로 쓰면 안 된다.**
 *
 * 🔒 제우스 출시 게이트 (2026-09-23) — 아래를 하면 출시 차단
 *   · 1년 미만 발생분에 일반 6개월·2개월 규칙 적용 → 별도 분기 없으면 「지원 범위 밖」
 *     (2026-09-23 최영우 교재 표로 근거를 확보해 §61② 분기를 구현했다)
 *   · 사용기간 종료일·대상 유형이 불명확한데 확정 일정 출력
 *   · 근로자 응답기한을 촉구 「수령일」이 아니라 발송일로 계산
 *   · 1차 촉구를 마감일 하나만 표시 (허용 기간의 시작·끝을 함께)
 *   · 기록 없음 → 미실시, 날짜 일치 → 적법·촉진 완료·수당 면제로 전환
 *   · 정산일수 차감에 연결
 *   허용 등급은 **「일정 대조: 일치」까지**. 「촉진: 일치」는 쓰지 않는다.
 */

export type LeaveKind = "annual-15plus" | "monthly-under-1year";

export interface PromotionScheduleInput {
  /** 그 연차의 사용기간 종료일 (예: 회계연도 운영이면 12-31) */
  usagePeriodEnd: string;
  /** 어떤 연차인가 — 1년 미만 월단위는 기간이 다르다 */
  kind: LeaveKind;
  /** 1차 촉구를 실제로 보낸 날 (있으면 대조한다) */
  firstNoticeSentOn?: string;
  /** 근로자가 1차 촉구를 **받은** 날 — 응답기한은 수령일 기준이다 */
  firstNoticeReceivedOn?: string;
  /** 근로자가 사용시기를 통보한 날 */
  workerRepliedOn?: string;
  /** 사용자가 2차(시기 지정) 통보를 보낸 날 */
  secondNoticeSentOn?: string;
}

export type ScheduleStatus = "match" | "diff" | "unknown" | "out-of-scope";

export interface ScheduleWindow {
  label: string;
  /** 허용 기간 시작 — 제우스 요구: 마감일만 보여주지 않는다 */
  from: string | null;
  /** 허용 기간 끝 */
  to: string | null;
  /** 실제로 한 날 (입력이 있으면) */
  actual?: string;
  status: ScheduleStatus;
  note: string;
}

export interface PromotionScheduleResult {
  kind: LeaveKind;
  usagePeriodEnd: string;
  windows: ScheduleWindow[];
  /** 전체 대조 결과 — 「일정 대조」에 한정된 판정이다 */
  overall: ScheduleStatus;
  /** 화면에 반드시 붙는 한계 고지 */
  disclaimer: string;
}

/** 창들의 판정에서 전체 판정을 만든다. 하나라도 어긋나면 어긋난 것이다. */
function rollUp(ws: ScheduleWindow[]): ScheduleStatus {
  const st = ws.map((w) => w.status);
  return st.includes("diff") ? "diff" : st.includes("unknown") ? "unknown" : "match";
}

const DISCLAIMER =
  "입력한 사용기간 종료일과 대상 유형을 전제로 계산한 일정입니다. 서면·도달·실제 사용 보장 등 적법성은 확인하지 않았습니다.";

function parse(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  const t = new Date(d);
  t.setUTCDate(t.getUTCDate() + n);
  return t;
}
function addMonths(d: Date, n: number): Date {
  const t = new Date(d);
  const day = t.getUTCDate();
  t.setUTCDate(1);
  t.setUTCMonth(t.getUTCMonth() + n);
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return t;
}

/**
 * 촉진 일정 계산.
 *
 * 두 절차를 각각 구현한다 — §61①(1년 이상)과 §61②(1년 미만)는 기간이 다르다.
 * 근거는 최영우 교재 『연차사용촉진 절차(1.1~12.31 기준)』 표.
 * 어느 쪽이든 **적법성은 판정하지 않고 날짜만 대조**한다.
 */
export function buildPromotionSchedule(
  input: PromotionScheduleInput
): PromotionScheduleResult {
  const { usagePeriodEnd, kind } = input;

  if (!usagePeriodEnd) {
    return {
      kind,
      usagePeriodEnd,
      windows: [],
      overall: "unknown",
      disclaimer: DISCLAIMER,
    };
  }

  // ② 1년 미만 월단위 연차 — §61② (2020-03-31 신설)
  //
  // ★ 2026-09-23 — 최영우 교재 표로 근거를 확보해 구현했다.
  //   『연차사용촉진 절차(1.1~12.31 기준)』
  //     1년 미만 근무자 · 연차휴가 9일분 → 1차 10.1~10.10 (3개월 전, 10일간) · 2차 11.30 까지 (1개월 전)
  //                      연차휴가 2일분 → 1차 12.1~12.5  (1개월 전, 5일간)  · 2차 12.21 까지 (10일 전)
  //   앞의 9일은 최초 1년 근로가 끝나기 3개월 전, 그 뒤 발생한 2일은 1개월 전에 따로 촉구한다.
  //   (교재 원문에 "11.31"로 적혀 있으나 11월은 30일까지이므로 11-30 으로 둔다)
  const end = parse(usagePeriodEnd);

  if (kind === "monthly-under-1year") {
    const firstBatchFrom = addDays(addMonths(end, -3), 1); // 10.1
    const firstBatchTo = addDays(firstBatchFrom, 9); // 10.10
    const firstBatchSecondNotice = addMonths(end, -1); // 11.30
    const lateBatchFrom = addDays(addMonths(end, -1), 1); // 12.1
    const lateBatchTo = addDays(lateBatchFrom, 4); // 12.5 (5일간)
    const lateBatchSecondNotice = addDays(end, -10); // 12.21

    const sent = input.firstNoticeSentOn;
    const inFirstBatch =
      sent && parse(sent) >= firstBatchFrom && parse(sent) <= firstBatchTo;
    const inLateBatch =
      sent && parse(sent) >= lateBatchFrom && parse(sent) <= lateBatchTo;

    let windows: ScheduleWindow[];
    return {
      kind,
      usagePeriodEnd,
      windows: (windows = [
        {
          label: "1차 촉구 — 먼저 발생한 9일분 (3개월 전, 10일간)",
          from: fmt(firstBatchFrom),
          to: fmt(firstBatchTo),
          actual: sent,
          status: !sent ? "unknown" : inFirstBatch ? "match" : "diff",
          note: "최초 1년 근로가 끝나기 3개월 전을 기준으로 10일 이내입니다(§61②).",
        },
        {
          label: "2차 통보 — 9일분",
          from: null,
          to: fmt(firstBatchSecondNotice),
          actual: input.secondNoticeSentOn,
          status: !input.secondNoticeSentOn
            ? "unknown"
            : parse(input.secondNoticeSentOn) <= firstBatchSecondNotice
              ? "match"
              : "diff",
          note: "최초 1년 근로가 끝나기 1개월 전까지입니다.",
        },
        {
          label: "1차 촉구 — 뒤에 발생한 2일분 (1개월 전, 5일간)",
          from: fmt(lateBatchFrom),
          to: fmt(lateBatchTo),
          actual: inLateBatch ? sent : undefined,
          status: !sent ? "unknown" : inLateBatch ? "match" : "unknown",
          note: "서면 촉구 후 발생한 휴가는 따로 촉구합니다. 두 묶음을 한 번에 처리할 수 없습니다.",
        },
        {
          label: "2차 통보 — 2일분",
          from: null,
          to: fmt(lateBatchSecondNotice),
          status: "unknown",
          note: "최초 1년간 근로가 끝나기 10일 전까지입니다. 이 데모는 묶음별 통보 기록을 따로 받지 않습니다.",
        },
      ]),
      // ★ 2026-09-24 — 여기만 창을 보지 않고 한 줄로 단정하고 있었다.
      //   발송일이 **두 묶음 중 하나**에만 들어가면 「일치」가 나왔다.
      //   §61② 은 9일분과 2일분을 각각 촉구하게 돼 있고, 바로 아래 note 에도
      //   "두 묶음을 한 번에 처리할 수 없습니다" 라고 적어 두었다.
      //   그래서 12-03 발송(2일분 창 안, 9일분 창은 놓침)이 「일정 대조: 일치」로
      //   떴다 — 표 1단계는 「차이」인데 상단 배지만 「일치」였고, 사용자는
      //   배지를 믿는다. 늦은 촉구를 적법하다고 읽게 만드는 자리다.
      //   1년 이상 분기와 같은 규칙(창에서 산출)으로 맞춘다.
      overall: rollUp(windows),
      disclaimer: DISCLAIMER,
    };
  }

  const windows: ScheduleWindow[] = [];

  // ① 1차 촉구 — 「6개월 전 기준 10일 이내」. 시작과 끝을 함께 낸다
  //
  // ★ 2026-09-23 수정 — 「6개월 전」은 종료일에서 6개월을 뺀 날이 아니라 **그 다음날**이다.
  //   최영우 교재 『연차사용촉진 절차(1.1~12.31 기준)』 표:
  //     1년 이상 근무자 · 1차 사용촉진 = **7.1 ~ 7.10** (6개월 전, 10일간)
  //   12-31 에서 6개월을 그냥 빼면 6-30 이 나오는데, 실무 기준은 7-01 이다.
  //   남은 기간이 정확히 6개월이 되는 첫날이라는 뜻이다.
  //   (처음에 6-30 으로 구현했다가 교재 표와 대조해 고쳤다)
  const firstFrom = addDays(addMonths(end, -6), 1);
  const firstTo = addDays(firstFrom, 9); // 7.1 부터 10일간 = 7.10
  const sent = input.firstNoticeSentOn;
  windows.push({
    label: "1차 촉구 (미사용일수 통지 + 사용시기 지정 요구)",
    from: fmt(firstFrom),
    to: fmt(firstTo),
    actual: sent,
    status: !sent
      ? "unknown"
      : parse(sent) >= firstFrom && parse(sent) <= firstTo
        ? "match"
        : "diff",
    note: !sent
      ? "보낸 기록이 입력되지 않았습니다. 기록이 없다고 해서 미실시로 보지 않습니다."
      : "허용 기간 안에 보냈는지만 봅니다. 서면 여부·도달 여부는 확인하지 않습니다.",
  });

  // ② 근로자 응답기한 — **수령일** 기준 10일
  const received = input.firstNoticeReceivedOn;
  if (received) {
    const replyDue = addDays(parse(received), 10);
    const replied = input.workerRepliedOn;
    windows.push({
      label: "근로자 사용시기 통보 기한 (수령일 +10일)",
      from: received,
      to: fmt(replyDue),
      actual: replied,
      status: !replied
        ? "unknown"
        : parse(replied) <= replyDue
          ? "match"
          : "diff",
      note: "촉구를 **받은 날**부터 셉니다. 발송일로 계산하지 않습니다.",
    });
  } else {
    windows.push({
      label: "근로자 사용시기 통보 기한",
      from: null,
      to: null,
      status: "unknown",
      note: "촉구 수령일이 없어 기한을 낼 수 없습니다. 발송일로 대체하지 않습니다.",
    });
  }

  // ③ 2차 통보 — 사용기간 끝 2개월 전까지
  const secondTo = addMonths(end, -2);
  const second = input.secondNoticeSentOn;
  const workerReplied = Boolean(input.workerRepliedOn);
  windows.push({
    label: "2차 통보 (사용자의 사용시기 지정)",
    from: null,
    to: fmt(secondTo),
    actual: second,
    status: !second
      ? "unknown"
      : parse(second) <= secondTo
        ? "match"
        : "diff",
    note: workerReplied
      ? "근로자가 사용시기를 통보한 기록이 있습니다. 2차 통보 필요 여부는 사안에 따라 다르므로 판단하지 않습니다."
      : "근로자 미통보 여부가 확인되지 않으면 2차 통보 필요 여부도 단정하지 않습니다.",
  });

  const statuses = windows.map((w) => w.status);
  const overall: ScheduleStatus = statuses.includes("diff")
    ? "diff"
    : statuses.includes("unknown")
      ? "unknown"
      : "match";

  return { kind, usagePeriodEnd, windows, overall, disclaimer: DISCLAIMER };
}

/** 화면 라벨 — 「촉진: 일치」가 아니라 「일정 대조: 일치」다 */
export function scheduleStatusLabel(s: ScheduleStatus): string {
  if (s === "match") return "일정 대조: 일치";
  if (s === "diff") return "일정 대조: 차이";
  if (s === "out-of-scope") return "지원 범위 밖";
  return "확인 불가";
}
