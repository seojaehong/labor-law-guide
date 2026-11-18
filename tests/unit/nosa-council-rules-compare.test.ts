import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import {
  compareCouncilRules, comparisonFormDoc, comparisonMarkdown, comparisonSheet, DEL_MARK, markChanges, NEW_MARK,
} from '@/lib/nosa-council/rules-compare';
import { UL_CLOSE, UL_OPEN, unmarkUnderline } from '@/lib/laws/underline';
import { compareDocx } from '@/lib/laws/doc-io';
import { formHwpx } from '@/lib/work-rules-report/render';
import { registerNosaRecords } from '../../tools/k-labor/groups/nosa-records.mjs';

// 가린 견본 규정(가상 사업장) + 테스트 안에서 고친 개정안만 쓴다
const SAMPLE = fs.readFileSync('tests/fixtures/nosa-council/rules-sample-2021.txt', 'utf8');
const AMENDED = SAMPLE.replace('증진함으로서', '증진함으로써')
  .replace('방해해서는 안된다.', '방해해서는 안 된다.')
  .replace(' 16. 기타 노사협조에 관한 사항', ' 16. 직장 내 성희롱 예방에 관한 사항\n\n 17. 그 밖의 노사협조에 관한 사항')
  .replace(/제15조\(회의의 공개\)[\s\S]*?아니할 수 있다\.\s*\n/, '')
  .replace('[위원 등 명부]', ' 부 칙(2026. 12. 1.)\n\n 이 규정은 2026년 12월 1일부터 시행한다.\n\n[위원 등 명부]');
const vis = (s: string) => s.split(UL_OPEN).join('[').split(UL_CLOSE).join(']');

describe('협의회규정 신·구조문대비표 대조', () => {
  const r = compareCouncilRules(SAMPLE, AMENDED);
  const row = (where: string) => r.rows.find((x) => x.where === where)!;

  it('같은 글이면 줄이 없다', () => {
    expect(compareCouncilRules(SAMPLE, SAMPLE).rows).toEqual([]);
  });

  it('바뀐 조만 순서대로 — 개정·삭제·신설', () => {
    expect(r.rows.map((x) => `${x.where}:${x.kind}`)).toEqual(['제1조:개정', '제4조:개정', '제15조:삭제', '제18조:개정', '부칙:신설']);
    expect(r.parsed.current).toMatchObject({ articles: 29, addenda: 1 });
    expect(r.parsed.amended).toMatchObject({ articles: 28, addenda: 2 });
    expect(r.workplaceName).toBe('가나상사(주)');
  });

  it('바뀐 어절에 양쪽 밑줄, 줄 끝 마침표는 빼고', () => {
    expect(vis(row('제1조').old)).toContain('[증진함으로서]');
    expect(vis(row('제1조').neu)).toContain('[증진함으로써]');
    expect(vis(row('제4조').old)).toContain('[안된다].');
    expect(vis(row('제4조').neu)).toContain('[안 된다].');
  });

  it('안 바뀐 항·호는 (생략)/(현행과 같음)', () => {
    expect(row('제4조').old).toMatch(/② \(생략\)$/);
    expect(row('제4조').neu).toMatch(/② \(현행과 같음\)$/);
    expect(row('제18조').old).toContain('1.~15. (생략)');
    expect(row('제18조').neu).toContain('1.~15. (현행과 같음)');
  });

  it('번호가 밀린 호는 내용으로 짝짓는다 — 옛 16호 ↔ 새 17호, 새 16호는 신설', () => {
    const o = vis(row('제18조').old).split('\n');
    const n = vis(row('제18조').neu).split('\n');
    const k = n.findIndex((l) => l.includes('성희롱'));
    expect(o[k]).toBe(NEW_MARK);
    expect(n[k]).toBe('[16. 직장 내 성희롱 예방에 관한 사항]');
    expect(o[k + 1]).toBe('[16. 기타 노사협조에] 관한 사항');
    expect(n[k + 1]).toBe('[17. 그 밖의 노사협조에] 관한 사항');
  });

  it('삭제한 조·신설한 부칙', () => {
    expect(row('제15조').neu).toBe(DEL_MARK);
    expect(unmarkUnderline(row('제15조').old)).toMatch(/^제15조\(회의의 공개\)/);
    expect(row('부칙').old).toBe(NEW_MARK);
    expect(unmarkUnderline(row('부칙').neu)).toContain('2026년 12월 1일부터 시행한다');
  });

  it('markChanges — 띄어쓰기만 바뀌면 붙은 어절에 긋는다', () => {
    const [a, b] = markChanges('출석 위원 3분의 2이상의 찬성', '출석위원 3분의 2 이상의 찬성');
    expect(vis(a)).toBe('[출석 위원] 3분의 [2이상의] 찬성');
    expect(vis(b)).toBe('[출석위원] 3분의 [2 이상의] 찬성');
  });

  it('마크다운 — <u> 밑줄, <신 설>·<삭 제> 는 글자 그대로', () => {
    const md = comparisonMarkdown(r.rows, { workplaceName: r.workplaceName, amendDate: '2026. 12. 1.' });
    expect(md).toContain('# 가나상사(주) 노사협의회규정 신·구조문대비표');
    expect(md).toContain('| 현 행 | 개 정 안 |');
    expect(md).toContain('<u>증진함으로써</u>');
    expect(md).toContain('| <삭 제> |');
    expect(md).not.toMatch(/[—]/);
  });

  it('docx·hwpx 에 밑줄이 실린다(hwpx 가로)', async () => {
    const meta = { workplaceName: r.workplaceName };
    const docx = await JSZip.loadAsync(await (await compareDocx({ ...comparisonSheet(r.rows, meta), widths: [7519, 7519], labelColumn: false })).arrayBuffer());
    const doc = await docx.file('word/document.xml')!.async('string');
    expect(doc).toContain('<w:u w:val="single"/>');
    expect(doc).toContain('&lt;삭 제&gt;');
    expect(doc).not.toMatch(/[]/);
    const hwpx = await JSZip.loadAsync(await formHwpx([comparisonFormDoc(r.rows, meta)], { landscape: true }));
    const sec = await hwpx.file('Contents/section0.xml')!.async('string');
    const head = await hwpx.file('Contents/header.xml')!.async('string');
    expect(sec).toContain('landscape="NARROWLY"');
    expect(sec).toMatch(/charPrIDRef="1[78]"/);
    expect(sec).not.toMatch(/[]/);
    expect(head).toContain('<hh:underline type="BOTTOM"');
  });
});

