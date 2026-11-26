import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkRules, judge, paragraphs, type RuleSpec } from '@/lib/laws/rules-check';

// 이 시험은 2025.10. 이후 시행 매핑을 대상으로 썼다. 2023.1.~2025.9. 매핑(같은 조문·비슷한 주제)이 더해져
// 조문 번호만으로 고르면 다른 매핑이 먼저 잡힌다(2026-10-05) — 기간으로 한정한다
const rules = (
  JSON.parse(readFileSync(path.join(process.cwd(), 'public', 'data', 'laws', 'rules.json'), 'utf-8')) as { rules: RuleSpec[] }
).rules.filter((r) => r.effective > '20251001');

const by = (vs: ReturnType<typeof checkRules>, article: string, topic?: string) =>
  vs.find((v) => v.rule.article === article && (!topic || v.rule.topic.includes(topic)))!;

const OLD = `제40조(배우자 출산휴가) ① 회사는 근로자가 배우자의 출산을 이유로 휴가를 고지하는 경우 20일의 유급휴가를 준다.
제41조(난임치료휴가) ① 회사는 연간 6일 이내의 휴가를 주며, 이 경우 최초 2일은 유급으로 한다.
제43조(육아기 근로시간 단축) ① 다만, 대체인력 채용이 불가능한 경우에는 그러하지 아니하다.`;

const NEW = `제40조(배우자 출산전후휴가) ① 배우자의 임신 및 출산을 이유로 20일을 준다.
② 배우자의 출산예정일 50일 전부터 사용할 수 있다.
제41조(난임치료휴가) ① 연간 6일 이내의 휴가를 주며, 그중 최초 4일은 유급으로 한다.
제43조(육아기 근로시간 단축) ① 다만, 정상적인 사업 운영에 중대한 지장을 초래하는 경우에는 그러하지 아니하다.`;

describe('내 취업규칙 점검', () => {
  it('옛 문구가 남으면 미반영, 조문이 없으면 누락', () => {
    const v = checkRules(OLD, rules);
    expect(by(v, '제18조의2')).toMatchObject({ status: '미반영', where: '제40조(배우자 출산휴가)' });
    expect(by(v, '제18조의2').stale).toContain('배우자 출산휴가');
    expect(by(v, '제18조의3')).toMatchObject({ status: '미반영', stale: ['최초 2일'] });
    expect(by(v, '제19조의2')).toMatchObject({ status: '미반영', stale: ['대체인력 채용이 불가능'] });
    expect(by(v, '제18조의4').status).toBe('누락');
  });

  it('고친 문구는 반영됨 — 같은 조문의 다른 항에 있어도 인정', () => {
    const v = checkRules(NEW, rules);
    expect(by(v, '제18조의2').status).toBe('반영됨');
    expect(by(v, '제18조의3').status).toBe('반영됨');
    expect(by(v, '제19조의2').status).toBe('반영됨');
  });

  it('고칠 것(필수)이 맨 앞에 온다', () => {
    const v = checkRules(OLD, rules);
    expect(v[0].rule.required).toBe(true);
    expect(v[0].status).not.toBe('반영됨');
  });
});

describe('옛 문구가 남았을 때만 필수', () => {
  it('출근 간주 조항이 없으면 선택, 「제19조제1항에 따른 육아휴직」이 남아 있으면 필수', () => {
    const none = by(checkRules('제30조(연차) ① 15일의 유급휴가를 준다.', rules), '제60조', '출근 간주');
    expect(none.rule.required).toBe(false);
    const stale = by(
      checkRules('제31조(출근 간주) 다음 기간은 출근한 것으로 본다.\n  3. 남녀고용평등법 제19조제1항에 따른 육아휴직으로 휴업한 기간', rules),
      '제60조', '출근 간주',
    );
    expect(stale.status).toBe('미반영');
    expect(stale.rule.required).toBe(true);
  });
});

