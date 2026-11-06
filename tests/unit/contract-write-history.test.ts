// 근로계약서 작성 — 최근 입력 다시 불러오기(261106 재홍님 「고」).
// 파일을 내려받을 때 입력을 1건 남긴다(작성일 제외). 불러오면 INITIAL 위에 저장된 칸만 덮는다 — 계산 결과는 남기지 않아 지금 규칙으로 다시 계산된다.
// 화면 렌더 시험 기반이 없어 칸 고르기·되살리기는 순수 함수(historyState.ts)로 본다. 컴포넌트는 부르기만 한다.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { fromHistoryState, HISTORY_COPY, HISTORY_TOOL, historyLabel, savedAtText, toHistoryState } from '@/app/tools/contract-write/historyState';
import { INITIAL, type WriteState } from '@/app/tools/contract-write/formState';
import { bannedHits, RESULT_BANNED, SERVICE_BANNED } from '@/lib/tool-kit/banned';

const FILLED: WriteState = {
  ...INITIAL,
  workplaceName: '합성테스트 사업장',
  ownerName: '합성대표',
  fivePlus: 'no',
  employeeName: '합성근로자',
  startDate: '2026-03-01',
  endDate: '2027-02-28',
  writtenDate: '2026-02-26',
  location: '합성테스트 본점',
  duty: '홀 서비스',
  probation: 'yes',
  probationMonths: '3',
  probationReduced: 'yes',
  payType: 'hourly',
  hourlyWage: '13,000',
  absentWeekHoliday: 'keep',
  workDays: ['월', '화', '수'],
  start: '11:00',
  end: '17:00',
  breakMinutes: '30',
  weeklyRestDay: '일',
  holidayDaysPerYear: '16',
  rounding: 'ceil10',
  absorbInto: 'weeklyHoliday',
  payday: '매월 25일',
};

const src = (f: string) => readFileSync(resolve(__dirname, '../..', f), 'utf8');

describe('남길 칸', () => {
  it('도구 이름 = contract-write', () => {
    expect(HISTORY_TOOL).toBe('contract-write');
  });

  it('WriteState 칸 전부에서 작성일(writtenDate)만 뺀다 — 칸이 늘면 이 시험이 알린다', () => {
    const saved = toHistoryState(FILLED);
    expect(Object.keys(saved).sort()).toEqual(Object.keys(INITIAL).filter((k) => k !== 'writtenDate').sort());
    expect(JSON.stringify(saved)).not.toContain('2026-02-26');
  });

  it('화이트리스트 — 입력 객체에 다른 칸이 섞여 있어도 남기지 않는다', () => {
    const dirty = { ...FILLED, rrn: '900101-1234567', address: '서울특별시 가상구 가상로 1' } as unknown as WriteState;
    const raw = JSON.stringify(toHistoryState(dirty));
    expect(raw).not.toContain('900101-1234567');
    expect(raw).not.toContain('가상로');
    expect(raw).not.toContain('"rrn"');
  });

  it('이름표 = 근로자 · 시작일 · 사업체명, 근로자가 비면 「이름 없음」', () => {
    expect(historyLabel(FILLED)).toBe('합성근로자 · 2026-03-01 · 합성테스트 사업장');
    expect(historyLabel({ ...FILLED, employeeName: '  ' })).toBe('이름 없음 · 2026-03-01 · 합성테스트 사업장');
  });

  it('저장 시각 표시는 한국 시각', () => {
    expect(savedAtText('2026-11-06T05:07:00.000Z')).toBe('2026-11-06 14:07');
    expect(savedAtText('언젠가')).toBe('');
  });
});

