import { buildPromotionSchedule, type PromotionScheduleInput, type PromotionScheduleResult, type ScheduleWindow } from './leave-promotion';
import { normalizeDate } from './leave-sheet';

/** Input chronology only; source statutory windows and entitlement formula remain unchanged. */
export function checkedPromotionSchedule(input: PromotionScheduleInput): PromotionScheduleResult {
  const dates = [input.usagePeriodEnd, input.firstNoticeSentOn, input.firstNoticeReceivedOn, input.workerRepliedOn, input.secondNoticeSentOn];
  if (dates.some(date => date && normalizeDate(date) !== date)) {
    return { kind: input.kind, usagePeriodEnd: input.usagePeriodEnd, windows: [], overall: 'unknown', disclaimer: '날짜 입력을 확인해 주세요. 존재하는 YYYY-MM-DD 날짜가 필요합니다. 적법성은 판정하지 않습니다.' };
  }
  const result = buildPromotionSchedule(input);
  const { firstNoticeSentOn: sent, firstNoticeReceivedOn: received, workerRepliedOn: replied, secondNoticeSentOn: second } = input;
  const fail = (window: ScheduleWindow, note: string) => { window.status = 'diff'; window.note = note; };
  const review = (window: ScheduleWindow, note: string) => { if (window.status !== 'diff') window.status = 'unknown'; window.note = note; };
  const replyDue = received ? (() => { const date = new Date(`${received}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + 10); return date.toISOString().slice(0, 10); })() : null;

  if (input.kind === 'annual-15plus') {
    const replyWindow = result.windows[1];
    if (replyWindow && received && sent && received < sent) fail(replyWindow, '수령일이 1차 발송일보다 빠릅니다. 입력 순서를 확인해 주세요.');
    if (replyWindow && replied && received && replied < received) fail(replyWindow, '회신일이 촉구 수령일보다 빠릅니다. 입력 순서를 확인해 주세요.');
  } else if (received || replied) {
    result.windows.push({ label: '수령·회신 기록 순서', from: received ?? null, to: replyDue, actual: replied, status: 'unknown', note: '첫해 묶음별 수령·회신 기록과 응답 상태를 별도로 확인해야 합니다.' });
    const replyWindow = result.windows.at(-1)!;
    if (received && sent && received < sent) fail(replyWindow, '수령일이 발송일보다 빠릅니다.');
    if (replied && received && replied < received) fail(replyWindow, '회신일이 촉구 수령일보다 빠릅니다.');
  }

  // A single pair of dates belongs to one first-year batch; never certify both batches.
  if (input.kind === 'monthly-under-1year' && sent && result.windows[2]?.status === 'match') {
    result.windows[1].actual = undefined;
    review(result.windows[1], '후발 묶음의 기록입니다. 먼저 발생한 묶음의 2차 기록은 별도 확인이 필요합니다.');
    result.windows[3].actual = second;
    if (second) result.windows[3].status = second <= result.windows[3].to! ? 'match' : 'diff';
  }
  for (const window of result.windows.filter(window => window.label.startsWith('2차') && window.actual)) {
    if (second && ((sent && second < sent) || (received && second < received))) {
      fail(window, '2차 통보가 1차 발송 또는 수령보다 빠릅니다. 입력 순서를 확인해 주세요.');
    } else if (!sent || !received || !replyDue || (second && second <= replyDue) || replied) {
      review(window, '회신 기회와 미통보·부분 회신 상태를 확인해야 합니다. 마감일 이전이라는 이유만으로 일치로 판단하지 않습니다.');
    } else {
      review(window, '날짜는 마감 이전이나 근로자 미통보·부분 회신 상태가 확인되지 않았습니다. 2차 통보 조건은 별도 검토가 필요합니다.');
    }
  }
  result.overall = result.windows.some(window => window.status === 'diff') ? 'diff' : result.windows.some(window => window.status === 'unknown') ? 'unknown' : 'match';
  return result;
}
