import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkRules, type RuleSpec } from '@/lib/laws/rules-check';

const { rules } = JSON.parse(
  readFileSync(path.join(process.cwd(), 'public', 'data', 'laws', 'rules.json'), 'utf-8'),
) as { rules: RuleSpec[] };

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
