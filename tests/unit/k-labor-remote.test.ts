import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { registerRemote, REMOTE_TOOLS } from '../../tools/k-labor/remote.mjs';
import { contractRemoteSafe, contractLocalOnly } from '../../tools/k-labor/groups/contract.mjs';
import { calcRemoteSafe } from '../../tools/k-labor/groups/calc.mjs';
import { leaveRemoteSafe } from '../../tools/k-labor/groups/leave.mjs';
import { taxRemoteSafe } from '../../tools/k-labor/groups/tax.mjs';
import { dutiesRemoteSafe } from '../../tools/k-labor/groups/duties.mjs';
import { workRulesLocalOnly } from '../../tools/k-labor/groups/work-rules.mjs';

type Reg = { name: string; cfg?: { title?: string; annotations?: Record<string, boolean> }; legacy?: boolean };
function fakeServer() {
  const tools: Reg[] = [];
  return {
    tools,
    registerTool(name: string, cfg: Reg['cfg']) { tools.push({ name, cfg }); },
    tool(name: string) { tools.push({ name, legacy: true }); },
  };
}

// 원격(HTTP)판 = 파일 I/O 없는 계산 도구. contract의 식별정보 schema는 별도로 제외한다.
// 커넥터 디렉터리는 모든 도구에 title + readOnlyHint/destructiveHint 를 요구한다.
describe('k-labor 원격판 도구 목록', () => {
  const s = fakeServer();
  registerRemote(s);
  const names = s.tools.map((t) => t.name).sort();

  it('원격 가능 배열의 합과 정확히 같다(work-rules 는 법제처 icn1 실측 전까지 뺀다)', () => {
    const expected = [...calcRemoteSafe, ...leaveRemoteSafe, ...taxRemoteSafe, ...dutiesRemoteSafe].sort();
    expect(names).toEqual(expected);
    expect(names).toHaveLength(21);
    expect([...REMOTE_TOOLS].sort()).toEqual(expected);
  });

  it('계약 식별정보·주민번호 명단·발송·파일 도구가 없다', () => {
    for (const n of ['find_branch', 'make_form', 'popbill_status', 'send_fax', 'fax_result', 'send_sms', 'sms_result', ...contractRemoteSafe, ...contractLocalOnly, ...workRulesLocalOnly])
      expect(names, n).not.toContain(n);
  });

  it('모든 도구가 title 과 읽기 전용 주석을 단다', () => {
    for (const t of s.tools) {
      expect(t.legacy, t.name).toBeUndefined();
      expect(t.cfg?.title, t.name).toBeTruthy();
      expect(t.cfg?.annotations?.readOnlyHint, t.name).toBe(true);
      expect(t.cfg?.annotations?.destructiveHint, t.name).not.toBe(true);
    }
  });

  it('원격 진입은 contract·nhis·popbill·work-rules 묶음을 불러오지 않는다(홈 폴더 .env 읽기 없음)', () => {
    const src = fs.readFileSync('tools/k-labor/remote.mjs', 'utf8');
    expect(src).not.toMatch(/groups\/(contract|nhis|popbill|work-rules)\.mjs/);
  });
});
