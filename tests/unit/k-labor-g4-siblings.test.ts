// G4 261126 — 웹과 같은 엔진을 쓰는 MCP 형제(k-labor)가 같은 고침을 받는지.
// I24: 취업규칙 점검의 「이전 시행」 목록에도 부정문 표시 · I25·I26: 건보 신고서 MCP(make_form)도 부호·보수 모순을 거절.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registerWorkRules } from '../../tools/k-labor/groups/work-rules.mjs';
import { registerNhis } from '../../tools/k-labor/groups/nhis.mjs';
import { NEGATED_NOTE } from '@/lib/laws/rules-check';

type Handler = (a: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
function fakeServer() {
  const tools = new Map<string, Handler>();
  return { tools, registerTool(name: string, _cfg: unknown, handler: Handler) { tools.set(name, handler); }, tool(name: string) { throw new Error(`server.tool() 금지: ${name}`); } };
}
const call = async (s: ReturnType<typeof fakeServer>, name: string, a: Record<string, unknown>) => JSON.parse((await s.tools.get(name)!(a)).content[0].text);

describe('MCP check_work_rules_revisions — 이전 시행 목록의 부정문', () => {
  const s = fakeServer();
  registerWorkRules(s);
  it('시행이 최종 개정일 앞인 단기 육아휴직을 부정문으로 적었으면 earlier 에 note 가 붙는다', async () => {
    const text = '제48조(육아휴직)\n① 회사는 근로자가 육아휴직을 신청하더라도 1주 또는 2주 단위로는 허용하지 않는다.';
    const r = await call(s, 'check_work_rules_revisions', { text, lastRevised: '2026-09-01', asOf: '2026-11-01' });
    const e = r.earlier.find((x: { topic: string }) => x.topic === '단기 육아휴직(1주·2주) 신설');
    expect(e).toMatchObject({ note: NEGATED_NOTE, oldWordsLeft: [] });
    expect(r.earlierNotice).toContain('부정문');
  });
});

describe('MCP make_form — 부호·보수 모순 거절(웹 validate 와 같은 엔진)', () => {
  const s = fakeServer();
  registerNhis(s);
  const env = { ...process.env };
  let tmp = '';
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'k-labor-nhis-'));
    process.env.LLG_ROOT = process.cwd();
  });
  afterEach(() => {
    process.env = { ...env };
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  const biz = { mgmtNo: '12345678900', name: '가상상사', addr: '충청북도 청주시 상당구 상당로 1', ownerName: '홍대표' };
  const run = async (kind: 'loss' | 'acq', person: Record<string, unknown>) => {
    const peopleFile = path.join(tmp, 'people.json');
    fs.writeFileSync(peopleFile, JSON.stringify([person]));
    return call(s, 'make_form', { kind, biz, peopleFile, reason: '신고를 빠뜨렸습니다.', outPath: path.join(tmp, 'out.pdf') });
  };
  const leaver = { name: '김가상', rrn: '900101-1000000', lastWorkDay: '2026-01-05', nhisCode: '01', payCur: 300_000, monthsCur: 1 };
  const joiner = { name: '이가상', rrn: '950505-2000000', acqDate: '2026-03-02', monthlyPay: 2_500_000, nhisCode: '00', ceo: false };

  it('상실 04·10·99, 취득 99 는 PDF 를 만들지 않는다', async () => {
    for (const nhisCode of ['04', '10']) expect((await run('loss', { ...leaver, nhisCode })).problems.join(' ')).toContain('01 퇴직·02 사망·16 취득취소만');
    expect((await run('loss', { ...leaver, nhisCode: '99' })).problems.join(' ')).toContain('별지 제8호서식에 없는 부호');
    expect((await run('acq', { ...joiner, nhisCode: '99' })).problems.join(' ')).toContain('별지 제6호서식에 없는 부호');
    expect(fs.existsSync(path.join(tmp, 'out.pdf'))).toBe(false);
  });
  it('보수가 있는데 0개월, 1월 퇴직에 12개월이면 거절하고 맞는 값이면 만든다', async () => {
    expect((await run('loss', { ...leaver, monthsCur: 0 })).problems.join(' ')).toContain('근무개월수가 0');
    expect((await run('loss', { ...leaver, monthsCur: 12 })).problems.join(' ')).toContain('1 이하');
    expect(await run('loss', leaver)).toMatchObject({ ok: true });
  });
});
