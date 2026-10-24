// 신·구조문대비표(docx)와 반영본(hwpx)이 같은 결정에서 같은 고침을 내는지
import { describe, expect, it } from 'vitest';
import { parseRegulation, type Regulation } from '@/lib/rules-review/model';
import { runChecks } from '@/lib/rules-review/checks';
import { setAmend } from '@/lib/rules-review/amend';
import { compareRows, handList, planChanges, unmark } from '@/lib/rules-review/outputs';
import { newWorkspace, ownText, type Workspace } from '@/lib/rules-review/workspace';

const report = { read: 1, duplicates: [], notRegulation: [], annexFiles: [], failed: [], skipped: [] };
const reg = (body: string, name = '직원 인사 규정'): Regulation =>
  parseRegulation({ key: name, name, fileName: `${name}.hwpx`, kind: 'hwpx', lines: [name, ...body.trim().split('\n')].map((text) => ({ text, controls: 0 })) });
const ws0 = (r: Regulation): Workspace => { const w = newWorkspace([r], runChecks([r]), report, '시험기관'); w.effective = '2026-03-01'; return w; };
const idOf = (ws: Workspace, kind: string, before: string) => ws.findings.find((f) => f.kind === kind && f.before === before)!.id;
// 반영본 쪽 고침 → 줄마다 바꾼 결과
const hwpxLines = (r: Regulation, ws: Workspace) => {
  const by = new Map<number, string>();
  for (const c of [...planChanges(ws, r).changes].sort((a, b) => b.word!.at - a.word!.at)) {
    const { line, at, length } = c.word!;
    const t = by.get(line) ?? r.lines[line].text;
    by.set(line, t.slice(0, at) + c.after + t.slice(at + length));
  }
  return by;
};

describe('담당자 개정 문안(바꿀 글자 없는 항목)', () => {
  const r = reg(`
제1조(목적) 이 규정은 직원 인사를 정한다.
제2조(휴직) ① 휴직은 당해 연도 안에 신청한다.
② 복직은 제9조에 따른다.
`);
  const decided = () => {
    const ws = ws0(r);
    ws.states[idOf(ws, 'plain', '당해')] = { decision: '반영', note: '' };
    // 담당자가 현행 조문을 불러와 ②항만 고쳤다
    ws.states[idOf(ws, 'article-ref', '제9조')] = { decision: '반영', note: '인용 조문 정정', text: '제2조(휴직) ① 휴직은 당해 연도 안에 신청한다.\n② 복직은 제1조에 따른다.' };
    return ws;
  };

  it('대비표는 담당자 문안 위에 같은 조문의 글자 고침을 얹고, 반영본도 같은 글자 고침만 넣는다', () => {
    const ws = decided();
    const [row] = compareRows(ws, r);
    expect(unmark(row.neu)).toBe('제2조(휴직) ① 휴직은 해당 연도 안에 신청한다.\n② 복직은 제1조에 따른다. <개정 2026. 3. 1.>');
    expect(row.why).toContain('「당해」→「해당」');
    expect(row.why).toContain('인용 조문 정정');
    expect([...hwpxLines(r, ws).values()]).toEqual(['제2조(휴직) ① 휴직은 해당 연도 안에 신청한다.']);
  });

  it('담당자 문안은 반영본의 「직접 고칠 곳」과 결재 묶음 화면의 건수에 들어간다', () => {
    const ws = decided();
    const id = idOf(ws, 'article-ref', '제9조');
    expect(planChanges(ws, r).manual.map((m) => m.f.id)).toContain(id);
    expect(handList(ws).map((m) => m.f.id)).toContain(id);
    expect(ws.findings.filter((f) => ownText(ws, f) !== null).map((f) => f.id)).toEqual([id]);
  });

  it('담당자가 고쳐 쓴 줄의 글자 고침은 양쪽 모두 넣지 않고 빠진 고침으로 알린다', () => {
    const ws = decided();
    const id9 = idOf(ws, 'article-ref', '제9조');
    ws.states[id9] = { ...ws.states[id9], text: '제2조(휴직) ① 휴직은 그 해 안에 신청한다.\n② 복직은 제1조에 따른다.' };
    const [row] = compareRows(ws, r);
    expect(unmark(row.neu)).toBe('제2조(휴직) ① 휴직은 그 해 안에 신청한다.\n② 복직은 제1조에 따른다. <개정 2026. 3. 1.>');
    expect(row.why).not.toContain('「당해」');
    expect(hwpxLines(r, ws).size).toBe(0);
    const plainId = idOf(ws, 'plain', '당해');
    expect(handList(ws).filter((m) => m.f.id === plainId)).toHaveLength(1);
    expect(planChanges(ws, r).manual.filter((m) => m.f.id === plainId)).toHaveLength(1);
  });
});

describe('같은 글자에 겹친 고침', () => {
  const r = reg(`
제1조(목적) 이 규정은 직원 인사를 정한다.
제2조(휴직) ① 휴직은 당해 연도 안에 신청한다.
`);
  it('대비표와 반영본이 같은 고침을 고르고, 뺀 고침을 양쪽 모두 알린다', () => {
    let ws = ws0(r);
    const plainId = idOf(ws, 'plain', '당해');
    ws.states[plainId] = { decision: '반영', note: '' };
    const line = r.lines.findIndex((l) => l.text.includes('당해'));
    // 직접 고친 줄이 「당해」를 덮는다(항목 목록에서는 알기 쉬운 표현 뒤에 붙는다)
    ws = setAmend(ws, r, line, r.lines[line].text.replace('휴직은 당해 연도', '휴가는 그 연도'), { note: '휴가로 정비' });
    expect(ws.findings.findIndex((f) => f.id === plainId)).toBeLessThan(ws.findings.findIndex((f) => f.kind === 'amend'));
    const [row] = compareRows(ws, r);
    const docxLine = unmark(row.neu).replace(' <개정 2026. 3. 1.>', '');
    expect(docxLine).toBe('제2조(휴직) ① 휴가는 그 연도 안에 신청한다.');
    expect(row.why).toBe('휴가로 정비');
    expect(hwpxLines(r, ws).get(line)).toBe(docxLine);
    expect(handList(ws).map((m) => m.f.id)).toEqual([plainId]);
    expect(planChanges(ws, r).manual.map((m) => m.f.id)).toEqual([plainId]);
  });
});
