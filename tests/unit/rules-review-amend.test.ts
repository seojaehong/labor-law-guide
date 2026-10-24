import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { parseRegulation, type Regulation } from '@/lib/rules-review/model';
import { runChecks } from '@/lib/rules-review/checks';
import { ingest } from '@/lib/rules-review/ingest';
import { amendedLine, amendsOf, lineDiff, setAmend } from '@/lib/rules-review/amend';
import { applyToSources, compareRows, itemsFor, unmark } from '@/lib/rules-review/outputs';
import { carryOver, newWorkspace, stateOf, type Workspace } from '@/lib/rules-review/workspace';
import { HwpEditDoc } from '@/lib/hwp/hwp-doc';
import { toLines } from '@/lib/hwp/apply';

const wasm = readFileSync(join(dirname(createRequire(import.meta.url).resolve('@rhwp/core/package.json')), 'rhwp_bg.wasm'));
const report = { read: 1, duplicates: [], notRegulation: [], annexFiles: [], failed: [], skipped: [] };
const reg = (body: string, name = '감사 규정'): Regulation =>
  parseRegulation({ key: name, name, fileName: `${name}.txt`, kind: 'txt', lines: [name, ...body.trim().split('\n')].map((text) => ({ text, controls: 0 })) });

const BODY = `
제1조(목적) 이 규정은 감사를 정한다.
제7조(위원회) ① 위원회는 9명 이내의 위원으로 구성한다.
② 위원장은 총장이 임명한다.
③ 위원의 임기는 2년으로 한다.
`;
const ws0 = (r = reg(BODY)): Workspace => { const w = newWorkspace([r], runChecks([r]), report, '시험기관'); w.effective = '2026-03-01'; return w; };
const lineOf = (r: Regulation, s: string) => r.lines.findIndex((l) => l.text.includes(s));

describe('바뀐 글자 찾기', () => {
  it('가운데 바뀐 글자만, 넣기만 한 것은 앞 글자 하나를 붙여, 같으면 null', () => {
    expect(lineDiff('위원은 9명 이내', '위원은 15명 이내')).toEqual({ at: 4, length: 1, to: '15' });
    expect(lineDiff('위원장은 총장이', '위원장은 이사장이')).toEqual({ at: 5, length: 1, to: '이사' });
    expect(lineDiff('총장이 임명한다', '총장이 직접 임명한다')).toEqual({ at: 3, length: 1, to: ' 직접 ' });
    expect(lineDiff('총장이 직접 임명한다', '총장이 임명한다')).toEqual({ at: 4, length: 3, to: '' });
    expect(lineDiff('같다', '같다')).toBeNull();
  });
});

