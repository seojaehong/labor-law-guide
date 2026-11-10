// 노사협의회 설치·선출 규칙 — 노사협의회신고 스킬 test_assess.py 의 assess 시험 17건을 이름 그대로 옮기고(파이썬 정답과 같은 값),
// 월·연·윤년 경계, 파이썬 round() 와 같은 투표율, 금지어·근거 표기를 더 본다. 사업장은 합성 값만 쓴다.
import { describe, expect, it } from 'vitest';

import {
  addDays, assess, ballot, deadline, installation, members, pyRound, quorumDirect, quorumDistricts, quorumIndirect, quorumMeeting, quorumWorkerRep,
  REP_BASIS_ADMIN, REP_BASIS_SUPPORT, schedule, selection, STEP_INSTALL, STEP_REPORT, DOC_NAMES,
} from '@/lib/nosa-council/assess';
import { bannedHits } from '@/lib/tool-kit/banned';

const TODAY = '2026-11-10';
/** 이 묶음이 쓰는 글에 없어야 하는 말 — 공개 문구 금지어 + 포괄 + 대신·대행·대리·지도 */
const WORDS = ['노무사', '상담', '자문', '진단', '판정', '적법', '확률', '체불', '위법', '승소', '받을 수 있는 금액', '포괄', '대신', '대행', '대리', '지도'];

// ── 파이썬 test_assess.py 17건 ─────────────────────────

describe('기한시험', () => {
  it('test_소집_통보일_불산입_개최일전까지_7일', () => {
    // 매뉴얼 p124: 통보일은 산입하지 않고 개최일 전까지 7일 확보 → 개최일 − 8일
    expect(deadline('2026-11-20', '소집', TODAY).due).toBe('2026-11-12');
  });
  it('test_소집_7일전은_늦음', () => {
    expect(deadline('2026-11-20', '소집', TODAY).due).not.toBe('2026-11-13');
  });
  it('test_신고_설치일부터_15일', () => {
    expect(deadline('2026-11-01', '신고', TODAY).due).toBe('2026-11-16');
  });
  it('test_고충_청취일부터_10일', () => {
    expect(deadline('2026-11-01', '고충', TODAY).due).toBe('2026-11-11');
  });
});

describe('회의정족수시험', () => {
  // 법 §15 + 노사관계법제과-3091: 의사정족수는 협의회규정상 정원 기준
  it('test_각_과반수_출석이면_개최', () => {
    expect(quorumMeeting(10, 10, 6, 6).held).toBe(true);
  });
  it('test_한쪽_과반수_미달이면_불성립', () => {
    expect(quorumMeeting(10, 10, 10, 5).held).toBe(false);
  });
  it('test_정원기준_현원이_줄어도_정원의_과반', () => {
    // 근로자위원 정원 10, 현원 7, 출석 4 → 정원 기준 6명 필요 → 불성립
    expect(quorumMeeting(10, 10, 4, 6).held).toBe(false);
  });
  it('test_의결_출석_3분의2', () => {
    // 매뉴얼 p129 예: 노 10 + 사 6 = 16명 출석 → 11명 이상 찬성
    expect(quorumMeeting(10, 10, 10, 6, 11).passed).toBe(true);
    expect(quorumMeeting(10, 10, 10, 6, 10).passed).toBe(false);
  });
});

describe('선거시험', () => {
  it('test_판정문에_적법_낱말_없음', () => {
    for (const r of [quorumDirect(100, 51), quorumDirect(100, 50)]) expect(r.result).not.toContain('적법');
  });
  it('test_과반수_참여_경계', () => {
    expect(quorumDirect(100, 51).met).toBe(true);
    expect(quorumDirect(100, 50).met).toBe(false);
  });
  it('test_무투표_당선_불인정_찬반투표', () => {
    // 매뉴얼 p54: 후보 수 = 정원이어도 투표, 찬반투표 가능
    const r = ballot(3, 3);
    expect(r.method).toBe('찬반투표');
    expect(r.voteRequired).toBe(true);
    expect(ballot(5, 3).method).toBe('다수득표');
  });
  it('test_선거구별_과반_판정', () => {
    // 매뉴얼 p50: 선거구를 나누면 선거구별로 과반 참여
    const r = quorumDistricts([{ label: 'A', electors: 40, voters: 30 }, { label: 'B', electors: 60, voters: 25 }]);
    expect(r.met).toBe(false);
    expect(r.stages.map((x) => x.met)).toEqual([true, false]);
  });
});

