// docs 묶음(make_hwpx_from_markdown) — 도구 글자 금지어, 파일 쓰기·덮어쓰기 거절·입력 오류.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
    expect(tools.map((t) => t.name)).toEqual(['make_hwpx_from_markdown', 'edit_hwpx_text']);
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
