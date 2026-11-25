// docs 묶음 kordoc 3도구 — G4 리뷰(PR #259 판정표 A1~A20·C2) 경로별 시험.
// 원칙: 덜 됐는데 ok:true 는 없다. 건너뛴 것은 숨기지 않는다. 견본은 합성(실명·주민번호 없음, 주민번호 모양은 가상값).
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mdToHwpx } from '@/lib/md-hwpx';
import { registerDocs } from '../../tools/k-labor/groups/docs.mjs';
import * as H from '../../tools/k-labor/lib/hangul-kordoc.mjs';

// kordoc 은 tools/k-labor 의존성이다(루트 설치에는 없다). 없으면 이유를 남기고 건너뛴다 — `cd tools/k-labor && npm.cmd ci`
let HAS = true;
try {
  await H.loadKordoc();
} catch {
  HAS = false;
  console.warn('[k-labor-hangul-g4] kordoc 이 설치돼 있지 않아 건너뜁니다 — tools/k-labor 에서 npm.cmd ci');
}

type Reg = { name: string; handler: (a: object) => Promise<{ content: { text: string }[] }> };
const tools: Reg[] = [];
registerDocs({ registerTool: (name: string, _cfg: unknown, handler: Reg['handler']) => tools.push({ name, handler }) });
const call = async (name: string, a: object) => {
  const raw = (await tools.find((t) => t.name === name)!.handler(a)).content[0].text;
  return { ...JSON.parse(raw), _raw: raw };
};

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
// 한 번씩만 나오는 라벨 — 주소 칸 하나
const MD1 = ['# 합성 단일', '', '| 주소 |  |', '|---|---|', '| 비고 |  |', '', '끝.'].join('\n');
// 1x1 PNG(투명)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

let dir = '';
let hwpx = '';
let hwp = '';
let one = '';
const p = (n: string) => path.join(dir, n);
const keepMd = async (src: string, name: string) => {
  const r = await call('read_hwp_as_markdown', { file: src, outFile: p(name), layout: 'keep' });
  expect(r.ok, r._raw).toBe(true);
  return p(name);
};

