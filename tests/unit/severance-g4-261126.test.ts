import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { calcSeverance } from '@/lib/calc/severance';
import { registerCalc } from '../../tools/k-labor/groups/calc.mjs';

// 261126 G4 검수(PR #298) — 퇴직금.
//   I8(O3)  제외기간 임금을 비우면 0 으로 보아 분모만 줄었다 — 입사 2023-01-01·마지막 2025-12-31·3개월 9,000,000·제외 60일 →
//           8,812,389원이 25,335,616원(2.9배)으로 부풀었다. 일수가 있으면 그 기간 임금을 받아야 계산한다(받지 않았으면 0 을 직접 넣는다).
//   I15(O5) 제외임금 = 임금총액(남은 기간 임금 0)이 통과해 「지급 대상 0원」이 나왔다 — 멈춘다.
//   I10(O6·F6·A3) 인쇄 산정서와 화면낭독 상태줄에 지급 대상 여부가 없어, 비대상인데 「실수령 퇴직금」 서명 산정서가 나왔다.
//   I14(A13·F11) 제외기간 안내에 육아기 근로시간 단축 기간(남녀고용평등법 제19조의3제4항)이 없고, 수습은 「시작한 날부터 3개월 이내」,
//           제7호(병역·예비군·민방위) 단서 「그 기간 중 임금을 지급받은 경우에는 그러하지 아니하다」가 없었다.
//   I21(F10) 주석 「1년(제4조제1항 본문)」 — 1년·15시간 둘 다 단서다.
// 값은 모두 합성.

