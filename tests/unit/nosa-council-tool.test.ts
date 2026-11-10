// nosa 묶음(노사협의회) MCP 도구 — 등록 함수를 가짜 서버에 걸어 처리 함수를 바로 부른다(프로세스를 띄우지 않는다).
// 사업장은 합성 값만 쓴다. 주민번호는 체크섬과 무관한 가상 모양만 쓴다.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

import { registerNosa, nosaLocalOnly, nosaRemoteSafe, nosaTools } from '../../tools/k-labor/groups/nosa.mjs';
import { bannedHits } from '@/lib/tool-kit/banned';

type Handler = (a: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
type Reg = { name: string; cfg: { title?: string; description?: string; inputSchema?: Record<string, unknown>; annotations?: Record<string, boolean> }; handler: Handler };

function fakeServer() {
  const tools: Reg[] = [];
  return {
    tools,
    registerTool(name: string, cfg: Reg['cfg'], handler: Handler) { tools.push({ name, cfg, handler }); },
    tool(name: string) { throw new Error(`server.tool() 금지: ${name}`); },
  };
}
const s = fakeServer();
registerNosa(s);
const tool = (n: string) => s.tools.find((t) => t.name === n)!;
const call = async (n: string, a: Record<string, unknown>) => JSON.parse((await tool(n).handler(a)).content[0].text);

const NOSA_WORDS = ['노무사', '상담', '자문', '진단', '판정', '적법', '확률', '체불', '위법', '승소', '받을 수 있는 금액', '포괄', '대신', '대행', '대리', '지도'];
const TODAY = '2026-11-10';

describe('nosa 묶음 — 도구 목록', () => {
  it('등록한 도구 = nosaTools, 원격 가능 + 로컬 전용 = 전부', () => {
    expect(s.tools.map((t) => t.name).sort()).toEqual([...nosaTools].sort());
    expect([...nosaRemoteSafe, ...nosaLocalOnly].sort()).toEqual([...nosaTools].sort());
    expect(nosaRemoteSafe).toEqual(['assess_labor_council']);
  });
  it('원격 가능 도구는 읽기 전용 주석·title 을 달고, 이름 칸을 받지 않는다', () => {
    for (const n of nosaRemoteSafe) {
      const t = tool(n);
      expect(t.cfg.title).toBeTruthy();
      expect(t.cfg.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
      const keys = JSON.stringify(Object.keys(t.cfg.inputSchema ?? {}));
      expect(keys).not.toMatch(/name|Name|label|outDir/);
    }
  });
  it('이름·설명·입력 설명에 금지어가 없다', () => {
    for (const t of s.tools) {
      const schema = JSON.stringify(Object.fromEntries(Object.entries(t.cfg.inputSchema ?? {}).map(([k, v]) => [k, (v as { description?: string }).description ?? ''])));
      expect(bannedHits(`${t.cfg.title} ${t.cfg.description} ${schema}`, NOSA_WORDS), t.name).toEqual([]);
    }
  });
  it('nosa.mjs 는 work-rules 묶음(법제처 .env 읽기)을 불러오지 않는다', () => {
    expect(fs.readFileSync('tools/k-labor/groups/nosa.mjs', 'utf8')).not.toMatch(/work-rules\.mjs|law-drf|rules-file/);
  });
});

describe('assess_labor_council', () => {
  it('설치의무·선출방식·위원 수·고충처리위원·신고 기한·일정·정족수를 한 번에 낸다', async () => {
    const r = await call('assess_labor_council', {
      headcount: 120, workerMembers: 5, employerMembers: 5, concurrentRep: true, concurrentScopeSet: true,
      installDate: '2026-11-20', targetInstallDate: '2026-12-01', meetingDate: '2026-12-03', grievanceHeardDate: '2026-12-25',
      election: { electors: 100, voters: 60, candidates: 5, notified: true, supporters: 40 },
      meeting: { workerSeats: 10, employerSeats: 10, workerPresent: 10, employerPresent: 6, inFavor: 11 },
      today: TODAY,
    });
    expect(r.ok).toBe(true);
    expect(r.installation).toMatchObject({ required: true, result: '설치 의무 있음' });
    expect(r.selection.method).toBe('직접선거');
    expect(r.members).toMatchObject({ worker: 5, employer: 5 });
    expect(r.grievanceMembers).toBe(3);
    expect(r.deadlines.report).toMatchObject({ due: '2026-12-05', daysLeft: 25 });
    expect(r.deadlines.convene.due).toBe('2026-11-25');
    expect(r.deadlines.grievance.due).toBe('2027-01-04');
    expect(r.schedule).toHaveLength(12);
    expect(r.election.workerMembers).toMatchObject({ met: true });
    expect(r.election.ballot).toMatchObject({ method: '찬반투표', seats: 5 });
    expect(r.election.workerRep.adminInterpretation.met).toBe(true);
    expect(r.election.workerRep.majoritySupport.met).toBe(false);
    expect(r.meeting).toMatchObject({ held: true, neededInFavor: 11, passed: true });
    expect(r.boundary).toHaveLength(2);
    expect(r.warnings).toEqual([]);
  });

  it('간접선거는 2단계를 따로, 선거구는 선거구별로 본다', async () => {
    const ind = await call('assess_labor_council', { headcount: 400, indirectReason: '작업부서별 특성이 현저히 다르다', election: { electors: 400, voters: 250, delegateElectors: 20, delegateVoters: 10 }, today: TODAY });
    expect(ind.election.kind).toBe('간접선거');
    expect(ind.election.workerMembers.stages.map((x: { met: boolean }) => x.met)).toEqual([true, false]);
    const dis = await call('assess_labor_council', { headcount: 100, election: { electors: 100, voters: 55, districts: [{ electors: 40, voters: 30 }, { electors: 60, voters: 25 }] }, today: TODAY });
    expect(dis.election.kind).toBe('선거구별');
    expect(dis.election.workerMembers.result).toBe('미달 선거구 재투표 필요');
  });

  it('앞뒤가 맞지 않는 숫자·날짜는 결과 없이 돌려준다', async () => {
    const bad = await call('assess_labor_council', { headcount: 50, installDate: '2026-02-30', election: { electors: 10, voters: 11 }, meeting: { workerSeats: 3, employerSeats: 3, workerPresent: 4, employerPresent: 1 } });
    expect(bad.ok).toBe(false);
    expect(bad.errors.join('\n')).toMatch(/installDate/);
    expect(bad.errors.join('\n')).toMatch(/선거인 수\(10명\)보다 많습니다/);
    expect(bad.errors.join('\n')).toMatch(/출석/);
    const ind = await call('assess_labor_council', { headcount: 400, indirectReason: '작업부서별 특성이 현저히 다르다', election: { electors: 400, voters: 250 } });
    expect(ind.errors.join()).toMatch(/2단계/);
  });

  it('주민등록번호 모양 숫자가 있으면 멈춘다', async () => {
    const r = await call('assess_labor_council', { headcount: 9001011234568 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/주민등록번호/);
  });

  it('오늘을 넣지 않으면 한국 날짜로 센다(LLG_TODAY 로 고정 가능)', async () => {
    process.env.LLG_TODAY = '2026-11-18';
    try {
      const r = await call('assess_labor_council', { headcount: 40, installDate: '2026-11-01' });
      expect(r.today).toBe('2026-11-18');
      expect(r.deadlines.report).toMatchObject({ due: '2026-11-16', daysLeft: -2, status: '경과' });
    } finally {
      delete process.env.LLG_TODAY;
    }
  });

  it('결과 글자에 금지어·확인되지 않은 회시번호가 없다', async () => {
    const outs = await Promise.all([
      call('assess_labor_council', { headcount: 120, concurrentRep: true, installDate: '2026-11-20', targetInstallDate: '2026-12-01', election: { electors: 100, voters: 40, candidates: 2, seats: 3, notified: false }, meeting: { workerSeats: 3, employerSeats: 3, workerPresent: 1, employerPresent: 1, inFavor: 1 }, today: TODAY }),
      call('assess_labor_council', { headcount: 12, majorityUnion: true, concurrentRep: true, workerMembers: 11, employerMembers: 2, grievanceMembers: 5, today: TODAY }),
      call('assess_labor_council', { headcount: 400, indirectReason: '사무직·기술직·기능직 사업장이 따로 있다', election: { electors: 400, voters: 100, delegateElectors: 20, delegateVoters: 15 }, today: TODAY }),
    ]);
    const all = JSON.stringify(outs);
    expect(bannedHits(all, NOSA_WORDS)).toEqual([]);
    for (const x of ['-263', '-994', '8048', 'manual-crosscheck', '겸임 성립']) expect(all).not.toContain(x);
  });
});
