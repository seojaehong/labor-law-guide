// 재홍님 결정 E3(261126) — /exit 「확인용 추정」에도 D3 체크(재직 중 1주 소정근로시간이 15시간 이상과 미만 사이에서 바뀐 적 있음).
// 켜면 퇴직금은 엔진과 같은 문장으로 멈추고, 계산기 링크에 hoursChanged=1 을 싣는다(계산기도 켜진 채 열린다).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calcSeverance, HOURS_CHANGED_MESSAGE } from '@/lib/calc/severance';
import { estimateLeavePay, estimateSeverance, severanceCheck } from '@/app/exit/exit-calc';
import { exitResultView } from '@/app/exit/result';
import { STATUS_ESTIMATE, isStaticHtmlHref, type ResultView } from '@/components/tool-result/result-view';

const HIRE = '2023-03-02';
const LAST = '2026-11-30';

function view(o: { hire?: string; weeklyHours?: number; hoursChanged?: boolean } = {}): ResultView {
  const hire = o.hire ?? HIRE;
  return exitResultView({
    check: severanceCheck(hire, LAST, o.weeklyHours ?? 40),
    // 부르는 쪽이 금액을 넘겨도 체크가 켜져 있으면 쓰지 않아야 한다
    sev: estimateSeverance(hire, LAST, 3_000_000, 40),
    lv: estimateLeavePay(3_000_000, 40, 5),
    ent: null,
    unusedLeaveDays: 5,
    weeklyHours: o.weeklyHours,
    hoursChanged: o.hoursChanged,
  });
}

const allText = (v: ResultView) => [
  v.status, ...v.verdict, ...(v.meta ?? []),
  ...v.amounts.flatMap((a) => [a.label, a.value, ...(a.note ?? [])]),
  v.caveat ?? '', v.nextNote ?? '', ...v.next.map((n) => n.label),
].join('\n');

describe('E3 — /exit 「시간이 바뀐 적」을 켜면 퇴직금은 엔진 문장으로 멈춘다', () => {
  it('첫 줄은 엔진 문장 그대로이고, 엔진이 같은 입력에 던지는 글과 같다', () => {
    const v = view({ weeklyHours: 40, hoursChanged: true });
    expect(v.verdict[0]).toBe(HOURS_CHANGED_MESSAGE);
    expect(() => calcSeverance({ hireDate: HIRE, lastWorkDate: LAST, wageTotal: 9_000_000, weeklyHours: 40, hoursChanged: true }))
      .toThrow(v.verdict[0]);
  });

  it('퇴직금 칸은 금액 없이 「계산하지 않음」 — 넘겨받은 추정 금액도 쓰지 않는다', () => {
    const v = view({ weeklyHours: 40, hoursChanged: true });
    const sev = estimateSeverance(HIRE, LAST, 3_000_000, 40);
    expect(v.amounts[0]).toEqual({ label: '퇴직금 추정', value: '계산하지 않음' });
    expect(allText(v)).not.toContain(Math.round(sev.amount).toLocaleString('ko-KR'));
    expect(allText(v)).not.toMatch(/요건에 해당/);
  });

  it('연차수당 추정은 그대로 두고, 카드 상태는 비대상 갈래와 같이 「확인용 추정」(연차 금액이 남으므로 멈춤 상태로 바꾸지 않는다)', () => {
    const on = view({ weeklyHours: 40, hoursChanged: true });
    const off = view({ weeklyHours: 40 });
    expect(on.amounts[1]).toEqual(off.amounts[1]);
    expect(on.status).toBe(STATUS_ESTIMATE);
  });

  it('요약 줄에서 「4주 평균 주 15시간 이상·미만」을 뺀다 — 멈춘 까닭과 어긋나는 말을 남기지 않는다', () => {
    const v = view({ weeklyHours: 40, hoursChanged: true });
    expect(v.meta?.[0]).toMatch(/^재직 [\d,]+일 · 계속근로 1년 이상$/);
    expect((v.meta ?? []).join(' ')).not.toMatch(/15시간/);
  });

  it('계산기 링크에 weeklyHours 다음 hoursChanged=1 을 싣고, 이름은 계산을 약속하지 않는다', () => {
    const v = view({ weeklyHours: 40, hoursChanged: true });
    expect(v.next).toEqual([
      { label: '퇴직금 계산기 열기', href: '/tools/severance.html?weeklyHours=40&hoursChanged=1' },
      { label: '추정치의 한계', href: '#limits' },
    ]);
  });

  it('1년 미만이어도 엔진과 같이 멈추고 링크를 준다(엔진은 1년 여부와 관계없이 멈춘다)', () => {
    const v = view({ hire: '2026-03-02', weeklyHours: 20, hoursChanged: true });
    expect(v.verdict[0]).toBe(HOURS_CHANGED_MESSAGE);
    expect(v.meta?.[0]).toMatch(/계속근로 1년 미만$/);
    expect(v.next[0].href).toBe('/tools/severance.html?weeklyHours=20&hoursChanged=1');
  });

  it('주 시간이 없으면 hoursChanged=1 만 싣는다', () => {
    expect(view({ hoursChanged: true }).next[0].href).toBe('/tools/severance.html?hoursChanged=1');
  });

  it('끄거나 넘기지 않으면 전과 글자까지 같다', () => {
    expect(view({ weeklyHours: 40, hoursChanged: false })).toEqual(view({ weeklyHours: 40 }));
    expect(view({ hire: '2026-03-02', weeklyHours: 20, hoursChanged: false })).toEqual(view({ hire: '2026-03-02', weeklyHours: 20 }));
  });
});

