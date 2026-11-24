// 퇴고 한 번 호출 — 문체(check_prose)와 공개 규범(check_norms)을 한 번에 돌려, 발송 게이트가 문서당 엔진을 한 번만 띄우게 한다.
// 합성 문장만 쓴다. 기대값 = 같은 글을 MCP 도구 check_prose·check_norms 에 따로 넣었을 때의 응답.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registerDocs } from '../../tools/k-labor/groups/docs.mjs';
import { runToego } from '../../tools/k-labor/lib/prose/toego.mjs';

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

  it('입력이 틀리면 고정 오류(INVALID_ARGS)', () => {
    expect(runToego({ text: '' }).error).toBe('INVALID_ARGS');
    expect(runToego({ text: '가', genre: 'nope' }).error).toBe('INVALID_ARGS');
    expect(runToego({ text: '가', norms: { checks: ['nope'] } }).error).toBe('INVALID_ARGS');
  });

  it('공개 규범만 걸려도 ok 는 두 결과의 ok 를 함께 본다', () => {
    const r = runToego({ text: DOC, genre: 'general' });
    expect(r.ok).toBe(Boolean(r.prose?.ok && r.norms?.ok));
  });
});

// 가벼운 실행 파일(dist/toego.mjs) — 빌드가 있을 때만 본다(빌드 없는 CI 에서는 건너뛴다)
const DIST = path.resolve(__dirname, '../../tools/k-labor/dist/toego.mjs');
describe.skipIf(!fs.existsSync(DIST))('dist/toego.mjs', () => {
  it('인자 파일을 받아 runToego 결과를 JSON 으로 내고, 서버보다 훨씬 빨리 뜬다', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toego-'));
    try {
      const f = path.join(dir, 'a.json');
      fs.writeFileSync(f, JSON.stringify({ text: DOC, genre: 'general' }));
      const t0 = Date.now();
      const out = execFileSync(process.execPath, [DIST, f], { encoding: 'utf8', env: { ...process.env, PROSE_PACK_DIR: '' } });
      const ms = Date.now() - t0;
      const r = JSON.parse(out);
      expect(strip(r.prose)).toEqual(strip(runToego({ text: DOC, genre: 'general' }).prose));
      expect(ms).toBeLessThan(1500);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