describe('겸임시험', () => {
  // 근거가 갈리므로 두 축을 따로 낸다(manual-crosscheck §C)
  it('test_두_축을_따로_낸다', () => {
    const r = quorumWorkerRep(100, 60, true, 40);
    expect(r.adminInterpretation.met).toBe(true);
    expect(r.majoritySupport.met).toBe(false);
    expect(JSON.stringify(r)).not.toContain('겸임 성립');
  });
  it('test_주지없으면_행정해석기준_미충족', () => {
    expect(quorumWorkerRep(100, 60, false, 60).adminInterpretation.met).toBe(false);
  });
  it('test_지지자수_없으면_과반지지_미판정', () => {
    expect(quorumWorkerRep(100, 60, true).majoritySupport.met).toBeNull();
  });
});

describe('일정시험', () => {
  it('test_규정_의결일이_설치일', () => {
    // 매뉴얼 p61 + 대전청 안내: 설치일 = 구성 후 최초 회의에서 규정을 제정한 날
    const at = Object.fromEntries(schedule('2026-12-01').map((r) => [r.step, r.date]));
    expect(at[STEP_INSTALL]).toBe('2026-12-01');
    expect(at[STEP_REPORT]).toBe('2026-12-16');
  });
  it('test_위원수_권고값을_근거있는것처럼_내지않음', () => {
    expect(members(null, null, 120).source).not.toBe('권고값');
  });
});

// ── 더한 시험 ──────────────────────────────────────────

describe('기한 — 월·연·윤년 경계(UTC 셈, 파이썬과 같은 값)', () => {
  it('소집 통보 기한이 달을 넘는다(개최일 − 8일)', () => {
    expect(deadline('2026-12-03', '소집', TODAY).due).toBe('2026-11-25');
  });
  it('신고 기한이 달을 넘는다(설치일 + 15일)', () => {
    expect(deadline('2026-11-20', '신고', TODAY).due).toBe('2026-12-05');
  });
  it('해를 넘는다', () => {
    expect(deadline('2026-12-20', '신고', TODAY).due).toBe('2027-01-04');
    expect(deadline('2027-01-05', '소집', TODAY).due).toBe('2026-12-28');
    expect(deadline('2026-12-25', '고충', TODAY).due).toBe('2027-01-04');
  });
  it('윤년 2월', () => {
    expect(deadline('2028-03-01', '소집', TODAY).due).toBe('2028-02-22');
    expect(deadline('2027-03-01', '소집', TODAY).due).toBe('2027-02-21');
  });
  it('남은 일수·상태는 넘긴 오늘로 센다(3일 이하 임박, 지나면 경과)', () => {
    expect(deadline('2026-11-20', '신고', TODAY)).toMatchObject({ due: '2026-12-05', daysLeft: 25, status: '여유' });
    expect(deadline('2026-11-01', '신고', '2026-11-13')).toMatchObject({ daysLeft: 3, status: '임박' });
    expect(deadline('2026-11-01', '신고', '2026-11-16')).toMatchObject({ daysLeft: 0, status: '임박' });
    expect(deadline('2026-11-01', '신고', '2026-11-17')).toMatchObject({ daysLeft: -1, status: '경과' });
  });
  it('날짜가 아니면 멈춘다', () => {
    expect(() => deadline('2026-02-30', '신고', TODAY)).toThrow(/YYYY-MM-DD/);
    expect(() => deadline('2026-11-01', '보고' as never, TODAY)).toThrow(/신고\/고충\/소집/);
    expect(addDays('20261231', 1)).toBe('2027-01-01');
  });
  it('일정 역산이 해를 넘어도 파이썬과 같은 날짜', () => {
    const want = [
      ['선거관리위원회 구성', '2026-12-01'], ['선거관리규정 의결', '2026-12-04'], ['선거 공고', '2026-12-15'], ['입후보 마감', '2026-12-24'],
      ['선거인명부 확정', '2026-12-26'], ['투표', '2026-12-29'], ['개표·정족수 확인', '2026-12-29'], ['당선공고', '2026-12-31'],
      ['사용자위원 위촉', '2027-01-01'], ['제1차 회의 소집 통보', '2027-01-02'], [STEP_INSTALL, '2027-01-10'], [STEP_REPORT, '2027-01-25'],
    ];
    expect(schedule('2027-01-10').map((r) => [r.step, r.date])).toEqual(want);
  });
});

