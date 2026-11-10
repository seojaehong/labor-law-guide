import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
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

  it('도구 이름·설명·입력 설명', () => {
    for (const t of tools) {
      const schema = Object.values(t.cfg.inputSchema ?? {}).map((v) => v.description ?? '').join('\n');
      expect(bannedHits(`${t.cfg.title}\n${t.cfg.description}\n${schema}`, NOSA_WORDS), t.name).toEqual([]);
    }
  });

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
