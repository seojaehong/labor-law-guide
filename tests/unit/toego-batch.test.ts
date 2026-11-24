// 퇴고 한 번 호출 — 문체(check_prose)·공개 규범(check_norms)과, 키를 줄 때만 의미범주(check_semantic)·AI 수사(check_rhetoric)를
// 한 번에 돌려, 발송 게이트가 문서당 엔진을 한 번만 띄우게 한다.
// 합성 문장만 쓴다. 기대값 = 같은 글을 MCP 도구에 따로 넣었을 때의 응답. 비공개 팩은 뜻 없는 합성 음절로 지은 장난감 팩이다.
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registerDocs } from '../../tools/k-labor/groups/docs.mjs';
import { PROSE_RRN_STOP, runToego } from '../../tools/k-labor/lib/prose/toego.mjs';
import { toyRhetoric, toyRule } from '../fixtures/prose/toy-rhetoric';

type Handler = (a: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
const handlers: Record<string, Handler> = {};
registerDocs({ registerTool: (name: string, _meta: unknown, h: Handler) => { handlers[name] = h; } } as never);
const viaTool = async (name: string, a: Record<string, unknown>) => JSON.parse((await handlers[name](a)).content[0].text);
const strip = (o: unknown) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'ref' ? undefined : v)));

const DOC = [
  '# 가상 보고서',
  '',
  '가상 회사는 이를 검토하였고, 도급인이 할수 있는 조치임 .',
  '결과를 가르는 것은 시간입니다.',
  '> 인용 줄은 할수 있다 그대로 둔다',
].join('\n');

