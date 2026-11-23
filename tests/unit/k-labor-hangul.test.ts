// docs 묶음 — 한글(hwp·hwpx) 읽기·서식 채우기·마크다운 되쓰기(kordoc 4.25.3).
// 견본은 시험 때 만든다: hwpx = 저장소 mdToHwpx(가로·세로 병합 표 + 빈칸 괄호 문단), hwp = 그 hwpx 를 kordoc 으로 HWP 5.x 저장. 실명·주민번호 없음.
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { mdToHwpx } from '@/lib/md-hwpx';
import { registerDocs, docsTools } from '../../tools/k-labor/groups/docs.mjs';
import { loadKordoc } from '../../tools/k-labor/lib/hangul-kordoc.mjs';
import { REMOTE_TOOLS } from '../../tools/k-labor/remote.mjs';

type Reg = { name: string; cfg: { title?: string; description?: string; annotations?: Record<string, boolean> }; handler: (a: object) => Promise<{ content: { text: string }[] }> };
const tools: Reg[] = [];
registerDocs({ registerTool: (name: string, cfg: Reg['cfg'], handler: Reg['handler']) => tools.push({ name, cfg, handler }) });
const call = async (name: string, a: object) => JSON.parse((await tools.find((t) => t.name === name)!.handler(a)).content[0].text);

const BLANK = ' '.repeat(8);
const MD = [
  '# 합성 신청서',
  '',
  '| 구분 | 성명 |  | 연락처 |  |',
  '|---|---|---|---|---|',
  '| 신청인 | 주소 |  | < | < |',
  '| ^ | 비고 | 합성 견본 | < | < |',
  '',
  `목격자가 있는 경우: 성명(${BLANK}), 연락처(${BLANK}), 관계(${BLANK})`,
  '',
  '끝 문단.',
].join('\n');

const CFB = [0xd0, 0xcf, 0x11, 0xe0];
const isCfb = (b: Uint8Array) => CFB.every((x, i) => b[i] === x);
const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b;

/** hwpx 본문에서 needle 이 든 문단 글자(hp:t 를 이은 것) */
async function paraText(hwpx: Uint8Array, needle: string) {
  const z = await JSZip.loadAsync(hwpx);
  const xml = await z.file('Contents/section0.xml')!.async('string');
  for (const m of xml.matchAll(/<hp:p\b[\s\S]*?<\/hp:p>/g)) {
    if (m[0].includes('<hp:tbl')) continue;
    const t = [...m[0].matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g)].map((x) => x[1]).join('');
    if (t.includes(needle)) return t;
  }
  return null;
}
/** 괄호 칸마다 안의 공백 수 — 「성명(…)」 「연락처(…)」 「관계(…)」 */
const blanks = (t: string) => Object.fromEntries([...t.matchAll(/(성명|연락처|관계)\(([^)]*)\)/g)].map((m) => [m[1], m[2]]));

// kordoc 은 tools/k-labor 의존성이다(루트 설치에는 없다). 없으면 이유를 남기고 파일 시험을 건너뛴다 — `cd tools/k-labor && npm.cmd ci`
let HAS = true;
try {
  await loadKordoc();
} catch {
  HAS = false;
  console.warn('[k-labor-hangul] kordoc 이 설치돼 있지 않아 파일 시험을 건너뜁니다 — tools/k-labor 에서 npm.cmd ci');
}

