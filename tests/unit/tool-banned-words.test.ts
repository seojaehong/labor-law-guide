import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bannedHits } from '@/lib/tool-kit/banned';
import { registerNosa } from '../../tools/k-labor/groups/nosa.mjs';

// 도구 화면 소스의 글자(JSX 글자·문자열·정적 HTML)에 금지어가 없는지 본다. 주석은 빼고 본다.
// 첫 화면과 고정 문구를 지키는 시험이다. 계산 결과 문장은 도구마다 copy 시험이 allCopy 로 훑는다.

const ROOTS = [
  'src/app/tools',
  'src/app/ai-tools',
  'src/content/ai-tools.ts',
  'src/app/duties',
  'src/app/exit-employer',
  'src/components/tool',
  'src/components/leave',
  'src/components/BizNoLookup.tsx',
  'src/components/biz-no-lookup-copy.ts',
  'src/components/HolidayPayCalculator.tsx',
  'src/content/tools-registry.ts',
  'src/lib/calc',
  'src/lib/leave',
  'src/lib/contract-check',
  'src/offline/contract-check',
  'src/content/duties-data.ts',
  'src/lib/nosa-council',
  'public/tools/severance.html',
];

function files(p: string): string[] {
  if (!fs.existsSync(p)) return [];
  if (fs.statSync(p).isFile()) return [p];
  return fs.readdirSync(p).flatMap((n) => files(path.join(p, n))).filter((f) => /\.(tsx?|html)$/.test(f));
}

