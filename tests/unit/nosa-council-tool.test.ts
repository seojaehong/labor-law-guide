// nosa 묶음(노사협의회) MCP 도구 — 등록 함수를 가짜 서버에 걸어 처리 함수를 바로 부른다(프로세스를 띄우지 않는다).
// 사업장은 합성 값만 쓴다. 주민번호는 체크섬과 무관한 가상 모양만 쓴다.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
    expect(nosaRemoteSafe).toEqual(['assess_labor_council', 'check_council_meeting']);
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

describe('check_council_meeting(원격 가능)', () => {
  const BASE = { kind: '정기', meetingDate: '2026-12-03', workerSeats: 5, employerSeats: 5, today: TODAY };
  it('통보 늦음 · 정원 10 현원 7 출석 4 불성립 · §21 안건 의결되지 않음 → 임의중재 · 보고 누락', async () => {
    const r = await call('check_council_meeting', {
      ...BASE, noticeDate: '2026-11-26', previousRegularDate: '2026-05-01', workerSeats: 10, employerSeats: 10, workerCurrent: 7, workerPresent: 4, employerPresent: 6,
      agenda: [{ type: '의결', article: '21-1', inFavor: 9 }, { type: '보고', article: '22-1' }],
    });
    expect(r.ok).toBe(true);
    expect(r.today).toBe(TODAY);
    expect(r.convene).toMatchObject({ due: '2026-11-25', onTime: false });
    expect(r.interval.status).toBe('빈 기간 있음');
    expect(r.quorum.held).toBe(false);
    expect(r.quorum.currentNote).toMatch(/현원\(7명\)/);
    expect(r.agenda[0]).toMatchObject({ result: '의결되지 않음', resolutionItem: true });
    expect(r.agenda[0].arbitration).toMatch(/법 제25조/);
    expect(r.reports.missing).toHaveLength(3);
    expect(r.resolutionNotice).toBeNull();
    expect(bannedHits(JSON.stringify(r), NOSA_WORDS)).toEqual([]);
  });
  it('출석 9 찬성 6 → 의결, 찬성 5 → 의결되지 않음 · 공지 기한(규정 값)', async () => {
    const r = await call('check_council_meeting', { ...BASE, workerPresent: 4, employerPresent: 5, noticeDays: 7, agenda: [{ type: '의결', inFavor: 6 }, { type: '의결', inFavor: 5 }] });
    expect(r.agenda.map((a: { result: string }) => a.result)).toEqual(['의결', '의결되지 않음']);
    expect(r.resolutionNotice.due).toBe('2026-12-10');
  });
  it('맞지 않는 입력·주민번호 모양은 멈춘다', async () => {
    const bad = await call('check_council_meeting', { ...BASE, workerPresent: 6, employerPresent: 5 });
    expect(bad.ok).toBe(false);
    expect(bad.errors.join()).toMatch(/정원/);
    const rrn = await call('check_council_meeting', { ...BASE, workerSeats: 900101_1234568 });
    expect(rrn.ok).toBe(false);
  });
  it('안건 제목·이름 칸이 없다(숫자·날짜·선택지만)', () => {
    const agenda = (tool('check_council_meeting').cfg.inputSchema as Record<string, { element?: { shape?: Record<string, unknown> } }>).agenda;
    const inner = (agenda as unknown as { unwrap: () => { element: { shape: Record<string, unknown> } } }).unwrap().element.shape;
    expect(Object.keys(inner).sort()).toEqual(['article', 'inFavor', 'resolutionItem', 'type']);
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

describe('make_labor_council_forms(로컬 전용)', () => {
  process.env.LLG_ROOT = process.cwd();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nosa-forms-'));
  const FULL = {
    workplace: { name: '가상제조', ownerName: '김대표', bizNo: '0000000000', address: '서울특별시 가상구 가상로 1', tel: '02-000-0000' },
    headcount: 120, majorityUnion: false, workerMembers: 5, employerMembers: 5, grievanceMembers: 3,
    concurrentRep: true, concurrentScope: ['탄력적 근로시간제 서면합의'], installDate: '2026-12-01', electionDate: '2026-11-19', termStart: '2026-12-01',
    election: { electors: 100, voters: 60, candidates: 5, notified: true, supporters: 40 }, unit: '사업', office: '서울지방고용노동청 서울가상지청',
    writtenDate: '2026-11-10',
  };

  it('로컬 전용 목록에 있고 원격 가능 목록에는 없다', () => {
    expect(nosaLocalOnly).toEqual(['make_labor_council_forms']);
    expect(nosaRemoteSafe).not.toContain('make_labor_council_forms');
    expect(tool('make_labor_council_forms').cfg.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
  });

  it('서류를 PDF·한글로 만들고, 만들지 않은 서류와 날인할 곳을 알린다', async () => {
    const out = path.join(tmp, 'full');
    const r = await call('make_labor_council_forms', { ...FULL, outDir: out });
    expect(r.ok).toBe(true);
    expect(r.files).toHaveLength(14 * 2);
    expect(r.files.every((f: { path: string }) => fs.existsSync(f.path))).toBe(true);
    const names = r.files.map((f: { path: string }) => path.basename(f.path));
    expect(names).toContain('노사협의회_20261110_05_정족수_확인서.pdf');
    expect(names).toContain('노사협의회_20261110_00_협의회규정.pdf');
    expect(names).toContain('노사협의회_20261110_00_협의회규정.hwpx');
    expect(r.skippedDocuments).toEqual([{ id: '12_위촉통지서', reason: '선거 방식이므로 만들지 않음' }]);
    expect(r.sealRequired.length).toBeGreaterThan(3);
    expect(r.submit.url).toBe('https://labor.moel.go.kr/minwonRqst/SN012.do');
    expect(r.submit.deadline).toBe('2026-12-16');
    expect(r.submit.attach).toBe('노사협의회_20261110_00_협의회규정.pdf');
    expect(r.notice).toContain('고용노동부 『노사협의회 운영 매뉴얼』(2022. 12.) [부록 1]을 2022. 12. 11. 시행 법령에 맞추어 고침');
    expect(bannedHits(JSON.stringify(r), NOSA_WORDS)).toEqual([]);
    // 14 노동포털 제출 입력값의 첨부 칸에 협의회규정 pdf 파일 이름이 들어간다(한글 파일 본문에서 확인)
    const JSZip = (await import('jszip')).default;
    const portal = r.files.find((f: { path: string; format: string }) => f.format === 'hwpx' && f.path.includes('14_노동포털'));
    const sec = await (await JSZip.loadAsync(fs.readFileSync(portal.path))).file('Contents/section0.xml')!.async('string');
    expect(sec).toContain('노사협의회_20261110_00_협의회규정.pdf');
    // 출처 문장은 협의회규정 본문에 없다
    const rules = r.files.find((f: { path: string; format: string }) => f.format === 'hwpx' && f.path.includes('00_협의회규정'));
    const rsec = await (await JSZip.loadAsync(fs.readFileSync(rules.path))).file('Contents/section0.xml')!.async('string');
    expect(rsec).toContain('가상제조 노사협의회 규정');
    expect(rsec).not.toContain('부록');
  }, 60_000);

  it('이미 있는 파일은 덮어쓰지 않는다', async () => {
    const r = await call('make_labor_council_forms', { ...FULL, outDir: path.join(tmp, 'full') });
    expect(r.ok).toBe(false);
    expect(r.exists).toHaveLength(28);
  });

  it('위원 수가 3 미만·10 초과면 만들지 않는다', async () => {
    const r = await call('make_labor_council_forms', { ...FULL, workerMembers: 11, employerMembers: 11, outDir: path.join(tmp, 'eleven') });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/3명 이상 10명 이하/);
    expect(fs.existsSync(path.join(tmp, 'eleven'))).toBe(false);
  });

  it('pdf 를 고르지 않으면 첨부 안내는 한글 파일을 pdf·hwp 로 저장하라고 적는다', async () => {
    const r = await call('make_labor_council_forms', { ...FULL, outDir: path.join(tmp, 'hwpx-only'), formats: ['hwpx'] });
    expect(r.submit.attach).toMatch(/00_협의회규정\.hwpx.*pdf 또는 hwp/);
  }, 30_000);

  it('형식을 고를 수 있다', async () => {
    const r = await call('make_labor_council_forms', { ...FULL, outDir: path.join(tmp, 'hwpx'), formats: ['hwpx'], fileBase: '시험' });
    expect(r.files.every((f: { format: string; path: string }) => f.format === 'hwpx' && path.basename(f.path).startsWith('시험_'))).toBe(true);
  }, 30_000);

  it('사업장명이 비면 만들지 않고 빈 칸을 댄다, 맞지 않는 칸도 댄다', async () => {
    const r = await call('make_labor_council_forms', { ...FULL, workplace: {}, installDate: '2026-02-30', outDir: path.join(tmp, 'blank') });
    expect(r.ok).toBe(false);
    expect(r.blanks).toEqual(['사업장명']);
    expect(r.errors.join()).toMatch(/installDate/);
    expect(fs.existsSync(path.join(tmp, 'blank'))).toBe(false);
  });

  it('주민등록번호 모양이 있으면 폴더도 만들지 않는다', async () => {
    const r = await call('make_labor_council_forms', { ...FULL, workplace: { ...FULL.workplace, tel: '900101-1234568' }, outDir: path.join(tmp, 'rrn') });
    expect(r.ok).toBe(false);
    expect(fs.existsSync(path.join(tmp, 'rrn'))).toBe(false);
  });

  it('정족수 미달이면 알린다', async () => {
    const r = await call('make_labor_council_forms', { ...FULL, election: { electors: 100, voters: 40 }, outDir: path.join(tmp, 'short'), formats: ['hwpx'] });
    expect(r.ok).toBe(true);
    expect(r.warnings.join()).toMatch(/정족수가 미달/);
  }, 30_000);
});