describe('불러오기', () => {
  it('남긴 것을 불러오면 작성일만 비고(= 오늘) 나머지는 같다', () => {
    expect(fromHistoryState(toHistoryState(FILLED))).toEqual({ ...FILLED, writtenDate: '' });
  });

  it('INITIAL 위에 저장된 칸만 덮는다 — 없는 칸은 INITIAL, 모르는 칸은 무시', () => {
    const s = fromHistoryState({ employeeName: '홍길동', duty: '배달', rrn: '900101-1234567', writtenDate: '2026-01-01' });
    expect(s).toEqual({ ...INITIAL, employeeName: '홍길동', duty: '배달' });
    expect('rrn' in s).toBe(false);
  });

  it('타입이 틀린 칸은 버린다 — 선택지 밖 값도 버린다', () => {
    const s = fromHistoryState({
      employeeName: 3,
      workplaceName: '가나상사',
      fivePlus: 'maybe',
      payType: 'weekly',
      amountMode: 'gross',
      probation: true,
      rounding: 'ceil1000',
      absorbInto: 'bogus',
      weeklyRestDay: '일요일',
      absentWeekHoliday: 'keep',
      workDays: 'x',
      start: ['09:00'],
    });
    expect(s).toEqual({ ...INITIAL, workplaceName: '가나상사', amountMode: 'gross', absentWeekHoliday: 'keep' });
  });

  it('근무 요일 — 요일이 아닌 값과 겹친 값을 뺀다', () => {
    expect(fromHistoryState({ workDays: ['화', '월', 'x', 5, '화'] }).workDays).toEqual(['화', '월']);
  });

  it('객체가 아니면 INITIAL 그대로 — INITIAL 을 바꾸지 않는다', () => {
    for (const bad of [null, '문자열', 3, ['월']]) expect(fromHistoryState(bad)).toEqual(INITIAL);
    const s = fromHistoryState({});
    s.workDays.push('토');
    expect(INITIAL.workDays).toEqual(['월', '화', '수', '목', '금']);
  });
});

describe('화면 연결', () => {
  it('파일을 만든 뒤에만 1건 남긴다 — 내려받기 함수 안에서 addHistory 를 부른다', () => {
    const client = src('src/app/tools/contract-write/ContractWriteClient.tsx');
    expect(client).toContain('addHistory(HISTORY_TOOL, historyLabel(s), toHistoryState(s))');
    expect(client).toContain('<RecentInputs');
    // 카드도 이력도 없으면 첫 화면은 INITIAL 그대로
    expect(client).toContain('useState<WriteState>(INITIAL)');
  });

  it('최근 입력이 없으면 아무것도 그리지 않는다(첫 화면이 지금과 같다) — 저장소는 마운트 뒤에 읽는다', () => {
    const recent = src('src/app/tools/contract-write/RecentInputs.tsx');
    expect(recent).toContain('if (!ready || entries.length === 0) return null;');
    expect(recent).toContain('useEffect(');
  });

  it('처리방침 5절에 최근 입력 문장이 있다', () => {
    const privacy = src('src/app/privacy/page.tsx');
    const sec5 = privacy.slice(privacy.indexOf('5. 브라우저에 남는 정보와 쿠키'), privacy.indexOf('6. 이용자의 권리'));
    expect(sec5).toContain('최근 입력 5건(작성일 제외)');
  });
});

describe('화면 문구·전송 가드', () => {
  const EXTRA_BANNED = ['지도', '대리', '대신', '대행'];
  const texts = Object.values(HISTORY_COPY).map((v) => (typeof v === 'function' ? (v as (...a: string[]) => string)('홍길동 · 2026-03-01 · 가나상사') : v));

  it('새 화면 문구에 금지어가 없다', () => {
    expect(texts.length).toBeGreaterThan(5);
    expect(texts.flatMap((t) => bannedHits(t, [...SERVICE_BANNED, ...RESULT_BANNED, ...EXTRA_BANNED]).map((h) => `${h} | ${t}`))).toEqual([]);
  });

  it('새 문구 상수 밖 처리방침 문장에도 금지어가 없다', () => {
    const privacy = src('src/app/privacy/page.tsx');
    const line = privacy.slice(privacy.indexOf('최근 입력 5건'), privacy.indexOf('최근 입력 5건') + 200);
    expect(bannedHits(line, [...SERVICE_BANNED, ...RESULT_BANNED, ...EXTRA_BANNED])).toEqual([]);
  });

  it('최근 입력 코드에 서버 전송 경로가 없다', () => {
    for (const f of ['src/app/tools/contract-write/historyState.ts', 'src/app/tools/contract-write/RecentInputs.tsx']) {
      const s = src(f);
      for (const banned of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource']) expect(s, `${f}: ${banned}`).not.toContain(banned);
    }
  });
});