// 2026-10-13 — anchor. keywords 가 「휴직을 신청」처럼 넓으면 일반 휴직 조항이 걸리던 것을 막는다.
describe('anchor — 조문을 고르는 말', () => {
  const base = {
    lawId: '000130', law: '남녀고용평등법', article: '제19조', effective: '20260820',
    topic: '단기 육아휴직', art93: '8', required: true,
    keywords: ['육아휴직', '휴직을 신청'], ok: ['1주'], stale: [],
    point: '', clause: '', mst: null,
  } satisfies RuleSpec;
  const text = [
    '제17조(휴직사유 및 기간)',
    '① 사원이 다음 각 호의 사유로 휴직을 신청하는 경우 회사는 이를 허용할 수 있다.',
    '제40조(육아휴직)',
    '① 회사는 육아휴직을 1주 단위로 신청할 수 있도록 한다.',
  ].join('\n');

  // 맞는 조문이 ok 를 갖추고 있으면 점수 때문에 그쪽이 이긴다 — 그래서 44건 중 1건만 바뀌었다(2026-10-13 실측).
  // 문제가 드러나는 건 **맞는 조문이 아직 안 고쳐져 있을 때**다. 그때 엉뚱한 조문이 「고칠 곳」으로 찍힌다.
  const notYet = text.replace('1주 단위로', '30일 단위로');

  it('anchor 가 없으면 아직 안 고친 경우 일반 휴직 조항이 「고칠 곳」으로 찍힌다 — 종전 결함', () => {
    const v = judge(base, paragraphs(notYet));
    expect(v.where).toBe('제17조(휴직사유 및 기간)');
  });

  it('anchor 가 있으면 아직 안 고쳤어도 육아휴직 조문을 가리킨다', () => {
    const v = judge({ ...base, anchor: ['육아휴직'] }, paragraphs(notYet));
    expect(v.where).toBe('제40조(육아휴직)');
    expect(v.status).toBe('미반영');
  });

  it('anchor 를 주면 그 말이 든 조문만 본다', () => {
    const v = judge({ ...base, anchor: ['육아휴직'] }, paragraphs(text));
    expect(v.where).toBe('제40조(육아휴직)');
    expect(v.status).toBe('반영됨');
  });

  it('anchor 가 어느 조문에도 없으면 누락이다 — 엉뚱한 조문을 고르지 않는다', () => {
    const v = judge({ ...base, anchor: ['난임치료휴가'] }, paragraphs(text));
    expect(v.status).toBe('누락');
    expect(v.where).toBeNull();
  });
});

// 2026-11-25 — 부정문. 키워드·ok 낱말이 다 있어도 「…허용하지 않는다」면 권리를 막는 조문이다(261124 검수 P3 #10).
// 「문구 일치」로 두지 않고 미반영(부정문 — 원문 확인)으로 내린다. 판정 기준을 바꾼 게 아니라 낱말 대조의 오인만 막는다.
describe('부정문 — ok 낱말 뒤에 부정이 붙으면 문구 일치로 두지 않는다', () => {
  const all = (
    JSON.parse(readFileSync(path.join(process.cwd(), 'public', 'data', 'laws', 'rules.json'), 'utf-8')) as { rules: RuleSpec[] }
  ).rules;
  const short = all.find((r) => r.topic === '단기 육아휴직(1주·2주) 신설')!;
  const yes = '제48조(육아휴직)\n① 회사는 근로자가 육아휴직을 신청하면 1주 또는 2주 단위로도 허용한다.';
  const no = '제48조(육아휴직)\n① 회사는 근로자가 육아휴직을 신청하더라도 1주 또는 2주 단위로는 허용하지 않는다.';
  const other = '제30조(출장)\n① 출장 여비는 따로 정한다.';

  it('긍정문은 반영됨, 부정문은 미반영·negated, 무관 조문은 누락', () => {
    expect(judge(short, paragraphs(yes))).toMatchObject({ status: '반영됨' });
    expect(judge(short, paragraphs(yes)).negated).toBeFalsy();
    expect(judge(short, paragraphs(no))).toMatchObject({ status: '미반영', negated: true, where: '제48조(육아휴직)' });
    expect(judge(short, paragraphs(other)).status).toBe('누락');
  });

  it('규칙마다 자기 표준 문안(clause)은 부정문으로 잡히지 않는다 — 단서 「그러하지 아니하다」 오인 방지', () => {
    const flagged = all
      .filter((r) => r.clause && r.ok.length)
      .filter((r) => judge(r, paragraphs(r.clause.replace(/^제○조/gm, '제1조'))).negated)
      .map((r) => r.topic);
    expect(flagged).toEqual([]);
  });
});

describe('부정문 — 표준 문안 자체가 부정형인 금지 조항은 그대로', () => {
  const all = (
    JSON.parse(readFileSync(path.join(process.cwd(), 'public', 'data', 'laws', 'rules.json'), 'utf-8')) as { rules: RuleSpec[] }
  ).rules;
  it('「불리한 처우를 하지 아니한다」는 문구 일치로 남는다', () => {
    const r = all.find((x) => x.topic === '연차 분할 사용·불리한 처우 금지')!;
    const text = '제25조(연차유급휴가)\n① 근로자가 연차를 나누어 청구하면 회사는 그에 따라 휴가를 준다.\n② 회사는 근로자가 연차를 사용한 것을 이유로 불리한 처우를 하지 아니한다.';
    const v = judge(r, paragraphs(text));
    expect(v.negated).toBeFalsy();
    expect(v.status).toBe('반영됨');
  });
});

