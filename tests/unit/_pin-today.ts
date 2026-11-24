// 최저임금 비교 연도가 오늘(KST)에 걸린다(261124 P1 — MINWAGE 는 시작 연도부터 오늘까지 해마다 본다).
// 시험이 날짜가 바뀌어도(2027-01-01 이후 등) 같은 결과를 내도록 Date 만 고정한다. 타이머는 건드리지 않는다.
import { afterAll, beforeAll, vi } from 'vitest';

export const PINNED_TODAY = '2026-11-24';

export function pinToday(iso: string = PINNED_TODAY): void {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${iso}T03:00:00Z`));
  });
  afterAll(() => {
    vi.useRealTimers();
  });
}
