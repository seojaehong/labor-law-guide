import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { HwpEditDoc } from '@/lib/hwp/hwp-doc';
import { applyChanges, canAccept, nextArticleNo, planChanges, proposalName, toLines, type Change } from '@/lib/hwp/apply';
import { canApplyText } from '@/lib/hwp/apply-guard';
import type { PeriodItem, StdRule } from '@/lib/laws/standard-check';
import type { Verdict } from '@/lib/laws/rules-check';

// 픽스처 = scripts/laws/make_table_rules_fixture.py 로 만든 합성 문서(본문 대부분이 표 셀·중첩 셀 안, 구역 둘, 머리 굵은 12pt)
const fx = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../fixtures/laws', name)));
const wasm = readFileSync(join(dirname(createRequire(import.meta.url).resolve('@rhwp/core/package.json')), 'rhwp_bg.wasm'));

const rule = (topic: string, clause: string, extra: Partial<StdRule> = {}): StdRule => ({
  lawId: 'x', law: '시험법', article: '제1조', effective: '20260101', topic, art93: '', required: true,
  keywords: [], ok: [], stale: [], point: '', clause, mst: null, ...extra,
});
const item = (id: string, title: string, rules: StdRule[], status: PeriodItem['status'] = '고칠 것', user: string[] = [], stale: string[][] = []): PeriodItem => ({
  std: { id, no: '제1조', title, chapter: null, kind: '필수', text: '', laws: [], keywords: [], status: 'checked' },
  user: user.map((no) => ({ no, title, text: '' })),
  events: [],
  verdicts: rules.map((r, i): Verdict => ({ rule: r, status: '미반영', where: null, stale: stale[i] ?? r.stale, missing: [] })),
  status, proposal: rules.map((r) => r.clause).join('\n\n'), proposalFrom: '매핑',
});

const ITEMS: PeriodItem[] = [
  item('s-spouse', '배우자 출산휴가', [rule('배우자 출산휴가 확대',
    '제○조(배우자 출산휴가) ① 회사는 근로자가 배우자의 출산을 이유로 휴가를 고지하는 경우 20일의 유급휴가를 준다.\n② 배우자 출산휴가는 배우자가 출산한 날부터 120일이 지나면 사용할 수 없다.\n③ 배우자 출산휴가는 3회에 한정하여 나누어 사용할 수 있다.')], '고칠 것', ['제5조']),
  item('s-ivf', '난임치료휴가', [rule('난임치료휴가 신설', '제○조(난임치료휴가) ① 회사는 근로자가 난임치료를 받기 위하여 휴가를 청구하는 경우 연간 6일 이내의 휴가를 준다.\n② 최초 2일은 유급으로 한다.')], '조문 추가'),
  item('s-labor', '휴일', [rule('노동절 명칭', '○. 노동절(5월 1일)', { everywhere: true, stale: ['근로자의 날'], ok: ['노동절'] })]),
  item('s-holiday', '유급휴일', [rule('유급휴일 정비', '제○조(유급휴일) 회사는 노동절과 주 1회 이상의 유급휴일을 준다.')], '고칠 것', ['제7조']),
  item('s-leave', '휴가', [rule('휴가 신청', '제○조(휴가) ② 휴가는 사흘 전까지 신청한다.')], '고칠 것', ['제3조']),
  item('s-purpose', '목적', [rule('목적 정비', '제○조(목적) 이 규칙은 직원의 근로조건과 복무를 정한다.')], '고칠 것', ['제1조']),
  item('s-part', '휴직', [rule('휴직 일부', '제○조(휴직) ① … 다만, 6개월 미만이면 허용하지 않을 수 있다.')], '고칠 것', ['제6조']),
];