describe('E3 — 주소에 ?…가 붙은 계산기 링크도 정적 파일 링크(<a>)로 연다', () => {
  it('isStaticHtmlHref 는 ?·# 뒤를 떼고 본다', () => {
    expect(isStaticHtmlHref('/tools/severance.html')).toBe(true);
    expect(isStaticHtmlHref('/tools/severance.html?weeklyHours=40&hoursChanged=1')).toBe(true);
    expect(isStaticHtmlHref('/tools/severance.html#result')).toBe(true);
    expect(isStaticHtmlHref('/exit')).toBe(false);
    expect(isStaticHtmlHref('/tools/leave-pay?x=1')).toBe(false);
  });
  it('ResultBlock 은 그 함수로 고른다(전에는 href 전체 끝이 .html 인지 봐서 ?weeklyHours= 링크가 Next <Link> 로 갔다)', () => {
    const tsx = readFileSync('src/components/tool-result/ResultBlock.tsx', 'utf8');
    expect(tsx).toMatch(/isStaticHtmlHref\(n\.href\)/);
    expect(tsx).not.toMatch(/n\.href\.endsWith\('\.html'\)/);
  });
});

describe('E3 — /exit 화면 연결', () => {
  const client = readFileSync('src/app/exit/ExitClient.tsx', 'utf8');
  it('체크 칸 글은 계산기(severance.html)와 같다', () => {
    const html = readFileSync('public/tools/severance.html', 'utf8');
    const LABEL = '재직 중 1주 소정근로시간이 15시간 이상과 미만 사이에서 바뀐 적이 있다';
    expect(html).toContain(LABEL);
    expect(client).toMatch(new RegExp(
      `<label className="ex-check">\\s*<input\\s+type="checkbox"\\s+checked=\\{hoursChanged\\}\\s+onChange=\\{e => setHoursChanged\\(e\\.target\\.checked\\)\\}\\s*/>\\s*<span>${LABEL}</span>`,
    ));
  });
  it('켜면 퇴직금 추정을 만들지 않고, 결과 블록에 hoursChanged 를 넘긴다', () => {
    expect(client).toMatch(/const \[hoursChanged, setHoursChanged\] = useState\(false\)/);
    expect(client).toMatch(/const sev = ready && check\?\.eligible && !hoursChanged \? estimateSeverance\(/);
    expect(client).toMatch(/exitResultView\(\{[^}]*hoursChanged \}\)/);
  });
  it('체크 칸은 한 줄을 다 쓰고 누를 곳이 44px 이상이다', () => {
    const css = readFileSync('src/app/exit/exit.css', 'utf8');
    const at = css.indexOf('.ex-check {');
    expect(at).toBeGreaterThan(-1);
    const rule = css.slice(at, css.indexOf('}', at));
    expect(rule).toMatch(/grid-column:\s*1 \/ -1/);
    expect(rule).toMatch(/min-height:\s*44px/);
  });
});
