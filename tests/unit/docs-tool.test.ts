// docs 묶음(make_hwpx_from_markdown) — 도구 글자 금지어, 파일 쓰기·덮어쓰기 거절·입력 오류.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { bannedHits } from '@/lib/tool-kit/banned';
import { registerDocs } from '../../tools/k-labor/groups/docs.mjs';

const WORDS = ['노무사', '상담', '자문', '진단', '판정', '적법', '확률', '체불', '위법', '승소', '받을 수 있는 금액', '포괄', '대신', '대행', '대리', '지도'];
type Reg = { name: string; cfg: { title?: string; description?: string; inputSchema?: Record<string, { description?: string }> }; handler: (a: object) => Promise<{ content: { text: string }[] }> };

const tools: Reg[] = [];
registerDocs({ registerTool: (name: string, cfg: Reg['cfg'], handler: Reg['handler']) => tools.push({ name, cfg, handler }) });
const tool = tools[0];
const edit = tools[1];
const callEdit = async (a: object) => JSON.parse((await edit.handler(a)).content[0].text);
const call = async (a: object) => JSON.parse((await tool.handler(a)).content[0].text);

describe('docs 묶음', () => {
  it('도구 이름·설명·입력 설명에 금지어와 em dash 가 없다', () => {
    expect(tools.map((t) => t.name)).toEqual(['make_hwpx_from_markdown', 'edit_hwpx_text', 'read_hwp_as_markdown', 'fill_hwp_form', 'patch_hwp_from_markdown', 'check_prose', 'check_norms', 'check_semantic', 'check_rhetoric']);
    for (const t of tools) {
      const schema = Object.values(t.cfg.inputSchema ?? {}).map((v) => v.description ?? '').join('\n');
      const all = `${t.cfg.title}\n${t.cfg.description}\n${schema}`;
      expect(bannedHits(all, WORDS), t.name).toEqual([]);
      expect(all).not.toContain('—');
    }
  });

  it('파일을 쓰고, 같은 이름은 덮어쓰지 않는다', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-hwpx-'));
    try {
      const md = '# 합성 문서\n\n## Ⅰ. 개요\n\n본문 **굵게**.\n\n| 가 | 나 |\n|---|---|\n| 1 | 2 |\n\n[링크](x)\n';
      const r = await call({ markdown: md, preset: 'internal', outDir: dir });
      expect(r.ok).toBe(true);
      expect(r.file.path).toBe(path.join(dir, '합성 문서.hwpx'));
      expect(fs.statSync(r.file.path).size).toBe(r.file.bytes);
      expect(r).toMatchObject({ headings: 2, tables: 1, tableCells: 4, boldRuns: 1, pageBreaks: 1, signatureLines: 0 });
      expect(r.leftovers).toEqual(['](']);
      expect(bannedHits(JSON.stringify(r), WORDS)).toEqual([]);
      const again = await call({ markdown: md, preset: 'internal', outDir: dir });
      expect(again.ok).toBe(false);
      expect(again.exists).toBe(r.file.path);
      const file = path.join(dir, '원고.md');
      fs.writeFileSync(file, '﻿본문만 있는 원고');
      const f = await call({ markdownFile: file, preset: 'tribunal', outDir: dir });
      expect(f.file.path).toBe(path.join(dir, '원고.hwpx'));
      // 양식 모드 — 만든 파일을 양식으로 다시 쓴다. 없는 양식·없는 샘플은 멈춘다
      const t = await call({ markdown: '# 양식본\n\n새 본문', preset: 'internal', outDir: dir, templateFile: r.file.path, templateSamples: { body: '본문' } });
      expect(t.ok).toBe(true);
      expect((await call({ markdown: '# x', preset: 'internal', outDir: dir, templateFile: path.join(dir, '없음.hwpx') })).error).toContain('양식');
      expect((await call({ markdown: '# y', preset: 'internal', outDir: dir, templateFile: r.file.path, templateSamples: { body: '없는샘플' } })).error).toContain('샘플');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('orientation·tableLineSpacing — 입력 스키마에 있고, 가로 파일을 쓰며, 범위 밖 줄간격은 멈춘다(261124)', async () => {
    // 필드 스키마를 그대로 쓴다(시험 쪽 zod 와 도구 쪽 zod 가 다른 사본일 수 있다)
    type F = { safeParse: (v: unknown) => { success: boolean } };
    const field = (k: string) => (tool.cfg.inputSchema as unknown as Record<string, F>)[k];
    expect(field('orientation').safeParse('landscape').success).toBe(true);
    expect(field('orientation').safeParse('sideways').success).toBe(false);
    expect(field('features').safeParse({ table: { align: 'left' } }).success).toBe(true);
    expect(field('features').safeParse({ table: { align: 'center' } }).success).toBe(false);
    expect(field('tableLineSpacing').safeParse(180).success).toBe(true);
    for (const v of [99, 251, 150.5]) expect(field('tableLineSpacing').safeParse(v).success).toBe(false);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-hwpx-'));
    try {
      const md = '# 가상 가로 문서\n\n| 쟁점 | 주장 | 반론 | 검토 |\n|---|---|---|---|\n| 가 | 나 | 다 | 라 |\n';
      const r = await call({ markdown: md, preset: 'internal', outDir: dir, orientation: 'landscape', tableLineSpacing: 180 });
      expect(r.ok).toBe(true);
      const z2 = await JSZip.loadAsync(fs.readFileSync(r.file.path));
      expect(await z2.file('Contents/section0.xml')!.async('string')).toContain('landscape="NARROWLY" width="59528" height="84186"');
      expect(await z2.file('Contents/header.xml')!.async('string')).toMatch(/<hh:paraPr id="27"[^>]*>[\s\S]*?value="180"/);
      const bad = await call({ markdown: md, preset: 'internal', outDir: dir, fileBase: 'bad', tableLineSpacing: 300 });
      expect(bad.ok).toBe(false);
      expect(bad.error).toContain('tableLineSpacing');
      expect(fs.existsSync(path.join(dir, 'bad.hwpx'))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('입력이 없거나 주민등록번호 모양이 있으면 멈춘다', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-hwpx-'));
    try {
      expect((await call({ preset: 'internal', outDir: dir })).ok).toBe(false);
      expect((await call({ markdownFile: path.join(dir, '없음.md'), preset: 'internal', outDir: dir })).error).toContain('파일이 없습니다');
      const rrn = await call({ markdown: '번호 900101-1234568', preset: 'internal', outDir: dir });
      expect(rrn.ok).toBe(false);
      expect((await call({ markdown: '번호9001011234568번', preset: 'internal', outDir: dir })).ok).toBe(false);
      expect(fs.readdirSync(dir)).toEqual([]);
      // 줄인 파일 해시(16진)는 숫자 13자리가 이어져도 주민번호가 아니다(261119 루브릭 — 검수 기록 원고)
      const hash = await call({ markdown: '해시 a1234567b1d1234f / b9001011234568e9 · xlsx', preset: 'internal', outDir: dir, fileBase: 'hash' });
      expect(hash.ok).toBe(true);
      // 261120 — 14자리 접수번호(합성)·법령 판 번호(6자리-시행일)는 주민번호가 아니다. 숫자 경계·생년월일로 거른다
      const receipt = await call({ markdown: '접수번호 90010112345678 · 판 000130-20261127', preset: 'internal', outDir: dir, fileBase: 'receipt' });
      expect(receipt.ok).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('edit_hwpx_text: 글자만 바꿔 새 파일로, 원본·있는 파일은 건드리지 않고 거부는 멈춘다', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-hwpx-'));
    try {
      const made = await call({ markdown: '# 원본\n\n고칠 낱말이 하나 있다.\n\n| 가 | 나 |\n|---|---|\n| 1 |  |', preset: 'internal', outDir: dir });
      const src = made.file.path;
      const before = fs.readFileSync(src);
      const r = await callEdit({ file: src, edits: [{ old: '고칠 낱말', new: '고친 낱말' }], fills: [{ table: 0, row: 1, col: 1, text: '채움' }] });
      expect(r.ok).toBe(true);
      expect(r.file.path).toBe(src.replace(/\.hwpx$/, '_수정.hwpx'));
      expect(r.edits[0]).toMatchObject({ old: '고칠 낱말', new: '고친 낱말' });
      expect(fs.readFileSync(src).equals(before)).toBe(true);
      expect((await callEdit({ file: src, edits: [{ old: '고칠 낱말', new: 'x' }] })).exists).toBe(r.file.path);
      expect((await callEdit({ file: src, edits: [{ old: '없는 글자', new: 'x' }], outFile: path.join(dir, 'b.hwpx') })).error).toContain('없습니다');
      expect(fs.existsSync(path.join(dir, 'b.hwpx'))).toBe(false);
      expect((await callEdit({ file: src, edits: [{ old: 'a', new: 'b' }], outFile: src })).ok).toBe(false);
      expect(bannedHits(JSON.stringify(r), WORDS)).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// 261120 적대 검토 — 있는지 먼저 보고 나중에 쓰면, 같은 이름으로 동시에 부른 두 호출이 둘 다 ok 를 받고 한쪽 문서가 조용히 덮인다
describe('docs 묶음 — 같은 파일에 동시에 쓰기', () => {
  const sectionOf = async (file: string) => (await JSZip.loadAsync(fs.readFileSync(file))).file('Contents/section0.xml')!.async('string');

  it('make_hwpx_from_markdown: 같은 outDir·fileBase 로 동시에 두 번 부르면 하나만 쓰고 이긴 쪽 내용이 그대로 남는다', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-hwpx-'));
    try {
      const args = (k: string) => ({ markdown: `# 합성 동시 원고\n\n동시 원고 ${k}-표지 문장.`, preset: 'internal', outDir: dir, fileBase: '같은 이름' });
      const rs = await Promise.all(['가', '나'].map((k) => call(args(k))));
      const won = rs.filter((r) => r.ok);
      expect(won).toHaveLength(1);
      const lost = rs.find((r) => !r.ok);
      const pre = await call(args('다'));
      expect(lost).toEqual(pre);
      expect(lost.exists).toBe(path.join(dir, '같은 이름.hwpx'));
      const mine = rs.indexOf(won[0]) === 0 ? '가' : '나';
      const sec = await sectionOf(won[0].file.path);
      expect(sec).toContain(`동시 원고 ${mine}-표지`);
      expect(sec).not.toContain(`동시 원고 ${mine === '가' ? '나' : '가'}-표지`);
      expect(fs.statSync(won[0].file.path).size).toBe(won[0].file.bytes);
      expect(fs.readdirSync(dir)).toEqual(['같은 이름.hwpx']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('edit_hwpx_text: 같은 outFile 로 동시에 두 번 고치면 하나만 쓰고 이긴 쪽 내용이 그대로 남는다', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-hwpx-'));
    try {
      const made = await call({ markdown: '# 합성 원본\n\n고칠 낱말이 하나 있다.', preset: 'internal', outDir: dir });
      const out = path.join(dir, '동시 수정.hwpx');
      const args = (n: string) => ({ file: made.file.path, edits: [{ old: '고칠 낱말', new: n }], outFile: out });
      const rs = await Promise.all(['고친 가', '고친 나'].map((n) => callEdit(args(n))));
      const won = rs.filter((r) => r.ok);
      expect(won).toHaveLength(1);
      const lost = rs.find((r) => !r.ok);
      const pre = await callEdit(args('고친 다'));
      expect(lost).toEqual(pre);
      expect(lost.exists).toBe(out);
      const mine = won[0].edits[0].new;
      const sec = await sectionOf(out);
      expect(sec).toContain(mine);
      expect(sec).not.toContain(mine === '고친 가' ? '고친 나' : '고친 가');
      expect(fs.statSync(out).size).toBe(won[0].file.bytes);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('docs 묶음 — check_prose', () => {
  const prose = tools.find((t) => t.name === 'check_prose')!;
  const callProse = async (a: object) => JSON.parse((await prose.handler(a)).content[0].text);
  const withEnv = async (env: Record<string, string | undefined>, fn: () => Promise<void>) => {
    const old = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
    for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    try { await fn(); } finally { for (const [k, v] of Object.entries(old)) if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  };

  it('범용 팩(공개)은 기본으로 걸린 글자·고칠 말까지, brief 면 위치만, 주민번호 모양이면 멈춘다', async () => {
    await withEnv({ PROSE_PACK_DIR: undefined, PROSE_ALLOW_FULL: undefined }, async () => {
      const d = await callProse({ text: '합성 문장입니다. 결과를 가르는 것은 시간입니다.', genre: 'general' });
      expect(d).toMatchObject({ ok: true, genre: 'general', counts: { A: 0, B: 1 }, packCount: 1, hits: [{ word: '를 가르는 것은', rule: 'gen-L-12', pack: 'generic' }] });
      const r = await callProse({ text: '합성 문장입니다. 결과를 가르는 것은 시간입니다.', genre: 'general', detail: 'brief' });
      expect(r).toMatchObject({ ok: true, genre: 'general', counts: { A: 0, B: 1 } });
      expect(Object.keys(r.hits[0]).sort()).toEqual(['col', 'grade', 'len', 'line', 'reason', 'ref']);
      expect(JSON.stringify(r)).not.toMatch(/가르는|im-not-ai|gen-L-12/);
      const f = await callProse({ text: '결과를 가르는 것은 시간입니다.', detail: 'full' });
      expect(f.hits[0]).toMatchObject({ word: '를 가르는 것은', rule: 'gen-L-12', pack: 'generic' });
      expect((await callProse({ text: '공문입니다.', genre: 'official' })).genre).toBe('general');
      const stop = await callProse({ text: '주민번호 900101-1234567 이 있는 글' });
      expect(stop.ok).toBe(false);
      expect(stop.error).toContain('주민등록번호');
    });
  });

  it('깨진 팩·상대 경로는 건너뛰고 고정 코드만 알린다(오류 글에 팩 내용이 없다)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prose-pack-'));
    try {
      fs.writeFileSync(path.join(dir, 'x.json'), JSON.stringify({ pack: 'x', private: true, rules: [{ id: 'x-1', re: '(숨긴식', grade: 'A', reason: 'r' }] }));
      await withEnv({ PROSE_PACK_DIR: dir }, async () => {
        const r = await callProse({ text: '결과를 가르는 것은 시간입니다.' });
        expect(r).toMatchObject({ ok: false, incomplete: true, counts: { B: 1 }, skipped: [{ code: 'PACK_INVALID' }] });
        expect(JSON.stringify(r)).not.toMatch(/숨긴식|x-1|"x"/);
      });
      await withEnv({ PROSE_PACK_DIR: 'relative-dir' }, async () => {
        expect((await callProse({ text: '글' })).skipped).toEqual([{ code: 'PACK_DIR_NOT_ABSOLUTE' }]);
      });
      await withEnv({ PROSE_PACK_DIR: `${dir}-none` }, async () => {
        expect(await callProse({ text: '글' })).toMatchObject({ ok: false, incomplete: true, skipped: [{ code: 'PACK_DIR_MISSING' }] });
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('입력 상한은 코드포인트 40만 자(UTF-16 으로는 더 길어도 된다)', () => {
    const s = (prose.cfg.inputSchema as unknown as { text: { safeParse: (x: string) => { success: boolean } } }).text;
    expect(s.safeParse('😀'.repeat(200_001)).success).toBe(true);
    expect(s.safeParse('가'.repeat(400_001)).success).toBe(false);
    expect(s.safeParse('😀'.repeat(400_000)).success).toBe(true);
    expect(s.safeParse('😀'.repeat(400_001)).success).toBe(false);
    // 공개 입력 스키마(tools/list)가 실제 한도와 다른 길이(UTF-16 80만)를 내지 않는다 — JSON Schema maxLength 는 글자(코드포인트) 수다
    const js = zodToJsonSchema(s as never) as { maxLength?: number };
    expect(js.maxLength === undefined || js.maxLength === 400_000).toBe(true);
  });
});
