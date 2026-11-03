// 근로계약서 작성 화면 입력 검사 — #139 적대 검토 3·8. 맞지 않는 입력은 계약서를 만들지 않고 그 이유를 말한다.
import { describe, expect, it } from 'vitest';

import { INITIAL, toWriteForm, type WriteState } from '@/app/tools/contract-write/formState';

const OK: WriteState = {
  ...INITIAL,
  workplaceName: '합성테스트 사업장',
  employeeName: '합성01',
  startDate: '2026-11-01',
  location: '합성테스트 본점',
  duty: '홀 서비스',
  monthlyTotal: '2,600,000',
};

const parse = (p: Partial<WriteState>) => toWriteForm({ ...OK, ...p }, '2026-11-03');

describe('toWriteForm — 맞지 않는 입력', () => {
  it('정상 입력은 계약서를 만든다', () => {
    expect(parse({}).form).not.toBeNull();
  });

  it.each<[string, Partial<WriteState>, RegExp]>([
    ['출근 = 퇴근', { start: '09:00', end: '09:00' }, /출근과 퇴근 시각이 같습니다/],
    ['휴게 ≥ 근무', { start: '09:00', end: '10:00', breakMinutes: '60' }, /휴게시간\(60분\)이 출근~퇴근 시간\(60분\)과 같거나 깁니다/],
    ['종료일 < 시작일', { endDate: '2026-10-31' }, /계약 종료일이 시작일보다 빠릅니다/],
    ['주 7일', { workDays: ['월', '화', '수', '목', '금', '토', '일'] }, /주 7일 근무로는/],
    ['주휴일이 근무일', { workDays: ['월', '화', '수', '목', '금', '토'], weeklyRestDay: '토' }, /주휴일\(토요일\)이 근무 요일과 겹칩니다/],
    ['숫자 아님 — 휴게', { breakMinutes: '육십' }, /숫자로 읽을 수 없는 칸: 하루 휴게시간/],
    ['숫자 아님 — 연장 시간', { overtimeHours: '65시간' }, /숫자로 읽을 수 없는 칸: 연장 시간/],
    ['숫자 아님 — 공휴일 일수', { holidayDaysPerYear: '-3' }, /연간 공휴일 근무 예정 일수/],
    ['작성일 형식', { writtenDate: '2026/11/03' }, /작성일을 YYYY-MM-DD/],
  ])('%s → 계약서를 만들지 않고 이유를 말한다', (_, patch, message) => {
    const r = parse(patch);
    expect(r.form).toBeNull();
    expect(r.error).toMatch(message);
  });

  it('근무장소·업무를 비우면 채워 넣지 않고 빈 칸으로 알린다', () => {
    const r = parse({ location: ' ', duty: '' });
    expect(r.form).toBeNull();
    expect(r.missing).toEqual(['근무장소', '업무']);
  });

  it('작성일을 비우면 오늘(KST), 넣으면 그 날', () => {
    expect(parse({}).form?.writtenDate).toBe('2026-11-03');
    expect(parse({ writtenDate: '2026-10-28' }).form?.writtenDate).toBe('2026-10-28');
  });

  it('주휴일은 요일 하나 — 근무 요일 밖이면 그대로', () => {
    expect(parse({ weeklyRestDay: '토' }).form?.weeklyRestDay).toBe('토');
  });

  it('자정 넘김(22:00~06:00)은 정상', () => {
    expect(parse({ start: '22:00', end: '06:00' }).form).not.toBeNull();
  });
});
