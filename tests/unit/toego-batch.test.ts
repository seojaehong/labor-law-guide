// 퇴고 한 번 호출 — 문체(check_prose)와 공개 규범(check_norms)을 한 번에 돌려, 발송 게이트가 문서당 엔진을 한 번만 띄우게 한다.
// 합성 문장만 쓴다. 기대값 = 같은 글을 MCP 도구 check_prose·check_norms 에 따로 넣었을 때의 응답.
import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registerDocs } from '../../tools/k-labor/groups/docs.mjs';
import { PROSE_RRN_STOP, runToego } from '../../tools/k-labor/lib/prose/toego.mjs';

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

/** 부모(기대값)와 자식(실행 파일)이 같은 팩 환경을 보게 — 범용 팩만 */
function genericOnly<T>(fn: () => T): T {
  const old = process.env.PROSE_PACK_DIR;
  process.env.PROSE_PACK_DIR = '';
  try {
    return fn();
  } finally {
    if (old === undefined) delete process.env.PROSE_PACK_DIR;
    else process.env.PROSE_PACK_DIR = old;
  }
}

describe('runToego — 문체+공개 규범 한 번에', () => {
  it('check_prose · check_norms 를 따로 부른 응답과 같다', async () => {
    const prose = await viaTool('check_prose', { text: DOC, genre: 'general' });
    const norms = await viaTool('check_norms', { text: DOC });
    const r = runToego({ text: DOC, genre: 'general' });
    expect(r.ok).toBe(true);
    expect(strip(r.prose)).toEqual(strip(prose));
    expect(r.norms).toEqual(norms);
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

  it('공개 규범만 걸려도 ok 는 두 결과의 ok 를 함께 본다', () => {
    const r = runToego({ text: DOC, genre: 'general' });
    expect(r.ok).toBe(Boolean(r.prose?.ok && r.norms?.ok));
  });
});

// 가벼운 실행 파일(dist/toego.mjs) — 빌드가 있고 소스보다 새것일 때만 본다(빌드 없는 CI·소스만 고친 작업 트리에서는 건너뛴다)
const K = path.resolve(__dirname, '../../tools/k-labor');
const DIST = path.join(K, 'dist/toego.mjs');
const SOURCES = ['toego-cli.mjs', 'lib/common.mjs', ...fs.readdirSync(path.join(K, 'lib/prose')).map((f) => `lib/prose/${f}`)];
const fresh = fs.existsSync(DIST) && SOURCES.every((f) => fs.statSync(path.join(K, f)).mtimeMs <= fs.statSync(DIST).mtimeMs);
const childEnv = { ...process.env, PROSE_PACK_DIR: '' };

describe.skipIf(!fresh)('dist/toego.mjs', () => {
  it('인자 파일을 받아 runToego 결과를 JSON 으로 낸다', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toego-'));
    try {
      const f = path.join(dir, 'a.json');
      fs.writeFileSync(f, JSON.stringify({ text: DOC, genre: 'general' }));
      const r = JSON.parse(execFileSync(process.execPath, [DIST, f], { encoding: 'utf8', env: childEnv }));
      expect(strip(r)).toEqual(strip(genericOnly(() => runToego({ text: DOC, genre: 'general' }))));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('「-」 면 표준 입력에서 인자를 읽는다(문서 글이 파일로 남지 않게)', () => {
    const r = JSON.parse(execFileSync(process.execPath, [DIST, '-'], { input: JSON.stringify({ text: DOC }), encoding: 'utf8', env: childEnv }));
    expect(strip(r)).toEqual(strip(genericOnly(() => runToego({ text: DOC }))));
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
    const out = execFileSync(process.execPath, [DIST, '-'], { input: JSON.stringify({ text }), encoding: 'utf8', env: childEnv });
    const r = JSON.parse(out);
    expect(r.norms.spacing).toMatchObject({ counts: { A: 700 }, truncated: true });
    expect(r.norms.spacing.hits).toHaveLength(500);
  });
});