describe('투표율 — 파이썬 round(율, 2)(반은 짝수 쪽, 두 배 정밀도 값 그대로)', () => {
  it('Math.round 와 갈리는 자리에서 파이썬 값을 낸다', () => {
    // 파이썬 assess.정족수_직접 출력(261110 실행)
    const py: Record<string, number> = { '32/1': 3.12, '800/1': 0.12, '800/5': 0.62, '160/1': 0.62, '3/1': 33.33, '3/2': 66.67, '8/1': 12.5, '7/3': 42.86 };
    for (const [k, v] of Object.entries(py)) {
      const [n, x] = k.split('/').map(Number);
      expect(quorumDirect(n, x).turnout, k).toBe(v);
    }
    expect(Math.round((1 / 32) * 100 * 100) / 100).toBe(3.13); // 단순 반올림은 다르다 — 이 시험이 지키는 차이
  });
  it('pyRound 는 파이썬 round 와 같다', () => {
    expect([pyRound(2.675, 2), pyRound(0.125, 2), pyRound(0.375, 2), pyRound(1.005, 2)]).toEqual([2.67, 0.12, 0.38, 1]);
    expect(pyRound(0, 2)).toBe(0);
    expect(pyRound(100, 2)).toBe(100);
    expect(pyRound(-0.125, 2)).toBe(-0.12);
  });
  it('선거인 0명이면 투표율 0, 필요 1명', () => {
    expect(quorumDirect(0, 0)).toMatchObject({ turnout: 0, needed: 1, met: false });
  });
});

describe('회의 의결 — 출석 3분의 2 이상(올림)', () => {
  it('파이썬과 같은 필요 찬성 수', () => {
    expect(quorumMeeting(3, 3, 2, 1).neededInFavor).toBe(2);
    expect(quorumMeeting(3, 3, 2, 2).neededInFavor).toBe(3);
    expect(quorumMeeting(5, 5, 4, 3).neededInFavor).toBe(5);
    expect(quorumMeeting(3, 3, 2, 2).neededPresent).toEqual({ worker: 2, employer: 2 });
  });
  it('개최가 안 되면 찬성이 많아도 의결이 아니다', () => {
    expect(quorumMeeting(10, 10, 5, 10, 15).passed).toBe(false);
    expect(quorumMeeting(10, 10, 6, 6).passed).toBeNull();
  });
});

describe('간접선거·선출방식·위원 수', () => {
  it('간접선거는 1·2단계를 따로 본다', () => {
    const r = quorumIndirect(200, 120, 20, 10);
    expect(r.stages.map((s) => [s.stage, s.met])).toEqual([['1단계(위원선거인 선출)', true], ['2단계(근로자위원 선출)', false]]);
    expect(r.met).toBe(false);
    expect(r.stages.every((s) => s.basis === '근참법 제6조제2항 단서')).toBe(true);
  });
  it('과반수 노동조합이면 위촉, 부득이한 사유가 있으면 간접선거, 아니면 직접선거', () => {
    expect(selection(true, '사무직·기술직·기능직 사업장이 따로 있다').method).toBe('위촉');
    expect(selection(false, '작업부서별 특성이 현저히 다르다').method).toBe('간접선거');
    expect(selection(false).method).toBe('직접선거');
  });
  it('정족수 서류 이름은 한 곳에서 온다(산출물 목록·일정 단계)', () => {
    expect(selection(false).documents).toContain(DOC_NAMES.quorumShort);
    expect(selection(false, 'x').documents).toContain(`${DOC_NAMES.quorumShort}(2단계)`);
    expect(schedule('2026-12-01').map((r) => r.step)).toContain(`개표·${DOC_NAMES.quorumShort.slice(0, -1)}`);
  });
  it('위원 수 — 노사 동수·범위, 비면 자리값', () => {
    expect(members(5, 4).warnings[0]).toMatch(/노사 동수가 아니다/);
    expect(members(2, 2).warnings).toHaveLength(2);
    expect(members(null, 4)).toMatchObject({ worker: 4, employer: 4, withinRange: true });
    expect(members(null, null, 120)).toMatchObject({ worker: 5, employer: 5, source: '자리값(법정 기준 없음 - 설치준비위원회가 정할 것)' });
    expect(members(null, null, 99).worker).toBe(3);
    expect(members(null, null, 300).worker).toBe(7);
  });
  it('후보가 정원보다 적으면 알린다', () => {
    expect(ballot(2, 3).warning).toMatch(/후보가 정원보다 적다/);
    expect(ballot(3, 3).warning).toBeUndefined();
  });
  it('설치의무 — 30명 경계', () => {
    expect(installation(30).required).toBe(true);
    expect(installation(29).required).toBe(false);
  });
});

