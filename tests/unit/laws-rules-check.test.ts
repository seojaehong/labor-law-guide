import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkRules, type RuleSpec } from '@/lib/laws/rules-check';

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