// 2026-11-26 G4 검수(I22·I23) — 부정은 ok 낱말이 든 절의 끝 서술어에서만 본다.
// 이중부정·보장 문구(「거부할 수 없다」「불리한 처우를 하지 아니한다」)는 반영됨, 불가·금지·제외·안 함은 서술어 자리에서만 부정.
describe('부정문 — 절 경계·이중부정·어휘 부정(G4 261126)', () => {
  const all = (
    JSON.parse(readFileSync(path.join(process.cwd(), 'public', 'data', 'laws', 'rules.json'), 'utf-8')) as { rules: RuleSpec[] }
  ).rules;
  const fx = JSON.parse(readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'laws', 'negation-sentences.json'), 'utf-8')) as {
    topic: string; head: string; cases: { name: string; src: string; negated: boolean; text: string }[];
  };
  const rule = all.find((r) => r.topic === fx.topic)!;

  for (const c of fx.cases) {
    it(`${c.negated ? '부정' : '반영됨'} — ${c.name} (${c.src})`, () => {
      const v = judge(rule, paragraphs(fx.head + c.text));
      expect({ status: v.status, negated: !!v.negated }).toEqual(c.negated ? { status: '미반영', negated: true } : { status: '반영됨', negated: false });
    });
  }

  // O11 기계 시험 — 표준 문안의 첫 「…한다.」를 「…한다며, 회사는 이를 거부할 수 없다.」로 바꿔도 부정으로 뒤집히지 않는다(종전 41건 중 20건)
  it('표준 문안 + 「…며, 회사는 이를 거부할 수 없다」 꼬리 — 부정으로 뒤집히는 규칙 0', () => {
    const flipped = all
      .filter((r) => r.clause && r.ok.length)
      .filter((r) => {
        const base = r.clause.replace(/^제○조/gm, '제1조');
        const tail = base.replace(/(한다|된다|있다)\./, '$1며, 회사는 이를 거부할 수 없다.');
        return judge(r, paragraphs(base)).status === '반영됨' && judge(r, paragraphs(tail)).negated;
      })
      .map((r) => r.topic);
    expect(flipped).toEqual([]);
  });

  // G4 R2(261127) R22 — 쉼표 없는 「…하고 」「…하되 」도 절 경계다. 오푸스 r2 기계 시험(꼬리는 합성): 표준 문안 반영됨 41건의
  // 첫 「…한다.」(된다·있다 포함)를 아래 꼬리로 바꾸면 종전 16건·16건이 부정으로 뒤집혔다.
  // 어간을 살린 꼴(「…되고 」「…있고 」)도 같은 연결 어미라 함께 본다.
  const STEM: Record<string, string> = { 한: '하', 된: '되', 있: '있' };
  it.each([
    ['하고 그 기간은 근속기간에 포함하지 아니한다.', () => '하고 그 기간은 근속기간에 포함하지 아니한다.'],
    ['하되 부득이한 경우에는 그러하지 아니하다.', () => '하되 부득이한 경우에는 그러하지 아니하다.'],
    ['(어간)고 그 기간은 근속기간에 포함하지 아니한다.', (s: string) => `${STEM[s]}고 그 기간은 근속기간에 포함하지 아니한다.`],
  ])('표준 문안 + 쉼표 없는 「…%s」 꼬리 — 부정으로 뒤집히는 규칙 0', (label, tail) => {
    expect(label).toBeTruthy();
    const base = all.filter((r) => r.clause && r.ok.length).filter((r) => judge(r, paragraphs(r.clause.replace(/^제○조/gm, '제1조'))).status === '반영됨');
    expect(base.length).toBeGreaterThanOrEqual(41); // 261127 기준 41건 — 규칙이 늘면 같이 는다
    const flipped = base
      .filter((r) => judge(r, paragraphs(r.clause.replace(/^제○조/gm, '제1조').replace(/(한|된|있)다\./, (...g: string[]) => tail(g[1])))).negated)
      .map((r) => r.topic);
    expect(flipped).toEqual([]);
  });

  it('조건이 붙은 법정 예외 단서(「…경우 … 허용하지 아니할 수 있다」)는 부정으로 보지 않는다 — 표준 제43조③', () => {
    const r = all.find((x) => x.topic === '가족돌봄휴직·휴가 대상 가족에 조부모·손자녀 포함')!;
    const text = '제43조(가족돌봄휴가)\n③ 1항에도 불구하고 조부모 또는 손자녀를 돌보기 위한 경우에는 신청한 사원 외에 조부모의 직계비속 또는 손자녀의 직계존속이 있는 경우 휴가를 허용하지 아니할 수 있다(다만, 조부모의 직계비속 또는 손자녀의 직계존속에게 질병, 노령, 장애 또는 미성년 등의 사유가 있어 신청한 사원이 돌봐야 하는 경우는 제외한다.)';
    expect(judge(r, paragraphs(text)).negated).toBeFalsy();
  });
});