describe('조문 직접 고치기', () => {
  it('고친 줄이 항목(반영)이 되고, 대비표에 그 항만 전문·나머지는 (생략), 사유는 담당자 사유', () => {
    const r = reg(BODY);
    const line = lineOf(r, '9명 이내');
    let ws = setAmend(ws0(r), r, line, r.lines[line].text.replace('9명', '15명'), { note: '위원 수 조정' });
    const [a] = amendsOf(ws, r.name);
    expect(a.kind).toBe('amend');
    expect(a.article).toBe('제7조(위원회)');
    expect(stateOf(ws, a.id).decision).toBe('반영');
    expect(amendedLine(ws, a)).toBe('제7조(위원회) ① 위원회는 15명 이내의 위원으로 구성한다.');
    const rows = compareRows(ws, r).map((x) => ({ old: unmark(x.old), neu: unmark(x.neu), why: x.why }));
    expect(rows[0]).toEqual({
      old: '제7조(위원회) ① 위원회는 9명 이내의 위원으로 구성한다.\n② (생략)\n③ (생략)',
      neu: '제7조(위원회) ① 위원회는 15명 이내의 위원으로 구성한다. <개정 2026. 3. 1.>\n② (현행과 같음)\n③ (현행과 같음)',
      why: '위원 수 조정',
    });
    // 부서 의견 요청에도 실린다
    ws = { ...ws, depts: { [r.name]: '감사실' } };
    expect(itemsFor(ws, '감사실', false).map((f) => f.id)).toContain(a.id);
    // 같은 줄을 다시 고치면 항목이 하나로 바뀌고, 원래대로 돌리면 항목이 사라진다
    ws = setAmend(ws, r, line, r.lines[line].text.replace('9명', '20명'));
    expect(amendsOf(ws, r.name)).toHaveLength(1);
    expect(stateOf(ws, amendsOf(ws, r.name)[0].id).note).toBe('위원 수 조정');
    ws = setAmend(ws, r, line, r.lines[line].text);
    expect(amendsOf(ws, r.name)).toHaveLength(0);
    expect(compareRows(ws, r)).toEqual([]);
  });

  it('줄 끝에 줄을 더하면(새 항) 대비표 개정안에 새 줄로 실린다', () => {
    const r = reg(BODY);
    const line = lineOf(r, '임기는 2년');
    const ws = setAmend(ws0(r), r, line, `${r.lines[line].text}\n④ 위원은 연임할 수 있다.`);
    const neu = unmark(compareRows(ws, r)[0].neu);
    expect(neu).toContain('③ 위원의 임기는 2년으로 한다.\n④ 위원은 연임할 수 있다. <개정 2026. 3. 1.>');
  });

  it('다시 올려 줄 번호가 밀려도 같은 줄을 찾아 붙고, 그 줄이 없어졌으면 잃은 것으로 센다', () => {
    const r = reg(BODY);
    const line = lineOf(r, '9명 이내');
    const ws = setAmend(ws0(r), r, line, r.lines[line].text.replace('9명', '15명'), { note: '위원 수 조정' });
    const id = amendsOf(ws, r.name)[0].id;
    const shifted = reg(BODY.replace('제7조', '제2조(정의) 이 규정의 용어는 다음과 같다.\n제7조'));
    const again = carryOver(ws, ws0(shifted));
    const [a] = amendsOf(again.ws, r.name);
    expect(a.id).toBe(id);
    expect(a.spans[0].line).toBe(lineOf(shifted, '9명 이내'));
    expect(unmark(compareRows(again.ws, shifted)[0].neu)).toContain('15명 이내');
    expect(again.lost).toBe(0);
    const gone = carryOver(ws, ws0(reg(BODY.replace('9명 이내의 위원', '11명 이내의 위원'))));
    expect(amendsOf(gone.ws, r.name)).toHaveLength(0);
    expect(gone.lost).toBe(1);
  });

  it('한글 원본 반영본에 고친 글자가 들어가고, 새 줄을 더한 고침은 직접 고칠 곳으로 남는다', async () => {
    const bytes = new Uint8Array(readFileSync(join(__dirname, '../fixtures/laws/sample-rules.hwpx')));
    const { regs, sources } = await ingest([{ path: '시험 규칙.hwpx', bytes }], { wasm });
    const r = regs[0];
    const a = r.lines.findIndex((l) => l.text.includes('근로기준법에 따른다'));
    const b = r.lines.findIndex((l, i) => i !== a && l.text.trim().length > 5 && !l.controls);
    let ws = newWorkspace(regs, [], report);
    ws = setAmend(ws, r, a, r.lines[a].text.replace('따른다', '따라 정한다'));
    ws = setAmend(ws, r, b, `${r.lines[b].text}\n새 줄`);
    const [res] = await applyToSources(ws, sources, wasm);
    expect(res.error).toBeUndefined();
    expect(res.applied).toBe(1);
    expect(res.manual.map((m) => m.why)).toEqual(['줄을 새로 넣는 고침']);
    const doc = await HwpEditDoc.open(res.bytes!, wasm);
    const text = toLines(doc.paragraphs()).map((l) => l.text).join('\n');
    doc.free();
    expect(text).toContain('근로기준법에 따라 정한다');
  });
});