async function plan(name: string) {
  const doc = await HwpEditDoc.open(fx(name), wasm);
  const p = planChanges(doc.paragraphs(), ITEMS);
  doc.free();
  return p;
}
const reopen = async (bytes: Uint8Array) => {
  const d = await HwpEditDoc.open(bytes, wasm);
  return { d, lines: toLines(d.paragraphs()) };
};
const find = (cs: Change[], kind: Change['kind'], topic: string) => cs.filter((c) => c.kind === kind && c.topic === topic);

describe('plan', () => {
  it('builds replace, insert, word, partial and blocked changes from verdicts', async () => {
    const { changes, articles } = await plan('table-rules.hwp');
    expect(articles.map((a) => (a.supplementary ? '부칙 ' : '') + a.no)).toEqual(['제1조', '제2조', '제3조', '제4조', '제5조', '제6조', '제7조', '부칙 제1조']);
    const spouse = find(changes, 'replace', '배우자 출산휴가 확대')[0];
    expect(spouse.where).toBe('제5조(배우자 출산휴가)');
    expect(spouse.after.split('\n')[0]).toBe('제5조(배우자 출산휴가) ① 회사는 근로자가 배우자의 출산을 이유로 휴가를 고지하는 경우 20일의 유급휴가를 준다.');
    const ivf = find(changes, 'insert', '난임치료휴가 신설')[0];
    expect([ivf.where, ivf.no]).toEqual(['제7조(유급휴일) 뒤', '제7조의2']);
    const words = find(changes, 'word', '노동절 명칭');
    expect(words.map((w) => w.where)).toEqual(['제3조(휴가)', '제7조(유급휴일)']);
    expect(find(changes, 'manual', '노동절 명칭')).toHaveLength(1); // 「○.」 호 문안은 손으로
    const leave = find(changes, 'replace', '휴가 신청')[0];
    expect([leave.where, leave.before]).toEqual(['제3조(휴가) ②항', '② 근로자의 날에는 휴가를 신청하지 않는다.']);
    expect(leave.overlaps).toContain(words[0].id);
    expect(find(changes, 'replace', '목적 정비')[0].blocked).toMatch('두 번 이상'); // 부칙 제1조와 번호가 겹친다
    expect(find(changes, 'manual', '휴직 일부')[0].blocked).toMatch('부분 문안');
  });
  it('numbers inserted articles after the previous one and refuses taken numbers', async () => {
    expect(nextArticleNo('제4조', new Set(['제4조']))).toBe('제4조의2');
    expect(nextArticleNo('제4조의2', new Set(['제4조의3']))).toBe('제4조의4');
    const { changes, articles } = await plan('table-rules.hwp');
    const ivf = find(changes, 'insert', '난임치료휴가 신설')[0];
    expect(canAccept({ ...ivf, no: '제5조' }, [], articles)).toMatch('이미 있습니다');
    expect(canAccept({ ...ivf, no: '5조' }, [], articles)).toMatch('모양');
    expect(canAccept(ivf, [], articles)).toBeNull();
  });
  it('enables applying only while the textarea still holds the extracted text', () => {
    const src = { text: '제1조(목적) 가' };
    expect(canApplyText(src, '제1조(목적) 가')).toBe(true);
    expect(canApplyText(src, '제1조(목적) 가나')).toBe(false);
    expect(canApplyText(null, '제1조(목적) 가')).toBe(false);
    expect(proposalName('취업규칙.hwp', 'hwpx')).toBe('취업규칙_수정안.hwpx');
  });
});