/** 주석을 지운다 — /* *\/ · {/* *\/} · <!-- --> · 줄 끝 // (주소의 // 는 남긴다) */
function stripComments(src: string): string {
  // 여러 줄 주석은 줄 수만큼 빈 줄로 바꿔 줄 번호를 지킨다
  const blank = (m: string) => '\n'.repeat(m.split('\n').length - 1);
  return src
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .split(/\r?\n/)
    .map((l) => l.replace(/(^|[^:'"`\w])\/\/.*$/, '$1'))
    .join('\n');
}

describe('도구 화면 금지어', () => {
  const all = ROOTS.flatMap(files);

  it('살펴볼 파일을 찾는다', () => {
    expect(all.length).toBeGreaterThan(20);
  });

  it('주석을 뺀 글자에 금지어가 없다', () => {
    const found = all.flatMap((f) =>
      stripComments(fs.readFileSync(f, 'utf8'))
        .split('\n')
        .map((line, i) => ({ f, i: i + 1, hits: bannedHits(line), line: line.trim().slice(0, 80) }))
        .filter((x) => x.hits.length),
    );
    expect(found.map((x) => `${x.f}:${x.i} ${x.hits.join(',')} | ${x.line}`)).toEqual([]);
  });
});

describe('bannedHits', () => {
  it('허용 구절은 걸지 않는다', () => {
    expect(bannedHits('전자문서로 줍니다. 고충상담 절차')).toEqual([]);
  });
  it('표방어와 단정어를 잡는다', () => {
    expect(bannedHits('노무사 상담을 권장합니다')).toEqual(['노무사', '상담']);
    expect(bannedHits('임금 체불입니다')).toEqual(['체불']);
  });
});

// nosa 묶음(노사협의회) — 도구 이름·설명·입력 설명과 결과 글자. 새 묶음이라 포괄·대신·대행·대리·지도도 함께 막는다.
const NOSA_WORDS = ['노무사', '상담', '자문', '진단', '판정', '적법', '확률', '체불', '위법', '승소', '받을 수 있는 금액', '포괄', '대신', '대행', '대리', '지도'];
type NosaReg = { name: string; cfg: { title?: string; description?: string; inputSchema?: Record<string, { description?: string }> }; handler: (a: object) => Promise<{ content: { text: string }[] }> };

describe('nosa 묶음 금지어', () => {
  const tools: NosaReg[] = [];
  registerNosa({ registerTool: (name: string, cfg: NosaReg['cfg'], handler: NosaReg['handler']) => tools.push({ name, cfg, handler }) });

  // 묶인 칸(workplace·council·election)의 안쪽 설명까지 훑는다 — optional·array·object 를 풀어 내려간다
  type Z = { description?: string; shape?: Record<string, Z>; element?: Z; unwrap?: () => Z };
  const descs = (v: Z): string[] => [
    v.description ?? '',
    ...(typeof v.unwrap === 'function' ? descs(v.unwrap()) : []),
    ...(v.element ? descs(v.element) : []),
    ...(v.shape ? Object.values(v.shape).flatMap(descs) : []),
  ];

  it('도구 이름·설명·입력 설명', () => {
    expect(tools.map((t) => t.name)).toEqual(['assess_labor_council', 'check_council_meeting', 'make_labor_council_forms', 'make_council_meeting_docs', 'make_council_election_docs']);
    for (const t of tools) {
      const schema = Object.values(t.cfg.inputSchema ?? {}).flatMap((v) => descs(v as Z)).join('\n');
      expect(bannedHits(`${t.cfg.title}\n${t.cfg.description}\n${schema}`, NOSA_WORDS), t.name).toEqual([]);
    }
  });

  it('check_council_meeting 결과 글자', async () => {
    const t = tools.find((x) => x.name === 'check_council_meeting')!;
    const inputs = [
      { kind: '정기', meetingDate: '2026-12-03', noticeDate: '2026-11-30', previousRegularDate: '2026-04-01', workerSeats: 10, employerSeats: 10, workerCurrent: 7, workerPresent: 4, employerPresent: 6, agenda: [{ type: '의결', article: '21-1', inFavor: 9 }, { type: '협의', resolutionItem: true }], today: '2026-11-10' },
      { kind: '정기', meetingDate: '2026-12-01', previousRegularDate: '2026-08-31', workerSeats: 5, employerSeats: 5, workerPresent: 4, employerPresent: 5, agenda: [{ type: '의결', inFavor: 9 }, { type: '보고', article: '22-2' }], today: '2026-11-10' },
      { kind: '임시', meetingDate: '2026-13-01', workerSeats: 5, employerSeats: 5 },
    ];
    for (const a of inputs) {
      const out = (await t.handler(a)).content[0].text;
      expect(bannedHits(out, NOSA_WORDS), out.slice(0, 80)).toEqual([]);
    }
  });

  it('make_labor_council_forms 결과 글자', async () => {
    process.env.LLG_ROOT = process.cwd();
    const t = tools.find((x) => x.name === 'make_labor_council_forms')!;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nosa-banned-'));
    const inputs = [
      { workplace: { name: '가상상사' }, headcount: 120, majorityUnion: false, concurrentRep: true, installDate: '2026-12-01', election: { electors: 100, voters: 40, candidates: 2, seats: 3, notified: true }, writtenDate: '2026-11-10', outDir: path.join(dir, 'a'), formats: ['hwpx'] },
      { workplace: { name: '가상상사' }, headcount: 45, majorityUnion: true, writtenDate: '2026-11-10', outDir: path.join(dir, 'b'), formats: ['hwpx'] },
      { workplace: { name: '' }, headcount: 45, majorityUnion: false, installDate: '2026-13-01', outDir: path.join(dir, 'c') },
      { workplace: { name: '가상상사', tel: '900101-1234568' }, headcount: 45, majorityUnion: false, outDir: path.join(dir, 'd') },
    ];
    try {
      for (const a of inputs) {
        const out = (await t.handler(a)).content[0].text;
        expect(bannedHits(out, NOSA_WORDS), out.slice(0, 80)).toEqual([]);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('make_council_meeting_docs 결과 글자', async () => {
    process.env.LLG_ROOT = process.cwd();
    const t = tools.find((x) => x.name === 'make_council_meeting_docs')!;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nosa-banned-meeting-'));
    const M = {
      workplace: { name: '가상상사' }, meeting: { kind: '정기', number: 2, date: '2026-12-03', noticeDate: '2026-11-25', previousRegularDate: '2026-04-01' }, seats: { worker: 5, employer: 5 },
      current: { worker: 4 }, attendance: { worker: 2, employer: 5 }, agenda: [{ title: '교육훈련 기본계획', type: '의결', article: '21-1', inFavor: 6 }, { title: '휴게실', type: '협의', inFavor: 3 }],
      previousResolutions: [{ agendaId: 'A-1', status: '완료' }], writtenDate: '2026-12-04',
    };
    const inputs = ['notice', 'materials', 'minutes', 'resolution'].map((kind) => ({ ...M, kind, outDir: path.join(dir, kind), formats: ['hwpx'] }));
    inputs.push({ ...M, kind: 'notice', meeting: { ...M.meeting, noticeDate: '2026-12-01' }, outDir: path.join(dir, 'late'), formats: ['hwpx'] });
    try {
      for (const a of inputs) {
        const out = (await t.handler(a)).content[0].text;
        expect(bannedHits(out, NOSA_WORDS), out.slice(0, 80)).toEqual([]);
      }
      const json = fs.readFileSync(path.join(dir, 'minutes', '노사협의회_20261203_정기2차_회의록.json'), 'utf8');
      expect(bannedHits(json, NOSA_WORDS)).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('make_council_election_docs 결과 글자', async () => {
    process.env.LLG_ROOT = process.cwd();
    const t = tools.find((x) => x.name === 'make_council_election_docs')!;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nosa-banned-election-'));
    const E = { workplace: { name: '가상상사' }, seats: 3, targetInstallDate: '2026-12-15', concurrentRep: true, candidateCount: 4, writtenDate: '2026-11-10', formats: ['hwpx'] };
    const inputs = [
      { ...E, outDir: path.join(dir, 'a') },
      { ...E, candidateCount: 2, result: { electors: 100, voters: 40 }, outDir: path.join(dir, 'b') },
      { ...E, candidateCount: undefined, candidates: [{ votes: 10 }, { votes: 10 }, { votes: 5 }, { votes: 10 }], result: { electors: 100, voters: 60 }, outDir: path.join(dir, 'c') },
      { ...E, majorityUnion: true, seats: 11, dates: { announce: '2026-12-30' }, outDir: path.join(dir, 'd') },
    ];
    try {
      for (const a of inputs) {
        const out = (await t.handler(a)).content[0].text;
        expect(bannedHits(out, NOSA_WORDS), out.slice(0, 80)).toEqual([]);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('assess_labor_council 결과 글자', async () => {
    const t = tools.find((x) => x.name === 'assess_labor_council')!;
    const inputs = [
      { headcount: 120, concurrentRep: true, installDate: '2026-11-20', targetInstallDate: '2026-12-01', meetingDate: '2026-12-03', grievanceHeardDate: '2026-12-01', election: { electors: 100, voters: 40, candidates: 2, seats: 3 }, meeting: { workerSeats: 3, employerSeats: 3, workerPresent: 1, employerPresent: 1, inFavor: 1 }, today: '2026-11-10' },
      { headcount: 12, majorityUnion: true, concurrentRep: true, workerMembers: 11, employerMembers: 2, grievanceMembers: 5, election: { electors: 12, voters: 7 }, today: '2026-11-10' },
      { headcount: 400, indirectReason: '사무직·기술직·기능직 사업장이 따로 있다', election: { electors: 400, voters: 100, delegateElectors: 20, delegateVoters: 15, districts: [{ electors: 4, voters: 1 }] }, today: '2026-11-10' },
      { headcount: 50, installDate: '2026-13-01', election: { electors: 3, voters: 4 } },
    ];
    for (const a of inputs) {
      const out = (await t.handler(a)).content[0].text;
      expect(bannedHits(out, NOSA_WORDS), out.slice(0, 80)).toEqual([]);
    }
  });
});