describe('make_council_rules_comparison 도구', () => {
  type Reg = { name: string; handler: (a: object) => Promise<{ content: { text: string }[] }> };
  const tools: Reg[] = [];
  registerNosaRecords({ registerTool: (name: string, _c: unknown, handler: Reg['handler']) => tools.push({ name, handler }) });
  const t = tools.find((x) => x.name === 'make_council_rules_comparison')!;
  const call = async (a: object) => JSON.parse((await t.handler(a)).content[0].text);

  it('파일을 쓰고 다시 부르면 덮어쓰지 않는다', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nosa-compare-'));
    try {
      const cur = path.join(dir, 'cur.txt');
      fs.writeFileSync(cur, SAMPLE);
      const a = { currentFile: cur, amendedText: AMENDED, amendDate: '2026. 12. 1.', outDir: path.join(dir, 'out'), formats: ['docx', 'hwpx', 'xlsx'] };
      const out = await call(a);
      expect(out.ok).toBe(true);
      expect(out.rows).toBe(5);
      expect(out.kinds).toEqual({ 개정: 3, 신설: 1, 삭제: 1 });
      expect(out.files.map((f: { format: string }) => f.format)).toEqual(['docx', 'hwpx', 'xlsx']);
      for (const f of out.files) expect(fs.statSync(f.path).size).toBeGreaterThan(1000);
      expect(out.submission).toContain('신·구조문대비표');
      expect(out.markdown).toContain('<u>');
      const again = await call(a);
      expect(again.ok).toBe(false);
      expect(again.exists).toHaveLength(3);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('주민등록번호 모양·글과 파일을 함께 주면 멈춘다', async () => {
    expect((await call({ currentText: `${SAMPLE}\n900101-1234568`, amendedText: AMENDED, outDir: os.tmpdir() })).ok).toBe(false);
    expect((await call({ currentText: SAMPLE, currentFile: 'x.txt', amendedText: AMENDED, outDir: os.tmpdir() })).error).toContain('하나만');
  });

  it('같은 글이면 파일을 만들지 않는다', async () => {
    const out = await call({ currentText: SAMPLE, amendedText: SAMPLE, outDir: path.join(os.tmpdir(), 'nosa-compare-none') });
    expect(out).toMatchObject({ ok: true, rows: 0, files: [] });
    expect(fs.existsSync(path.join(os.tmpdir(), 'nosa-compare-none'))).toBe(false);
  });
});