describe('paragraph edits keep the body look', () => {
  it.each(['table-rules.hwp', 'table-rules.hwpx'])('text written right after a bold article head stays plain (%s)', async (name) => {
    const { d, lines } = await reopen(fx(name));
    const ops = d.ops();
    for (const prefix of ['제7조(', '제1조(목적)', '제5조(']) {
      const l = lines.find((x) => x.text.startsWith(prefix))!;
      const head = l.text.indexOf(')') + 1;
      expect(ops.charShape(l.loc, 0).bold).toBe(true);
      ops.replace(l.loc, head, 2, ' 바꾼 '); // 머리 바로 뒤부터 바꾼다
      expect(ops.charShape(l.loc, head + 1)).toMatchObject({ bold: false, charShapeId: 0 });
      ops.replace(l.loc, head, 0, '[끼움]'); // 머리 바로 뒤에 끼운다
      expect(ops.charShape(l.loc, head)).toMatchObject({ bold: false, charShapeId: 0 });
      expect(ops.charShape(l.loc, head - 1).bold).toBe(true);
      expect(ops.text(l.loc).startsWith(l.text.slice(0, head) + '[끼움] 바꾼 ')).toBe(true);
    }
    d.free();
  });
});

describe.each(['table-rules.hwp', 'table-rules.hwpx'])('apply to %s', (name) => {
  it('replaces in a nested cell, inserts in a cell, swaps words in cell and body, and survives both save formats', async () => {
    const original = fx(name);
    const before = original.slice();
    const { changes, articles } = await plan(name);
    const spouse = find(changes, 'replace', '배우자 출산휴가 확대')[0];
    const ivf = { ...find(changes, 'insert', '난임치료휴가 신설')[0], anchor: articles.findIndex((a) => a.no === '제4조'), no: '제4조의2' };
    const words = find(changes, 'word', '노동절 명칭');
    const accepted = [spouse, ivf, ...words];
    for (const out of ['hwpx', 'hwp'] as const) {
      const r = await applyChanges(original, accepted, out, wasm);
      expect([r.kind, r.loss, r.missing]).toEqual([out, 0, []]);
      const { d, lines } = await reopen(r.bytes);
      const t = lines.map((l) => l.text);
      expect(t).toContain('③ 배우자 출산휴가는 3회에 한정하여 나누어 사용할 수 있다.');
      expect(t).toContain('제4조의2(난임치료휴가) ① 회사는 근로자가 난임치료를 받기 위하여 휴가를 청구하는 경우 연간 6일 이내의 휴가를 준다.');
      expect(t.indexOf('② 1주 근로시간은 40시간으로 한다.') + 1).toBe(t.indexOf('제4조의2(난임치료휴가) ① 회사는 근로자가 난임치료를 받기 위하여 휴가를 청구하는 경우 연간 6일 이내의 휴가를 준다.'));
      expect(t).toContain('② 노동절에는 휴가를 신청하지 않는다.'); // 셀
      expect(t).toContain('제7조(유급휴일) ① 노동절은 유급휴일로 한다.'); // 본문
      expect(t.join('\n')).not.toContain('근로자의 날');
      expect(t.filter((l) => l.startsWith('제2장'))).toHaveLength(1); // 장 제목은 그대로
      // 글자 모양: 머리는 굵은 12pt 그대로, 새 본문은 원래 본문(보통 10pt)과 같다 — 머리 굵은 글씨를 물려받지 않는다
      const ops = d.ops();
      const at = (prefix: string) => lines.find((l) => l.text.startsWith(prefix))!;
      const p5 = at('제5조(');
      expect(p5.loc.path.length).toBe(2); // 중첩 셀
      expect(ops.charShape(p5.loc, 0)).toMatchObject({ bold: true, charShapeId: 2 });
      expect(ops.charShape(p5.loc, p5.text.indexOf('20일'))).toMatchObject({ bold: false, charShapeId: 0 });
      const p3 = at('③ 배우자');
      expect(ops.charShape(p3.loc, 0)).toMatchObject({ bold: false, charShapeId: 0 });
      const p42 = at('제4조의2(');
      expect(ops.charShape(p42.loc, 0)).toMatchObject({ bold: true, charShapeId: 2 });
      expect(ops.charShape(p42.loc, p42.text.indexOf('회사는'))).toMatchObject({ bold: false, charShapeId: 0 });
      const w = at('② 노동절');
      expect(ops.charShape(w.loc, 2)).toMatchObject({ bold: false, charShapeId: 0 });
      d.free();
    }
    expect(original).toEqual(before);
  });
  it('replaces a body article with fewer paragraphs and a single 항 inside a cell', async () => {
    const { changes } = await plan(name);
    const holiday = find(changes, 'replace', '유급휴일 정비')[0];
    const leave = find(changes, 'replace', '휴가 신청')[0];
    const r = await applyChanges(fx(name), [holiday, leave], 'hwpx', wasm);
    expect([r.loss, r.missing]).toEqual([0, []]);
    const { d, lines } = await reopen(r.bytes);
    const t = lines.map((l) => l.text);
    const i = t.indexOf('제7조(유급휴일) 회사는 노동절과 주 1회 이상의 유급휴일을 준다.');
    expect(i).toBeGreaterThan(0);
    expect(t[i + 1]).toBe('부칙');
    expect(t).not.toContain('② 회사는 주 1회 이상 유급휴일을 준다.');
    expect(t).toContain('제3조(휴가) ① 연차유급휴가는 근로기준법에 따른다.');
    expect(t).toContain('② 휴가는 사흘 전까지 신청한다.');
    const ops = d.ops();
    const p7 = lines[i];
    expect(ops.charShape(p7.loc, 0)).toMatchObject({ bold: true, charShapeId: 2 });
    expect(ops.charShape(p7.loc, p7.text.indexOf('회사는'))).toMatchObject({ bold: false, charShapeId: 0 });
    d.free();
  });
  it('rebuilds from the untouched original — nothing accepted or everything rejected gives the original text', async () => {
    const original = fx(name);
    const base = (await reopen(original));
    const want = base.lines.map((l) => l.text);
    base.d.free();
    const { changes } = await plan(name);
    const spouse = find(changes, 'replace', '배우자 출산휴가 확대')[0];
    await applyChanges(original, [spouse], 'hwpx', wasm); // 수락했다가
    const r = await applyChanges(original, [], 'hwpx', wasm); // 거절·되돌리기 = 빈 수락 목록을 원본에 다시 적용
    const { d, lines } = await reopen(r.bytes);
    expect(lines.map((l) => l.text)).toEqual(want);
    d.free();
  });
  it('partial paragraph edit changes exactly one location and preserves every other paragraph after both saves', async () => {
    const original = fx(name);
    const base = await reopen(original);
    const before = base.lines.map((l) => l.text);
    const locs = base.lines.map((l) => l.loc);
    base.d.free();
    const { changes } = await plan(name);
    const leave = find(changes, 'replace', '휴가 신청')[0];
    const index = before.indexOf('② 근로자의 날에는 휴가를 신청하지 않는다.');
    expect(index).toBeGreaterThan(0);
    for (const format of ['hwp', 'hwpx'] as const) {
      const result = await applyChanges(original, [leave], format, wasm);
      const after = await reopen(result.bytes);
      const expected = [...before]; expected[index] = '② 휴가는 사흘 전까지 신청한다.';
      expect(after.lines.map((l) => l.text)).toEqual(expected);
      expect(after.lines.map((l) => l.loc)).toEqual(locs);
      // Includes nested table exceptions and supplementary clauses outside the selected 항.
      after.d.free();
    }
  });
  it('refuses overlapping, blocked and partial changes', async () => {
    const { changes } = await plan(name);
    const leave = find(changes, 'replace', '휴가 신청')[0];
    const word = find(changes, 'word', '노동절 명칭')[0];
    await expect(applyChanges(fx(name), [word, leave], 'hwpx', wasm)).rejects.toThrow('같은 자리');
    await expect(applyChanges(fx(name), [find(changes, 'replace', '목적 정비')[0]], 'hwpx', wasm)).rejects.toThrow('두 번 이상');
    await expect(applyChanges(fx(name), [find(changes, 'manual', '휴직 일부')[0]], 'hwpx', wasm)).rejects.toThrow('부분 문안');
  });
});
