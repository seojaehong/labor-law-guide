import { describe, expect, it } from 'vitest';
import { parseRegulation, type Regulation } from '@/lib/rules-review/model';
import { runChecks } from '@/lib/rules-review/checks';

// 합성 규정 — 실명·실제 기관 아님
const reg = (name: string, body: string): Regulation =>
  parseRegulation({ key: name, name, fileName: `${name}.txt`, kind: 'txt', lines: [name, ...body.trim().split('\n')].map((text) => ({ text, controls: 0 })) });

const plainOf = (body: string) => runChecks([reg('시험 규정', body)]).filter((f) => f.kind === 'plain');
const hits = (body: string) => plainOf(body).flatMap((f) => f.spans.map((sp) => reg('시험 규정', body).lines[sp.line].text.slice(sp.at, sp.at + sp.length)));

describe('알기 쉬운 표현 — 낱말 안쪽을 건드리지 않는다', () => {
  it('「지원금일체」의 금일, 「수익일」의 익일은 잡지 않는다', () => {
    expect(plainOf('제1조(지원) 지원금일체를 지급한다. 수익일부는 적립한다.')).toHaveLength(0);
  });
  it('「추가료」「참가료」의 가료, 「상당해」의 당해, 「금일봉」의 금일은 잡지 않는다', () => {
    expect(plainOf('제1조(비용) 추가료와 참가료는 따로 낸다. 손실이 상당해 보이면 금일봉을 준다.')).toHaveLength(0);
  });
  it('「피해를 당해 」는 동사라 잡지 않는다', () => {
    expect(plainOf('제1조(보상) 피해를 당해 다친 직원을 돕는다.')).toHaveLength(0);
  });
  it('「익년도」는 「다음 해도」가 아니라 「다음 연도」로 바꾼다', () => {
    const f = plainOf('제1조(예산) 남은 예산은 익년도로 넘긴다.');
    expect(f.map((x) => [x.before, x.after])).toEqual([['익년도', '다음 연도']]);
  });
  it('낱말 첫머리는 그대로 고친다 — 당해·익일·금일·가료·각호(붙여 쓴 옛 표기 포함)', () => {
    expect(hits('제1조(통지) 당해 직원에게는 익일까지 알리고, 금일 접수분은 가료 기간에 넣는다. 제1항각호의 서류를 낸다.'))
      .toEqual(['당해', '익일', '금일', '각호', '가료']);
  });
});

describe('알기 쉬운 표현 — 뜻이 갈리는 말은 확인만 한다', () => {
  it('「재해에 의하여 사망한」은 항목은 내되 고친 문안이 없다', () => {
    const f = plainOf('제1조(유족) 업무상 재해에 의하여 사망한 직원의 유족에게 지급한다.');
    expect(f).toHaveLength(1);
    expect(f[0].before).toBe('에 의하여');
    expect(f[0].after).toBeNull();
    expect(f[0].message).toContain('확인');
  });
  it('조문마다 따로 낸다 — 담당자가 쓴 문안이 그 조문에 붙도록', () => {
    const f = plainOf('제1조(근거) 이 규정은 법에 의하여 정한다.\n제2조(유족) 재해에 의하여 사망한 경우 지급한다.');
    expect(f.map((x) => [x.article, x.after, x.spans.length])).toEqual([['제1조(근거)', null, 1], ['제2조(유족)', null, 1]]);
    expect(new Set(f.map((x) => x.id)).size).toBe(2);
  });
});