/** env 를 바꿔 fn 을 부르고 되돌린다 — fn 이 Promise 를 주면 끝난 뒤에 되돌린다 */
function withEnv<T>(env: Record<string, string | undefined>, fn: () => T, after?: () => void): T {
  const old = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  const set = (e: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(e)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  const restore = () => { set(old); after?.(); };
  set(env);
  let r: T;
  try {
    r = fn();
  } catch (e) {
    restore();
    throw e;
  }
  if (r instanceof Promise) return r.finally(restore) as T;
  restore();
  return r;
}

/** 부모(기대값)와 자식(실행 파일)이 같은 팩 환경을 보게 — 범용 팩만 */
const genericOnly = <T>(fn: () => T): T => withEnv({ PROSE_PACK_DIR: '' }, fn);

/** 장난감 비공개 팩 폴더를 PROSE_PACK_DIR 로 두고 fn 을 부른다(allowFull = PROSE_ALLOW_FULL=1) */
function withPack<T>(pack: unknown, allowFull: boolean, fn: () => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toego-pack-'));
  fs.writeFileSync(path.join(dir, 'toy.json'), JSON.stringify(pack));
  return withEnv({ PROSE_PACK_DIR: dir, PROSE_ALLOW_FULL: allowFull ? '1' : undefined }, fn,
    () => fs.rmSync(dir, { recursive: true, force: true }));
}

// 장난감 팩 — 뜻 없는 합성 음절·아무렇게나 붙인 칸 이름만
const toySemantic = () => ({
  format: 2,
  version: 'sem-v1',
  re: { q1: ['(?P<g1>퀩|쀼)~(?P<g3>꿿+)', ''], q4: ['^\\s*%', ''], q5: ['<<[^>]*>>', ''] } as Record<string, [string, string]>,
  rules: [['q1', 'tag-one']],
  skip: 'q4',
  span: 'q5',
  except: null,
  anchor: ['g3', 'g1'],
  allowBy: ['g1'],
  fragMax: 12,
  allow: { lecture: ['쀼'] },
});
const toyPack = () => ({
  pack: 'toy',
  version: '1',
  private: true,
  rules: [],
  semantic: toySemantic(),
  rhetoric: toyRhetoric({
    version: 'rh-v1',
    rules: [toyRule({ id: 'toy-1', family: 'toy-fam', alt: 'toy-alt', grades: { legal: 'A', blog: 'B', consult: null } })],
  }),
});
const SEM_DOC = '퀩~꿿 앞.\n쀼~꿿 뒤.';
const RH_DOC = '앞 꿿;\n퀩뷁 꿿;';
const BOTH = { semantic: {}, rhetoric: {} };

describe('runToego — 문체+공개 규범 한 번에, 의미범주·AI 수사는 키를 줄 때만', () => {
  it('check_prose · check_norms 를 따로 부른 응답과 같다', async () => {
    const [prose, norms, r] = await genericOnly(async () => [
      await viaTool('check_prose', { text: DOC, genre: 'general' }),
      await viaTool('check_norms', { text: DOC }),
      runToego({ text: DOC, genre: 'general' }),
    ]);
    expect(strip(r.prose)).toEqual(strip(prose));
    expect(r.norms).toEqual(norms);
  });

  it('키를 주지 않으면 의미범주·AI 수사는 돌지 않고, ok 는 돌린 검사만 본다(비공개 팩이 없어도)', () => {
    const r = genericOnly(() => runToego({ text: DOC, genre: 'general' }));
    expect(r).not.toHaveProperty('semantic');
    expect(r).not.toHaveProperty('rhetoric');
    expect(r.ok).toBe(Boolean(r.prose?.ok && r.norms?.ok));
    expect(r.ok).toBe(true);
  });

  it('키를 줬는데 비공개 팩이 없으면 그 검사는 「불완전」으로 실패한다(조용히 통과하지 않는다)', () => {
    const r = genericOnly(() => runToego({ text: DOC, genre: 'general', ...BOTH }));
    expect(r.prose?.ok).toBe(true);
    expect(r.norms?.ok).toBe(true);
    expect(r.semantic).toMatchObject({ ok: false, incomplete: true, code: 'NO_PRIVATE_PACK' });
    expect(r.rhetoric).toMatchObject({ ok: false, incomplete: true, code: 'NO_PRIVATE_PACK' });
    expect(r.ok).toBe(false);
    const one = genericOnly(() => runToego({ text: DOC, genre: 'general', rhetoric: {} }));
    expect(one).not.toHaveProperty('semantic');
    expect(one.ok).toBe(false);
  });

  it('비공개 팩에 그 절이 없거나 깨졌거나 규칙이 비었으면 그 검사만 불완전(식 원문은 싣지 않는다)', () => {
    const noRh = { ...toyPack(), rhetoric: undefined };
    const r1 = withPack(noRh, true, () => runToego({ text: SEM_DOC, ...BOTH }));
    expect(r1.semantic).toMatchObject({ ok: true });
    expect(r1.rhetoric).toMatchObject({ ok: false, incomplete: true, code: 'NO_PRIVATE_PACK' });
    const broken = toyPack();
    broken.semantic.re.q1 = ['(?i)퀩', ''];
    const r2 = withPack(broken, true, () => runToego({ text: SEM_DOC, ...BOTH }));
    expect(r2.semantic).toMatchObject({ ok: false, incomplete: true, code: 'SEMANTIC_PACK_INVALID' });
    expect(JSON.stringify(r2.semantic)).not.toContain('퀩');
    expect(r2.ok).toBe(false);
    const empty = toyPack();
    empty.rhetoric.rules = [];
    const r3 = withPack(empty, true, () => runToego({ text: RH_DOC, ...BOTH }));
    expect(r3.rhetoric).toMatchObject({ ok: false, incomplete: true, code: 'RHETORIC_PACK_INVALID' });
  });

  it('비공개 팩 — 허용한 PC 에서 full 이면 조각·태그·규칙까지, 아니면 위치와 참조값만', () => {
    const full = withPack(toyPack(), true, () => runToego({ text: `${SEM_DOC}\n${RH_DOC}`, detail: 'full', ...BOTH }));
    expect(full.ok).toBe(true);
    expect(full.semantic).toMatchObject({ ok: true, genre: 'legal', count: 2, hits: [{ line: 1, tag: 'tag-one', frag: '퀩~꿿' }, { line: 2, tag: 'tag-one', frag: '쀼~꿿' }] });
    expect(full.rhetoric).toMatchObject({ ok: true, track: 'legal', counts: { A: 1, B: 0 }, hits: [{ line: 4, grade: 'A', frag: '퀩뷁', alt: 'toy-alt', family: 'toy-fam', rule: 'toy-1' }] });
    const brief = withPack(toyPack(), false, () => runToego({ text: `${SEM_DOC}\n${RH_DOC}`, detail: 'full', ...BOTH }));
    expect(brief.semantic).toMatchObject({ ok: true, count: 2, withheld: true });
    expect(Object.keys(brief.semantic.hits[0]).sort()).toEqual(['line', 'ref']);
    expect(brief.rhetoric).toMatchObject({ ok: true, counts: { A: 1, B: 0 }, withheld: true });
    expect(Object.keys(brief.rhetoric.hits[0]).sort()).toEqual(['grade', 'line', 'ref']);
    expect(JSON.stringify(brief)).not.toMatch(/tag-one|toy-alt|toy-fam|toy-1|퀩~꿿/);
    // 전부 싣는 응답에만 팩 이름@판 — 판은 절마다 따로(그 절의 원천만 바뀌어도 달라진다)
    expect(full.semantic.pack).toBe('toy@sem-v1');
    expect(full.rhetoric.pack).toBe('toy@rh-v1');
    expect(brief.semantic).not.toHaveProperty('pack');
    expect(brief.rhetoric).not.toHaveProperty('pack');
  });

  it('의미범주 장르·글, AI 수사 트랙은 각자 정한다 — 문체 genre 를 물려받지 않고, 모르는 트랙은 legal(부른 이름은 requestedTrack)', () => {
    const r = withPack(toyPack(), true, () => runToego({
      text: RH_DOC,
      detail: 'full',
      semantic: { genre: 'lecture', text: SEM_DOC },
      rhetoric: { track: 'blog' },
    }));
    expect(r.semantic).toMatchObject({ genre: 'lecture', count: 1, hits: [{ line: 1 }] });
    expect(r.rhetoric).toMatchObject({ track: 'blog', counts: { A: 0, B: 1 } });
    expect(r.rhetoric).not.toHaveProperty('requestedTrack');
    const g = withPack(toyPack(), true, () => runToego({ text: RH_DOC, genre: 'lecture', detail: 'full', ...BOTH }));
    expect(g.semantic).toMatchObject({ genre: 'legal' });
    expect(g.rhetoric).toMatchObject({ track: 'legal' });
    const x = withPack(toyPack(), true, () => runToego({ text: RH_DOC, detail: 'full', rhetoric: { track: 'nope' } }));
    expect(x.rhetoric).toMatchObject({ track: 'legal', requestedTrack: 'nope', counts: { A: 1, B: 0 } });
    expect(runToego({ text: '가', semantic: { ganre: 'legal' } }).error).toBe('INVALID_ARGS');
    expect(runToego({ text: '가', rhetoric: { trak: 'legal' } }).error).toBe('INVALID_ARGS');
  });

  it('A 가 500건을 넘으면 — 게이트 경로(allA)는 전부, 화면은 500건과 truncated', async () => {
    const text = Array.from({ length: 620 }, () => '퀩뷁;').join('\n');
    const [gate, screen, tool] = await withPack(toyPack(), true, async () => [
      runToego({ text, detail: 'full', rhetoric: { allA: true } }),
      runToego({ text, detail: 'full', rhetoric: {} }),
      await viaTool('check_rhetoric', { text, detail: 'full', allA: true }),
    ]);
    expect(gate.rhetoric.counts).toEqual({ A: 620, B: 0 });
    expect(gate.rhetoric.hits).toHaveLength(620);
    expect(gate.rhetoric).not.toHaveProperty('truncated');
    expect(screen.rhetoric.hits).toHaveLength(500);
    expect(screen.rhetoric.truncated).toBe(true);
    expect(tool.hits).toHaveLength(500);
    expect(runToego({ text: '가', rhetoric: { allA: 'yes' } }).error).toBe('INVALID_ARGS');
  });

  it('MCP 도구 check_semantic·check_rhetoric 은 같은 함수다', async () => {
    const [sem, rh, r] = await withPack(toyPack(), true, async () => [
      await viaTool('check_semantic', { text: SEM_DOC, genre: 'lecture', detail: 'full' }),
      await viaTool('check_rhetoric', { text: RH_DOC, track: 'blog', detail: 'full' }),
      runToego({ text: RH_DOC, detail: 'full', semantic: { genre: 'lecture', text: SEM_DOC }, rhetoric: { track: 'blog' } }),
    ]);
    expect(sem).toEqual(r.semantic);
    expect(rh).toEqual(r.rhetoric);
  });

  it('norms 선택(checks·quote·warnOnly)을 그대로 넘긴다', async () => {
    const norms = await viaTool('check_norms', { text: DOC, checks: ['spacing'], quote: true, warnOnly: true });
    const r = runToego({ text: DOC, norms: { checks: ['spacing'], quote: true, warnOnly: true } });
    expect(r.norms).toEqual(norms);
  });

  it('주민번호 모양이면 둘 다 멈춘다', () => {
    const r = runToego({ text: '가상 900101-1234567 문서' });
    expect(r.ok).toBe(false);
    expect(String(r.error)).toMatch(/주민등록번호/);
    expect(r.prose).toBeUndefined();
  });

  it('주민번호 모양은 원문에서 찾는다 — 탭·줄바꿈으로 나눈 것도 멈추고, 숫자 없이 줄 번호만 알린다', async () => {
    const t = '첫 줄\n가상 900101\t1234567 끝\n셋째 줄\n900101\n1234567';
    const r = runToego({ text: t });
    expect(r).toMatchObject({ ok: false, error: PROSE_RRN_STOP, rrnLines: [2, 4] });
    for (const name of ['check_prose', 'check_norms']) {
      const x = await viaTool(name, { text: t });
      expect(x).toMatchObject({ ok: false, error: PROSE_RRN_STOP, rrnLines: [2, 4] });
      expect(JSON.stringify(x)).not.toMatch(/900101|1234567/);
    }
  });

  it('입력이 틀리면 고정 오류(INVALID_ARGS)', () => {
    expect(runToego({ text: '' }).error).toBe('INVALID_ARGS');
    expect(runToego({ text: '가', genre: 'nope' }).error).toBe('INVALID_ARGS');
    expect(runToego({ text: '가', norms: { checks: ['nope'] } }).error).toBe('INVALID_ARGS');
  });

  it('모르는 키는 받지 않는다(오타가 조용히 기본값으로 돌지 않게)', () => {
    expect(runToego({ text: '가', ganre: 'legal' }).error).toBe('INVALID_ARGS');
    expect(runToego({ text: '가', norms: { qoute: true } }).error).toBe('INVALID_ARGS');
  });

  it('빈 글·40만 자 초과는 사유를 붙인다', () => {
    expect(runToego({ text: '' })).toMatchObject({ ok: false, error: 'INVALID_ARGS', reason: '빈 글' });
    expect(runToego({ text: '가'.repeat(400_001) })).toMatchObject({ ok: false, error: 'INVALID_ARGS', reason: '40만 자 초과' });
  });

  it('ok 는 돌린 검사(문체·공개 규범 + 준 키)의 ok 를 함께 본다', () => {
    const r = withPack(toyPack(), true, () => runToego({ text: RH_DOC, genre: 'general', ...BOTH }));
    expect(r.ok).toBe(Boolean(r.prose?.ok && r.norms?.ok && r.semantic?.ok && r.rhetoric?.ok));
    expect(r.ok).toBe(true);
  });
});

// 가벼운 실행 파일(dist/toego.mjs) — 빌드가 있고 소스보다 새것일 때만 본다(빌드 없는 CI·소스만 고친 작업 트리에서는 건너뛴다)
const K = path.resolve(__dirname, '../../tools/k-labor');
const DIST = path.join(K, 'dist/toego.mjs');
const SOURCES = ['toego-cli.mjs', 'lib/common.mjs', ...fs.readdirSync(path.join(K, 'lib/prose')).map((f) => `lib/prose/${f}`)];
const fresh = fs.existsSync(DIST) && SOURCES.every((f) => fs.statSync(path.join(K, f)).mtimeMs <= fs.statSync(DIST).mtimeMs);
const childEnv = { ...process.env, PROSE_PACK_DIR: '' };

describe.skipIf(!fresh)('dist/toego.mjs', () => {
  it('인자 파일을 받아 runToego 결과를 JSON 으로 낸다(키를 줬는데 비공개 팩이 없으면 종료 코드 1)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toego-'));
    try {
      const f = path.join(dir, 'a.json');
      fs.writeFileSync(f, JSON.stringify({ text: DOC, genre: 'general', ...BOTH }));
      const p = spawnSync(process.execPath, [DIST, f], { encoding: 'utf8', env: childEnv });
      expect(p.status).toBe(1);
      expect(strip(JSON.parse(p.stdout))).toEqual(strip(genericOnly(() => runToego({ text: DOC, genre: 'general', ...BOTH }))));
      fs.writeFileSync(f, JSON.stringify({ text: DOC, genre: 'general' }));
      expect(spawnSync(process.execPath, [DIST, f], { encoding: 'utf8', env: childEnv }).status).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('「-」 면 표준 입력에서 인자를 읽는다(문서 글이 파일로 남지 않게)', () => {
    const p = spawnSync(process.execPath, [DIST, '-'], { input: JSON.stringify({ text: DOC }), encoding: 'utf8', env: childEnv });
    expect(strip(JSON.parse(p.stdout))).toEqual(strip(genericOnly(() => runToego({ text: DOC }))));
  });

  it('비공개 팩이 있으면 네 검사가 다 돌고 종료 코드 0', () => {
    const args = { text: `${SEM_DOC}\n${RH_DOC}`, detail: 'full', ...BOTH };
    const [p, want] = withPack(toyPack(), true, () => [
      spawnSync(process.execPath, [DIST, '-'], { input: JSON.stringify(args), encoding: 'utf8', env: { ...process.env } }),
      runToego(args),
    ]);
    expect(p.status).toBe(0);
    expect(strip(JSON.parse(p.stdout))).toEqual(strip(want));
  });

  it('UTF-8 이 아닌 인자는 고치지 않고 거절한다(종료 코드 2)', () => {
    const bad = Buffer.concat([Buffer.from('{"text":"가상 문서'), Buffer.from([0xff]), Buffer.from('"}')]);
    const p = spawnSync(process.execPath, [DIST, '-'], { input: bad, env: childEnv });
    expect(p.status).toBe(2);
    expect(p.stdout.length).toBe(0);
    expect(p.stderr.toString('utf8')).toContain('UTF-8');
  });

  it('걸림이 많은 응답도 끝까지 쓰고 끝난다', () => {
    const text = Array.from({ length: 700 }, () => '도급인이 할수 있는 조치임 .').join('\n');
    const r = JSON.parse(spawnSync(process.execPath, [DIST, '-'], { input: JSON.stringify({ text }), encoding: 'utf8', env: childEnv }).stdout);
    expect(r.norms.spacing).toMatchObject({ counts: { A: 700 }, truncated: true });
    expect(r.norms.spacing.hits).toHaveLength(500);
  });
});