describe('한데 묶어 보기(파이썬 판정과 같은 값)', () => {
  // 파이썬 판정({상시 120, 근로자위원 5, 사용자위원 4, 고충처리위원수 0, 겸임, 설치일 2026-11-20, 설치목표일 2026-12-01}) 출력과 맞춘다
  const r = assess({ headcount: 120, workerMembers: 5, employerMembers: 4, grievanceMembers: 0, concurrentRep: true, installDate: '2026-11-20', targetInstallDate: '2026-12-01' }, TODAY);
  it('고충처리위원 0 은 3명으로 본다(파이썬 int(x or 3))', () => {
    expect(r.grievanceMembers).toBe(3);
  });
  it('경고 — 노사 동수, 겸임 권한 범위', () => {
    expect(r.warnings).toHaveLength(2);
    expect(r.warnings[0]).toBe('노사 동수가 아니다(법 제6조제1항). 근로자위원 5명 / 사용자위원 4명');
    expect(r.warnings[1]).toMatch(/겸임 권한 범위가 비어 있다/);
  });
  it('신고 기한·일정', () => {
    expect(r.reportDeadline).toMatchObject({ due: '2026-12-05', daysLeft: 25, status: '여유' });
    expect(r.schedule).toHaveLength(12);
  });
  it('30명 미만이면 신고 기한을 내지 않고 알린다, 고충처리위원 4명이면 상한을 알린다', () => {
    const s = assess({ headcount: 20, grievanceMembers: 4, installDate: '2026-11-20' }, TODAY);
    expect(s.reportDeadline).toBeUndefined();
    expect(s.warnings.join()).toMatch(/임의 설치/);
    expect(s.warnings.join()).toMatch(/고충처리위원 4명은 법정 상한/);
  });
});

describe('근거 표기·금지어', () => {
  it('근로자대표 기준별 근거는 회시번호·일자가 확인된 것만 싣는다', () => {
    const r = quorumWorkerRep(100, 60, true, 51);
    expect(r.adminInterpretation.basis).toBe(REP_BASIS_ADMIN);
    expect(r.majoritySupport.basis).toBe(REP_BASIS_SUPPORT);
    const s = JSON.stringify([r, assess({ headcount: 50, concurrentRep: true, concurrentScope: ['탄력적 근로시간제 서면합의'] }, TODAY)]);
    for (const x of ['-263', '-994', '8048', 'manual-crosscheck']) expect(s).not.toContain(x);
  });
  it('어느 결과에도 금지어가 없다', () => {
    const all = JSON.stringify([
      assess({ headcount: 120, majorityUnion: false, indirectReason: '작업부서별 특성이 현저히 다르다', concurrentRep: true, installDate: '2026-11-20', targetInstallDate: '2026-12-01' }, TODAY),
      assess({ headcount: 12, majorityUnion: true, workerMembers: 11, employerMembers: 2, grievanceMembers: 5 }, TODAY),
      quorumDirect(100, 51), quorumDirect(100, 50), quorumDistricts([{ electors: 4, voters: 1 }]), quorumIndirect(10, 6, 3, 1),
      ballot(1, 3), ballot(5, 3), quorumWorkerRep(10, 6, false), quorumMeeting(3, 3, 1, 1, 1),
      deadline('2026-11-01', '소집', TODAY), deadline('2026-11-01', '고충', TODAY), deadline('2026-11-01', '신고', TODAY),
    ]);
    expect(bannedHits(all, WORDS)).toEqual([]);
  });
});