const html = readFileSync(resolve('public/tools/severance.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
function run(expression: string) {
  const program = `const vm = require('node:vm'); const context = vm.createContext({document:{addEventListener(){}}}); vm.runInContext(${JSON.stringify(script)}, context); console.log(JSON.stringify(vm.runInContext(${JSON.stringify(expression)}, context)));`;
  return JSON.parse(execFileSync(process.execPath, ['-'], { input: program, encoding: 'utf8' }));
}
const check = (patch: Record<string, unknown>) =>
  run(`validateWorkerInput({...createDefaultWorker(), weeklyHours:'40', startDate:'2023-01-01', endDate:'2025-12-31', wage1:'3,000,000', ...${JSON.stringify(patch)}})`);

type Handler = (a: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
function mcp(): Handler {
  const hs: Record<string, Handler> = {};
  registerCalc({ registerTool: (n: string, _c: unknown, h: Handler) => { hs[n] = h; } });
  return hs.calc_severance!;
}
const call = async (a: Record<string, unknown>) => JSON.parse((await mcp()(a)).content[0]!.text);

const O3 = { hireDate: '2023-01-01', lastWorkDate: '2025-12-31', wageTotal: 9_000_000, weeklyHours: 40 };

describe('I8 — 제외 일수가 있으면 그 기간 임금을 비워 두지 않는다', () => {
  it('엔진: 일수 60·임금 없음 → 멈춘다(종전 25,335,616원)', () => {
    expect(() => calcSeverance({ ...O3, excludedDays: 60 })).toThrow(/그 기간에 받은 임금/);
  });
  it('엔진: 임금 0 을 직접 넣으면 계산한다(무급 기간) · 그 기간 임금 5,869,565 면 8,812,390', () => {
    expect(calcSeverance({ ...O3, excludedDays: 60, excludedWage: 0 }).amount).toBe(25_335_616);
    expect(calcSeverance({ ...O3, excludedDays: 60, excludedWage: 5_869_565 }).amount).toBe(8_812_390);
  });
  it('웹: 임금 칸 기본값은 빈칸이고, 일수만 넣으면 그 칸에서 멈춘다 · 0 을 넣으면 통과', () => {
    expect(html).not.toMatch(/<input[^>]*id="excludedWage"[^>]*value="0"/);
    expect(run(`createDefaultWorker().excludedWage`)).toBe('');
    const p = check({ excludedDays: '30' });
    expect(p.field).toBe('excludedWage');
    expect(p.message).toMatch(/받지 않았으면 0/);
    expect(check({ excludedDays: '30', excludedWage: '0' })).toBeNull();
    expect(check({ excludedDays: '0' })).toBeNull();
  });
  it('웹: 임금 칸을 0 에서 빈칸으로 바꾸면 입력이 바뀐 것으로 본다(앞 결과를 그대로 두지 않는다)', () => {
    const same = run(`(() => { const w = {...createDefaultWorker(), weeklyHours:'40', excludedDays:'30'}; return workerInputSignature({...w, excludedWage:'0'}) === workerInputSignature({...w, excludedWage:''}); })()`);
    expect(same).toBe(false);
  });
  it('웹: 검증을 거치지 않고 계산해도 엔진이 멈춘다(빈칸을 0 으로 넘기지 않는다)', () => {
    const msg = run(`(() => { try { calculateSeverance({...createDefaultWorker(), weeklyHours:'40', startDate:'2023-01-01', endDate:'2025-12-31', wage1:'9,000,000', wage2:'0', wage3:'0', excludedDays:'60'}); return 'calculated'; } catch (e) { return e.message; } })()`);
    expect(msg).toMatch(/그 기간에 받은 임금/);
  });
  it('MCP: excludedDays 만 넣으면 오류', async () => {
    const out = await call({ ...O3, excludedDays: 60 });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/그 기간에 받은 임금/);
  });
});

describe('I15 — 제외임금이 임금총액과 같으면 멈춘다', () => {
  const base = { hireDate: '2025-01-01', lastWorkDate: '2025-12-31', wageTotal: 6_200_000, weeklyHours: 40 };
  it('엔진: 6,200,000 중 6,200,000 이 제외기간 임금 → 멈춘다(종전 지급 대상 0원)', () => {
    expect(() => calcSeverance({ ...base, excludedDays: 30, excludedWage: 6_200_000 })).toThrow(/남은 기간/);
  });
  it('엔진: 1원이라도 남으면 계산한다 · 제외임금 0 은 그대로', () => {
    expect(() => calcSeverance({ ...base, excludedDays: 30, excludedWage: 6_199_999 })).not.toThrow();
    expect(() => calcSeverance({ ...base, wageTotal: 0, excludedDays: 30, excludedWage: 0 })).not.toThrow();
  });
  it('웹: 그 기간 임금이 월급여 합계와 같으면 멈춘다', () => {
    expect(check({ excludedDays: '10', excludedWage: '3,000,000' }).field).toBe('excludedWage');
    expect(check({ excludedDays: '10', excludedWage: '2,999,999' })).toBeNull();
  });
});

describe('I10 — 인쇄 산정서와 상태줄에도 지급 대상 여부를 싣는다', () => {
  // A3 재현: 2025년 내내 주 14시간, 3개월 9,200,000, 세금 직접 0
  const W = `{...createDefaultWorker(), weeklyHours:'40', startDate:'2025-01-01', endDate:'2025-12-31', wage1:'9,200,000', wage2:'0', wage3:'0', autoCalcTax:false, retirementTax:'0'`;
  const statement = (patch: string) => run(`(() => { const w = ${W}, ${patch}}; return statementHtml(calculateSeverance(w), w); })()`) as string;
  const status = (patch: string) => run(`(() => { const w = ${W}, ${patch}}; return resultStatusText(calculateSeverance(w), w); })()`) as string;

  it('주 14시간: 산정서에 「지급 대상이 아닙니다」, 금액 칸은 「실수령 퇴직금」이 아니라 참고 계산액', () => {
    const s = statement(`weeklyHours:'14'`);
    expect(s).toMatch(/15시간 미만이라 퇴직금 지급 대상이 아닙니다/);
    expect(s).toMatch(/제4조제1항 단서/);
    expect(s).not.toContain('실수령 퇴직금');
    expect(s).toContain('참고 계산액');
    // 요약 칸도 「퇴직금 3,000,000원」 한 줄로 지급액처럼 읽히지 않게
    expect(s).not.toContain('<dt>퇴직금</dt>');
    expect(s).toContain('<dt>퇴직금 계산액(참고)</dt>');
  });
  it('1년 미만: 산정서에 「1년 미만이라 지급 대상이 아닙니다」', () => {
    const s = statement(`startDate:'2025-01-02', weeklyHours:'40'`);
    expect(s).toMatch(/1년 미만이라 퇴직금 지급 대상이 아닙니다/);
    expect(s).not.toContain('실수령 퇴직금');
  });
  // 261127 needs — 종전 「시간을 비우면 산정서에 따지지 않았다고 적고 금액은 낸다」를 뒤집었다. 금액도 산정서도 내지 않는다
  it('시간을 비우면 산정서를 만들지 않는다 — 계산이 질문으로 멈춘다', () => {
    const msg = run(`(() => { try { const w = ${W}, weeklyHours:''}; return statementHtml(calculateSeverance(w), w); } catch (e) { return 'stop:' + e.message; } })()`);
    expect(msg).toMatch(/^stop:.*1주 근로시간이 몇 시간인가요/);
  });
  it('주 15시간·1년 이상이면 산정서는 종전 그대로(실수령 퇴직금, 알림 없음)', () => {
    const s = statement(`weeklyHours:'15'`);
    expect(s).toContain('실수령 퇴직금');
    expect(s).not.toMatch(/지급 대상이 아닙니다|따지지 않았습니다/);
  });
  it('상태줄(aria-live)도 같은 말을 한다 — 「계산했습니다」로 시작', () => {
    const under = status(`weeklyHours:'14'`);
    expect(under).toMatch(/^계산했습니다\./);
    expect(under).toMatch(/지급 대상이 아닙니다/);
    expect(under).not.toMatch(/실수령/);
    expect(status(`weeklyHours:'40'`)).toBe('계산했습니다. 퇴직금은 3,000,000원, 세금을 뺀 실수령 추정은 3,000,000원입니다.');
    expect(script).toContain('setResultStatus(resultStatusText(result, w))');
  });
});

describe('I14 — 제외기간 안내', () => {
  const hint = html.match(/<p id="excludedHint"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '';
  it('웹 안내: 수습은 시작한 날부터 3개월 이내 · 병역 등 기간은 임금을 받았으면 빼지 않음 · 육아기 근로시간 단축 기간', () => {
    expect(hint).toContain('수습을 시작한 날부터 3개월 이내');
    expect(hint).toMatch(/병역.*임금을 받았으면 빼지 않습니다/);
    expect(hint).toContain('육아기 근로시간 단축 기간');
    expect(hint).toContain('제19조의3 제4항');
  });
  it('MCP 설명도 같은 범위', () => {
    const calc = readFileSync(resolve('tools/k-labor/groups/calc.mjs'), 'utf8');
    const from = calc.indexOf("    'calc_severance',");
    const block = calc.slice(from, calc.indexOf("    'calc_holiday_pay',", from));
    expect(block).toContain('육아기 근로시간 단축');
    expect(block).toContain('제19조의3제4항');
    expect(block).toContain('3개월 이내');
    expect(block).toMatch(/excludedWage: z\.number\(\)\.min\(0\)\.optional\(\)\.describe\('[^']*excludedDays 가 0보다 크면/);
  });
});

describe('I21 — 지급 요건 주석', () => {
  it('1년을 「제4조제1항 본문」으로 적지 않는다', () => {
    expect(html).not.toContain('1년(제4조제1항 본문)');
  });
});