beforeAll(async () => {
  if (!HAS) return;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'k-labor-hangul-g4-'));
  const x = await mdToHwpx(MD, { features: { table: { merge: true, vmerge: true } } });
  hwpx = p('견본.hwpx');
  fs.writeFileSync(hwpx, x);
  const k = await H.loadKordoc();
  hwp = p('견본.hwp');
  fs.writeFileSync(hwp, await k.hwpxToHwp(x, { warnings: [] }));
  one = p('단일.hwpx');
  fs.writeFileSync(one, await mdToHwpx(MD1));
}, 60_000);
afterAll(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

describe.skipIf(!HAS)('fill_hwp_form — G4', () => {
  it('A1 배열 값이 칸보다 많으면 남은 값을 leftover 로 알리고 incomplete', async () => {
    const r = await call('fill_hwp_form', { file: one, values: { 주소: ['가상시 1', '가상시 2'] }, outFile: p('a1.hwpx') });
    expect(r.ok).toBe(false);
    expect(r.incomplete).toBe(true);
    expect(r.leftover).toEqual([{ label: '주소', requested: 2, filled: 1 }]);
  });

  it('A2 정규화하면 같은 라벨(「성명」·「성 명」)은 채우기 전에 거절', async () => {
    const r = await call('fill_hwp_form', { file: one, values: { 성명: '가', '성 명': '나' }, outFile: p('a2.hwpx') });
    expect(r.ok).toBe(false);
    expect(r.incomplete).toBeUndefined();
    expect(r.collisions).toEqual([['성명', '성 명']]);
    expect(fs.existsSync(p('a2.hwpx'))).toBe(false);
  });

  it('A3 표 칸에만 쓰고 목격자 「성명( )」 괄호는 비어 있다, filled 에 대상 칸(표·행·열)을 싣는다', async () => {
    const r = await call('fill_hwp_form', { file: hwpx, values: { 성명: '가상인', 주소: '가상시 1' }, outFile: p('a3.hwpx') });
    expect(r.ok, r._raw).toBe(true);
    expect(r.filled.find((f: { label: string }) => f.label === '성명').target).toEqual({ table: 0, row: 0, col: 2 });
    const back = await call('read_hwp_as_markdown', { file: p('a3.hwpx'), outFile: p('a3.md') });
    expect(back.ok, back._raw).toBe(true);
    const md = fs.readFileSync(p('a3.md'), 'utf8');
    expect(md.match(/가상인/g)?.length).toBe(1);
    expect(md).toMatch(/목격자가 있는 경우: 성명\(\s*\)/);
  });

  it('A3 requireUnique 기본 true — 두 곳에 맞는 라벨은 채우지 않고 rejected·incomplete, false 면 두 곳 다', async () => {
    fs.writeFileSync(p('두칸.hwpx'), await mdToHwpx(['| 성명 |  |', '|---|---|', '| 비고 | 가 |', '', '사이 문단.', '', '| 성명 |  |', '|---|---|', '| 비고 | 나 |'].join('\n')));
    const r = await call('fill_hwp_form', { file: p('두칸.hwpx'), values: { 성명: '가상인' }, outFile: p('a3c.hwpx') });
    expect(r.ok).toBe(false);
    expect(r.incomplete).toBe(true);
    expect(r.rejected).toEqual(['성명']);
    expect(r.filled).toEqual([]);
    const all = await call('fill_hwp_form', { file: p('두칸.hwpx'), values: { 성명: '가상인' }, outFile: p('a3d.hwpx'), requireUnique: false });
    expect(all.ok, all._raw).toBe(true);
    expect(all.filled.length).toBe(2);
  });

  it('A3 누름틀도 두 곳 이상이면 단일 값은 거절 대상(집계 도우미)', () => {
    const filled = [
      { label: '신청인', key: '신청인', source: 'clickhere' },
      { label: '신청인', key: '신청인', source: 'clickhere' },
      { label: '날짜', key: '날짜', source: 'clickhere' },
      { label: '명단', key: '명단', source: 'clickhere' },
      { label: '명단', key: '명단', source: 'clickhere' },
    ];
    expect(H.clickhereDuplicates(filled, { 신청인: '가', 날짜: '1', 명단: ['a', 'b'] })).toEqual(['신청인']);
  });

  it('A4 HWP 저장 손실 경고는 losses 로 갈라 incomplete 판정에 쓴다', () => {
    const s = H.splitLosses(['HWP 로 옮기며 빠진 내용 2건: 그림(1)', '다른 경고']);
    expect(s).toEqual({ losses: ['HWP 로 옮기며 빠진 내용 2건: 그림(1)'], warnings: ['다른 경고'] });
  });

  it('A4 .hwp 출력은 되읽어 채운 값이 있는지 대조한다(정상 경로 = 손실 0)', async () => {
    const r = await call('fill_hwp_form', { file: one, values: { 주소: '가상시 1' }, outFile: p('a4.hwp') });
    expect(r.ok, r._raw).toBe(true);
    expect(r.losses).toEqual([]);
    expect(r.verified).toEqual({ checked: 1, missing: [] });
  });

  it('A5 파싱 경고 중 손상·일부만 읽음 종류는 멈춤 대상', () => {
    expect(H.badParseWarnings([{ code: 'PARTIAL_PARSE', message: 'x' }, { code: 'SKIPPED_IMAGE', message: 'y' }]).map((w: { code: string }) => w.code)).toEqual(['PARTIAL_PARSE']);
    for (const c of ['LENIENT_CFB_RECOVERY', 'TRUNCATED_TABLE', 'MALFORMED_XML', 'BROKEN_ZIP_RECOVERY']) expect(H.badParseWarnings([{ code: c, message: '' }]).length).toBe(1);
  });

  it('A13 OLE 안이 엑셀(Workbook)이면 hwp 로 받지 않는다', async () => {
    const req = createRequire(path.join(process.cwd(), 'tools/k-labor/package.json'));
    const CFB = req('cfb');
    const cfb = CFB.utils.cfb_new();
    CFB.utils.cfb_add(cfb, 'Workbook', Buffer.from('합성'));
    fs.writeFileSync(p('xls.hwp'), CFB.write(cfb, { type: 'buffer' }));
    // detectFormat 은 이 파일을 'hwp' 로 본다(종전 판정) — detectOle2Format 이 'xls' 로 갈라 「한글 문서가 아닙니다」로 멈춰야 한다
    expect((await call('read_hwp_as_markdown', { file: p('xls.hwp'), outFile: p('xls.md') })).error).toMatch(/한글 문서/);
    expect((await call('fill_hwp_form', { file: p('xls.hwp'), values: { 가: '나' }, outFile: p('xls.hwpx') })).error).toMatch(/한글 문서/);
  });

  it('A10 쓰기 실패는 JSON 으로 돌려주고 경로 원문을 싣지 않으며 반쯤 쓴 파일을 남기지 않는다', async () => {
    fs.writeFileSync(p('막힘'), '파일');
    const out = path.join(p('막힘'), '아래', 'x.hwpx');
    const r = await call('fill_hwp_form', { file: one, values: { 주소: '가상시 1' }, outFile: out });
    expect(r.ok).toBe(false);
    expect(r._raw).not.toContain('막힘');
    expect(fs.existsSync(out)).toBe(false);
  });
});

describe.skipIf(!HAS)('read_hwp_as_markdown — G4', () => {
  it('A5 배포용 안내문만 있는 본문·빈 본문은 incomplete(파일은 남김)', async () => {
    fs.writeFileSync(p('배포.hwpx'), await mdToHwpx('이 문서는 상위 버전의 배포용 문서입니다. 문서를 읽으려면 최신 버전의 한글 뷰어가 필요합니다.'));
    const r = await call('read_hwp_as_markdown', { file: p('배포.hwpx'), outFile: p('배포.md') });
    expect(r.ok).toBe(false);
    expect(r.incomplete).toBe(true);
    expect(fs.existsSync(p('배포.md'))).toBe(true);
    fs.writeFileSync(p('빈.hwpx'), await mdToHwpx(''));
    const e = await call('read_hwp_as_markdown', { file: p('빈.hwpx'), outFile: p('빈.md') });
    expect(e.ok).toBe(false);
    expect(e.incomplete).toBe(true);
  });

  it('A12 그림이 든 hwpx 를 읽어 고치지 않고 되쓰면 applied 0·ok', async () => {
    fs.writeFileSync(p('그림.png'), PNG);
    const x = await mdToHwpx('# 그림 문서\n\n![그림](그림.png)\n\n본문.', { features: { image: true }, images: { '그림.png': new Uint8Array(PNG) } });
    fs.writeFileSync(p('그림.hwpx'), x);
    const md = await keepMd(p('그림.hwpx'), '그림.md');
    const r = await call('patch_hwp_from_markdown', { file: p('그림.hwpx'), markdownFile: md, outFile: p('그림-되쓰기.hwpx') });
    expect(r.ok, r._raw).toBe(true);
    expect(r.applied).toBe(0);
  });
});

describe.skipIf(!HAS)('patch_hwp_from_markdown — G4', () => {
  it('A6·A15 판정 도우미 — partial 도, verification 없음도 미완', () => {
    expect(H.patchVerdict({ skipped: [{ reason: 'x', partial: true }], verification: { added: 0, removed: 0, modified: 0, unchanged: 1 } })).toMatchObject({ incomplete: true, partialCount: 1, missedCount: 0 });
    expect(H.patchVerdict({ skipped: [], verification: null })).toMatchObject({ incomplete: true, residual: null });
    expect(H.patchVerdict({ skipped: [], verification: { added: 0, removed: 0, modified: 0, unchanged: 3 } })).toMatchObject({ incomplete: false });
  });

  it('A7 structure 기본 false — 원고에서 문단을 빼도 원본 문단을 지우지 않고 건너뜀으로 알린다, 바뀐 수를 따로 싣는다', async () => {
    const md = await keepMd(hwpx, 'a7.md');
    fs.writeFileSync(md, fs.readFileSync(md, 'utf8').replace('끝 문단.', ''));
    const r = await call('patch_hwp_from_markdown', { file: hwpx, markdownFile: md, outFile: p('a7.hwpx') });
    expect(r.ok).toBe(false);
    expect(r.incomplete).toBe(true);
    expect(r.skippedTotal).toBeGreaterThan(0);
    const back = await call('read_hwp_as_markdown', { file: p('a7.hwpx'), outFile: p('a7-back.md') });
    expect(fs.readFileSync(p('a7-back.md'), 'utf8')).toContain('끝 문단.');
    expect(r.changes).toEqual({ removedLines: 0, addedLines: 0 });
    expect(back.ok).toBe(true);
  });

  it('A7 빈 원고는 거절', async () => {
    fs.writeFileSync(p('빈원고.md'), '  \n');
    const r = await call('patch_hwp_from_markdown', { file: hwpx, markdownFile: p('빈원고.md'), outFile: p('빈원고.hwpx') });
    expect(r.ok).toBe(false);
    expect(fs.existsSync(p('빈원고.hwpx'))).toBe(false);
  });

  it('A8 원본에 없던 주민번호 모양·가림 표시가 원고에 생기면 거절', async () => {
    const md = await keepMd(hwpx, 'a8.md');
    const base = fs.readFileSync(md, 'utf8');
    fs.writeFileSync(md, base.replace('끝 문단.', '끝 문단 900101-1234568.'));
    expect((await call('patch_hwp_from_markdown', { file: hwpx, markdownFile: md, outFile: p('a8.hwpx') })).ok).toBe(false);
    fs.writeFileSync(md, base.replace('끝 문단.', '끝 문단 ******-*******.'));
    expect((await call('patch_hwp_from_markdown', { file: hwpx, markdownFile: md, outFile: p('a8b.hwpx') })).ok).toBe(false);
    expect(fs.existsSync(p('a8.hwpx')) || fs.existsSync(p('a8b.hwpx'))).toBe(false);
  });

  it('A9 건너뜀 발췌는 하이픈 없는 숫자열도 가리고 앞 20건 + 총수만 싣는다', () => {
    expect(H.maskExcerpt('번호 9001011234 끝')).not.toMatch(/\d{6,}/);
    expect(H.maskExcerpt('번호 900101-12 끝')).not.toMatch(/900101/);
    const many = Array.from({ length: 30 }, (_, i) => ({ reason: `r${i}` }));
    const c = H.capSkipped(many);
    expect(c.skipped.length).toBe(20);
    expect(c.skippedTotal).toBe(30);
  });

  it('A11 깨진 글자(U+FFFD)가 든 원고는 거절, EUC-KR 원고는 읽는다', async () => {
    const md = await keepMd(one, 'a11.md');
    const base = fs.readFileSync(md, 'utf8');
    fs.writeFileSync(md, base.replace('끝.', '끝�.'));
    expect((await call('patch_hwp_from_markdown', { file: one, markdownFile: md, outFile: p('a11.hwpx') })).error).toMatch(/글자/);
    expect(H.decodeMarkdown(new Uint8Array([0xb0, 0xa1]))).toBe('가'); // EUC-KR 「가」
  });

  it('A16 CR 홀로는 그대로, CRLF 만 LF 로 / hwpx CRLF 원고도 잔차 없이', async () => {
    expect(H.normalizeEol('a\r\nb\rc')).toBe('a\nb\rc');
    const md = await keepMd(hwpx, 'a16.md');
    fs.writeFileSync(md, fs.readFileSync(md, 'utf8').replace('끝 문단.', '끝 문단 고침.').replace(/\n/g, '\r\n'));
    const r = await call('patch_hwp_from_markdown', { file: hwpx, markdownFile: md, outFile: p('a16.hwpx') });
    expect(r.ok, r._raw).toBe(true);
    expect(r.applied).toBe(1);
  });

  it('A17 kordoc 사유문 정리 — 없는 CLI 안내·em dash·「대신」을 걷는다', () => {
    const s = H.sanitizeReason('편집 마크다운이 기본 출력에서 나왔습니다 — `kordoc <원본> --keep-layout-tables`(API: parse(원본, { layoutTables: "keep" }))로 뽑은 마크다운을 고쳐 다시 패치하세요 (문단 생성 대신)');
    expect(s).not.toMatch(/—|kordoc <|대신/);
    expect(s).toContain("layout 'keep'");
  });

  it('A20 읽기가 쓴 2MB 넘는 원고도 되쓰기가 받는다(한도 일치)', () => {
    expect(H.MAX_MARKDOWN_BYTES).toBeGreaterThan(2 * 1024 * 1024);
  });

  it('C2 행 끝 공백 두 칸(강제 줄바꿈)만 더한 줄은 건너뜀으로 알린다', async () => {
    const md = await keepMd(hwpx, 'c2.md');
    fs.writeFileSync(md, fs.readFileSync(md, 'utf8').replace('끝 문단.', '끝 문단.  '));
    const r = await call('patch_hwp_from_markdown', { file: hwpx, markdownFile: md, outFile: p('c2.hwpx') });
    expect(r.ok).toBe(false);
    expect(r.incomplete).toBe(true);
    expect(r.skipped.some((s: { reason: string }) => /줄바꿈/.test(s.reason))).toBe(true);
  });
});