let dir = '';
let hwpx = '';
let hwp = '';
beforeAll(async () => {
  if (!HAS) return;
  dir =fs.mkdtempSync(path.join(os.tmpdir(), 'k-labor-hangul-'));
  const x = await mdToHwpx(MD, { features: { table: { merge: true, vmerge: true } } });
  hwpx = path.join(dir, '견본.hwpx');
  fs.writeFileSync(hwpx, x);
  const k = await loadKordoc();
  hwp = path.join(dir, '견본.hwp');
  fs.writeFileSync(hwp, await k.hwpxToHwp(x, { warnings: [] }));
}, 60_000);
afterAll(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

describe('docs 묶음 — kordoc 도구 등록', () => {
  it('세 도구가 docs 묶음에 있고 원격판에는 없다', () => {
    for (const n of ['read_hwp_as_markdown', 'fill_hwp_form', 'patch_hwp_from_markdown']) {
      expect(docsTools).toContain(n);
      expect(tools.map((t) => t.name)).toContain(n);
      expect(REMOTE_TOOLS).not.toContain(n);
    }
    expect(tools.find((t) => t.name === 'read_hwp_as_markdown')!.cfg.annotations).toMatchObject({ readOnlyHint: false, openWorldHint: false });
    // patch 는 keep 원고가 필요하다는 것을 설명에 담는다
    expect(tools.find((t) => t.name === 'patch_hwp_from_markdown')!.cfg.description).toMatch(/layout.*keep/);
  });
});

describe.skipIf(!HAS)('read_hwp_as_markdown', () => {
  it('hwp·hwpx → md 파일, 가로·세로 병합(colspan·rowspan)이 남는다', async () => {
    for (const [src, kind] of [[hwpx, 'hwpx'], [hwp, 'hwp']] as const) {
      const out = path.join(dir, `읽기-${kind}.md`);
      const r = await call('read_hwp_as_markdown', { file: src, outFile: out });
      expect(r.ok, JSON.stringify(r)).toBe(true);
      expect(r.kind).toBe(kind);
      expect(r.file.path).toBe(out);
      const md = fs.readFileSync(out, 'utf8');
      // 원본은 5열(가로 병합 3칸). kordoc 은 내용 없는 끝 열을 빼고 내보내 4열·colspan 2 로 보인다(병합 자체는 그대로)
      expect(md).toMatch(/<td colspan="2"><\/td>/);
      expect(md).toMatch(/<td colspan="2">합성 견본<\/td>/);
      expect(md).toMatch(/<td rowspan="2">신청인<\/td>/);
      expect(md).toContain('합성 견본');
      expect(md).toContain('끝 문단.');
      // 같은 파일은 덮어쓰지 않는다
      expect((await call('read_hwp_as_markdown', { file: src, outFile: out })).ok).toBe(false);
    }
  });

  it('한글 문서가 아니면·md 가 아닌 출력이면 멈춘다', async () => {
    const txt = path.join(dir, '글.hwp');
    fs.writeFileSync(txt, '한글 문서 아님');
    expect((await call('read_hwp_as_markdown', { file: txt, outFile: path.join(dir, 'x.md') })).error).toMatch(/한글 문서/);
    expect((await call('read_hwp_as_markdown', { file: hwpx, outFile: path.join(dir, 'x.txt') })).ok).toBe(false);
  });
});

describe.skipIf(!HAS)('fill_hwp_form', () => {
  it('hwp 서식 → .hwp 출력은 CFB 이고 다시 읽으면 값이 있다 / .hwpx 출력은 zip', async () => {
    const values = { 성명: '가상인', 주소: '가상시 견본로 1' };
    const oh = path.join(dir, '채움.hwp');
    const r = await call('fill_hwp_form', { file: hwp, values, outFile: oh });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(r.filled.map((f: { label: string }) => f.label)).toEqual(expect.arrayContaining(['성명', '주소']));
    expect(r.unmatched).toEqual([]);
    const b = new Uint8Array(fs.readFileSync(oh));
    expect(isCfb(b)).toBe(true);
    const back = path.join(dir, '채움-다시.md');
    expect((await call('read_hwp_as_markdown', { file: oh, outFile: back })).ok).toBe(true);
    expect(fs.readFileSync(back, 'utf8')).toMatch(/가상인[\s\S]*가상시 견본로 1/);

    const ox = path.join(dir, '채움.hwpx');
    const x = await call('fill_hwp_form', { file: hwpx, values, outFile: ox });
    expect(x.ok, JSON.stringify(x)).toBe(true);
    expect(isZip(new Uint8Array(fs.readFileSync(ox)))).toBe(true);
  });

  it('못 찾은 라벨은 숨기지 않는다 — ok:false·incomplete, unmatched 에 이름, 파일은 남긴다', async () => {
    const out = path.join(dir, '채움-일부.hwpx');
    const r = await call('fill_hwp_form', { file: hwpx, values: { 성명: '가상인', 없는칸: '값' }, outFile: out });
    expect(r.ok).toBe(false);
    expect(r.incomplete).toBe(true);
    expect(r.unmatched).toEqual(['없는칸']);
    expect(r.filled.map((f: { label: string }) => f.label)).toContain('성명');
    expect(fs.existsSync(out)).toBe(true);
  });

  it('주민번호 모양 값·확장자 밖 출력·원본 덮어쓰기는 멈춘다', async () => {
    expect((await call('fill_hwp_form', { file: hwpx, values: { 성명: '900101-1234568' }, outFile: path.join(dir, 'r.hwpx') })).ok).toBe(false);
    expect(fs.existsSync(path.join(dir, 'r.hwpx'))).toBe(false);
    expect((await call('fill_hwp_form', { file: hwpx, values: { 성명: '가' }, outFile: path.join(dir, 'r.pdf') })).ok).toBe(false);
    expect((await call('fill_hwp_form', { file: hwpx, values: { 성명: '가' }, outFile: hwpx })).ok).toBe(false);
  });
});

describe.skipIf(!HAS)('patch_hwp_from_markdown', () => {
  const keepMd = async (src: string, name: string) => {
    const out = path.join(dir, name);
    const r = await call('read_hwp_as_markdown', { file: src, outFile: out, layout: 'keep' });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    return out;
  };

  it('고치지 않은 원고 = applied 0·skipped 0, 같은 형식으로 나온다', async () => {
    for (const [src, ext] of [[hwp, 'hwp'], [hwpx, 'hwpx']] as const) {
      const md = await keepMd(src, `그대로-${ext}.md`);
      const out = path.join(dir, `그대로.${ext}`);
      const r = await call('patch_hwp_from_markdown', { file: src, markdownFile: md, outFile: out });
      expect(r).toMatchObject({ applied: 0, skipped: [], changes: { removedLines: 0, addedLines: 0 } });
      expect(r).toMatchObject({ applied: 0, skipped: [] });
      const b = new Uint8Array(fs.readFileSync(out));
      expect(ext === 'hwp' ? isCfb(b) : isZip(b)).toBe(true);
    }
  });

  it('빈칸 괄호 하나만 고치면 다른 괄호의 공백은 원본 그대로(hwp·hwpx)', async () => {
    const k = await loadKordoc();
    for (const [src, ext] of [[hwp, 'hwp'], [hwpx, 'hwpx']] as const) {
      const before = blanks((await paraText(ext === 'hwp' ? await k.hwpToHwpx(new Uint8Array(fs.readFileSync(src))) : new Uint8Array(fs.readFileSync(src)), '목격자'))!);
      expect(before).toEqual({ 성명: BLANK, 연락처: BLANK, 관계: BLANK });
      const md = await keepMd(src, `빈칸-${ext}.md`);
      const text = fs.readFileSync(md, 'utf8');
      const edited = text.replace(/성명\(\s*\)/, '성명(가상인)');
      expect(edited).not.toBe(text);
      fs.writeFileSync(md, edited);
      const out = path.join(dir, `빈칸.${ext}`);
      const r = await call('patch_hwp_from_markdown', { file: src, markdownFile: md, outFile: out });
      expect(r.ok, JSON.stringify(r)).toBe(true);
      expect(r.applied).toBe(1);
      expect(r.changes).toEqual({ removedLines: 1, addedLines: 1 });
      const ob = new Uint8Array(fs.readFileSync(out));
      const after = blanks((await paraText(ext === 'hwp' ? await k.hwpToHwpx(ob) : ob, '목격자'))!);
      expect(after).toEqual({ 성명: '가상인', 연락처: BLANK, 관계: BLANK });
    }
  });

  it('윈도우 줄바꿈(CRLF)으로 저장한 원고도 잔차 없이 되쓴다', async () => {
    const md = await keepMd(hwp, 'crlf.md');
    fs.writeFileSync(md, fs.readFileSync(md, 'utf8').replace('끝 문단.', '끝 문단 고침.').replace(/\n/g, '\r\n'));
    const r = await call('patch_hwp_from_markdown', { file: hwp, markdownFile: md, outFile: path.join(dir, 'crlf.hwp') });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(r.applied).toBe(1);
    expect(r.verification).toMatchObject({ added: 0, removed: 0, modified: 0 });
  });

  it('HWP 5.x 에 문단을 더하면 못 바꾼 편집으로 보고한다 — ok:false·incomplete·skipped, 파일은 남긴다', async () => {
    const md = await keepMd(hwp, '문단추가.md');
    fs.writeFileSync(md, `${fs.readFileSync(md, 'utf8')}\n\n새로 더한 문단.\n`);
    const out = path.join(dir, '문단추가.hwp');
    const r = await call('patch_hwp_from_markdown', { file: hwp, markdownFile: md, outFile: out });
    expect(r.ok).toBe(false);
    expect(r.incomplete).toBe(true);
    expect(r.skipped.length).toBeGreaterThan(0);
    expect(r.skipped[0].reason).toBeTruthy();
    expect(fs.existsSync(out)).toBe(true);
  });

  it('출력 확장자가 원본 형식과 다르면·md 파일이 아니면 멈춘다', async () => {
    const md = await keepMd(hwpx, '형식.md');
    expect((await call('patch_hwp_from_markdown', { file: hwpx, markdownFile: md, outFile: path.join(dir, '형식.hwp') })).error).toMatch(/hwpx/);
    expect((await call('patch_hwp_from_markdown', { file: hwpx, markdownFile: hwpx, outFile: path.join(dir, '형식2.hwpx') })).ok).toBe(false);
  });
});
