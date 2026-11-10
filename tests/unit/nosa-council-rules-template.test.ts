import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { bannedHits } from '@/lib/tool-kit/banned';
import { formHwpx, formLines, formPdf } from '@/lib/work-rules-report/render';
import { REGULATION_REQUIRED } from '@/lib/nosa-council/assess';
import { councilRulesDoc, rulesErrors, RULES_SOURCE, type RulesInput } from '@/lib/nosa-council/rules-template';

// 협의회규정 견본 — 정본 = 노사협의회신고 스킬 references/council-rules-template-261110.md §2(매뉴얼 [부록 1] 개정판).
// 기대값의 조문 글자는 그 견본에서 그대로 옮겼다. R1~R12 = 같은 파일 §1 변경표.

const NOSA_WORDS = ['노무사', '상담', '자문', '진단', '판정', '적법', '확률', '체불', '위법', '승소', '받을 수 있는 금액', '포괄', '대신', '대행', '대리', '지도'];
const REASON = '사무직·기술직·기능직 사업장이 따로 있다';

const BASE: RulesInput = { workplaceName: '가상상사', majorityUnion: false };
const FULL: RulesInput = {
  workplaceName: '가상상사', majorityUnion: false, workerMembers: 5, employerMembers: 5, grievanceMembers: 3,
  councilName: '가상상사 노사협의회', unitName: '가상상사 본사', regularMeetings: '3월·6월·9월·12월 둘째 주 화요일', effectiveDate: '2026-12-01',
  coChair: true, chairTerm: '1년', employerPositions: ['인사팀장', '생산팀장'], allowanceHours: 2, subcommitteeMembers: 2, electionCommitteeMembers: 3,
  tieBreak: '근속기간이 긴 사람', districts: [{ label: '생산부', seats: 3 }, { label: '관리부', seats: 2 }], arbitrationMembers: 2,
  grievanceDesk: '고충처리위원에게 직접 또는 전자우편', indirectReason: REASON,
};
const UNION: RulesInput = { workplaceName: '가상상사', majorityUnion: true, unionName: '가상상사 노동조합' };
const VARIANTS: Record<string, RulesInput> = {
  base: BASE,
  full: FULL,
  union: UNION,
  unionFull: { ...FULL, majorityUnion: true, unionName: '가상상사 노동조합' },
  districtsOnly: { ...BASE, districts: [{ label: '생산부' }] },
  indirectOnly: { ...BASE, indirectReason: REASON },
};

const lines = (i: RulesInput) => formLines(councilRulesDoc(i));
/** 제n조 한 개의 줄들 — 다음 조·장·부칙·별표 앞까지 */
function article(ls: string[], n: number): string[] {
  const s = ls.findIndex((l) => l.startsWith(`제${n}조(`));
  if (s < 0) return [];
  const e = ls.findIndex((l, i) => i > s && /^(제\d+조\(|제\d+장 |부칙|\[별표\])/.test(l));
  return ls.slice(s, e < 0 ? undefined : e);
}
/** 조 제목으로 찾기 — 번호가 바뀌는 경우 */
function articleByTitle(ls: string[], title: string): { n: number; body: string[] } {
  const l = ls.find((x) => new RegExp(`^제\\d+조\\(${title.replace(/[()·]/g, '\\$&')}\\)`).test(x));
  if (!l) return { n: 0, body: [] };
  const n = Number(/^제(\d+)조/.exec(l)![1]);
  return { n, body: article(ls, n) };
}
const items = (body: string[]) => body.filter((l) => /^\s+\d+\. /.test(l)).map((l) => l.trim());
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩';

describe('협의회규정 견본 — 시행령 §5① 필수기재 7개', () => {
  // REGULATION_REQUIRED 의 순서대로 — 각 항목이 들어 있는지 보는 글자
  const has: ((t: string, i: RulesInput) => boolean)[] = [
    (t) => /각 (\d+|○○)명으로 구성한다\. 위원 수는 각 3명 이상 10명 이하로 한다\./.test(t),
    (t, i) => (i.majorityUnion ? t.includes('노동조합이 위촉하는 자로 한다') : t.includes('(입후보)') && t.includes('직접·비밀·무기명 투표로 선출한다')),
    (t) => t.includes('사용자위원은 대표자와 대표자가 위촉하는 다음 각 호의 사람으로 한다.'),
    (t) => t.includes('위원의 협의회 출석 시간은 근로한 시간으로 본다.') && t.includes('이동 시간과 자료 검토 시간'),
    (t) => t.includes('(회의)') && t.includes('3개월마다 정기회의') && t.includes('(회의 소집)') && t.includes('(정족수)'),
    (t) => t.includes('(임의 중재)') && t.includes('중재기구를 두어 해결하거나'),
    (t) => t.includes('(고충처리위원의 구성·임기·신분)') && t.includes('(고충의 처리)'),
  ];
  it('항목 수가 시행령과 같다', () => expect(has.length).toBe(REGULATION_REQUIRED.length));
  for (const [name, input] of Object.entries(VARIANTS)) {
    it(`${name}: 7개 모두`, () => {
      const t = lines(input).join('\n');
      expect(has.map((f, k) => (f(t, input) ? '' : REGULATION_REQUIRED[k])).filter(Boolean)).toEqual([]);
    });
  }
});

describe('협의회규정 견본 — 고친 조문(R1~R12)', () => {
  it('R6 제26조 협의사항 17개 호 · 16호 성희롱 예방 · 12호 「직무 발명」', () => {
    const it26 = items(article(lines(BASE), 26));
    expect(it26).toHaveLength(17);
    expect(it26[15]).toBe('16. 직장 내 성희롱 및 고객 등에 의한 성희롱 예방에 관한 사항');
    expect(it26[11]).toBe('12. 직무 발명 등과 관련하여 해당 근로자에 대한 보상에 관한 사항');
    expect(it26[16]).toBe('17. 그 밖의 노사협조에 관한 사항');
    for (const input of Object.values(VARIANTS)) {
      const ls = lines(input);
      expect(items(articleByTitle(ls, '협의사항').body)).toHaveLength(17);
      expect(ls.join('\n')).not.toContain('직무발령');
    }
  });

  it('R7 제31조 중재 대상 = 「제27조의 의결사항」, 「그 밖에 중재가 필요한 경우」 없음', () => {
    const a31 = article(lines(BASE), 31);
    expect(a31[0]).toBe('제31조(임의 중재) ① 협의회는 다음 각 호의 어느 하나에 해당하면 근로자위원과 사용자위원의 합의로 협의회에 중재기구를 두어 해결하거나, 노동위원회나 그 밖의 제삼자에 의한 중재를 받을 수 있다.');
    expect(items(a31)).toEqual(['1. 제27조의 의결사항에 관하여 협의회가 의결하지 못한 경우', '2. 협의회에서 의결된 사항의 해석이나 이행 방법 등에 관하여 의견이 일치하지 아니하는 경우']);
    expect(article(lines(BASE), 27)[0]).toBe('제27조(의결사항) 사용자는 다음 각 호의 사항에 대하여 협의회의 의결을 거쳐야 한다.');
    for (const input of Object.values(VARIANTS)) expect(lines(input).join('\n')).not.toContain('그 밖에 중재가 필요한');
  });

  it('제3장이 빠지면 조 번호와 다른 조를 가리키는 번호가 함께 당겨진다(과반수 노동조합)', () => {
    const ls = lines(UNION);
    const arb = articleByTitle(ls, '임의 중재');
    const res = articleByTitle(ls, '의결사항');
    const conv = articleByTitle(ls, '회의 소집');
    const quorum = articleByTitle(ls, '정족수');
    const topics = articleByTitle(ls, '협의사항');
    expect([res.n, arb.n]).toEqual([20, 24]);
    expect(items(arb.body)[0]).toBe('1. 제20조의 의결사항에 관하여 협의회가 의결하지 못한 경우');
    expect(articleByTitle(ls, '자료의 사전 제공').body[0]).toBe(
      `제14조(자료의 사전 제공) 근로자위원은 제${conv.n}조제3항에 따라 통보된 의제 중 제${topics.n}조의 협의사항과 제${res.n}조의 의결사항에 관련된 자료를 회의 개최 전에 사용자에게 요구할 수 있으며, 사용자는 이에 성실히 따라야 한다. 다만, 요구 자료가 기업의 경영·영업상 비밀이나 개인정보에 해당하면 그러하지 아니하다.`,
    );
    expect(topics.body.join('\n')).toContain(`② 협의회는 제1항 각 호의 사항에 대하여 제${quorum.n}조의 정족수에 따라 의결할 수 있다.`);
    expect(article(lines(BASE), 21)[0]).toContain('제20조제3항에 따라 통보된 의제 중 제26조의 협의사항과 제27조의 의결사항');
  });

  it('R3 제16조 입후보 — 「10명 이상의 추천」 없음', () => {
    const ls = lines(BASE);
    expect(article(ls, 16)).toEqual([
      '제16조(입후보) ① 해당 사업 또는 사업장의 근로자는 근로자위원에 입후보할 수 있다.',
      '② 입후보하려는 사람은 선관위가 공고한 기간에 선관위에 등록한다.',
      '③ 선거관리위원은 근로자위원에 입후보할 수 없다.',
    ]);
    for (const input of Object.values(VARIANTS)) expect(lines(input).join('\n')).not.toMatch(/추천/);
  });

  it('R5 제18조② 차점자 — 과반수 노동조합이 없을 때만', () => {
    expect(article(lines(BASE), 18)).toEqual([
      '제18조(보궐) ① 근로자위원에 결원이 생기면 30일 이내에 보궐위원을 선출한다.',
      '② 제1항에도 불구하고 근로자 과반수로 조직된 노동조합이 없는 동안에는 근로자위원 선출 투표에서 선출되지 못한 사람 중 득표 순에 따른 차점자를 근로자위원으로 할 수 있다. 이를 위하여 선관위는 차점자 명부를 작성하여 보관한다.',
    ]);
    for (const input of [UNION, VARIANTS.unionFull]) {
      const t = lines(input).join('\n');
      expect(t).not.toContain('차점자');
      expect(t).not.toContain('선거관리위원회');
      expect(t).not.toContain('(근로자위원의 선출)');
    }
  });

  it('R8 제33조 고충처리위원 3명 이내·선임 · 제34조 청취한 날부터 10일 · R12 제35조 창구(금지어 피해 「고충상담 창구」)', () => {
    const ls = lines(FULL);
    expect(article(ls, 33)[0]).toBe('제33조(고충처리위원의 구성·임기·신분) ① 고충처리위원은 노사를 대표하는 3명(3명 이내)으로 하고, 협의회가 그 위원 중에서 선임한다.');
    expect(article(ls, 34)).toContain('② 고충처리위원은 고충사항을 청취한 날부터 10일 이내에 조치 사항과 그 밖의 처리결과를 해당 근로자에게 알린다.');
    expect(article(ls, 35)).toEqual(['제35조(고충상담 창구) 고충 신고는 고충처리위원에게 직접 또는 전자우편으로 받는다.']);
    expect(article(lines(BASE), 35)).toEqual(['제35조(고충상담 창구) 고충 신고는 ○○로 받는다.']);
  });

  it('R9 제38조 제출 15일·협의회 의결 · R2 제10조 불이익 금지 · R10 제14조 사용자 제외', () => {
    const ls = lines(FULL);
    expect(article(ls, 38)).toEqual([
      '제38조(규정의 제정·변경과 제출) ① 이 규정을 제정하거나 변경할 때에는 협의회의 의결을 거친다.',
      '② 사용자는 협의회를 설치한 날부터 15일 이내에 이 규정을 관할 지방고용노동관서에 제출한다. 규정을 변경한 경우에도 같다.',
    ]);
    expect(article(ls, 10)).toEqual([
      '제10조(위원의 신분) ① 위원은 비상임·무보수로 한다.',
      '② 사용자는 협의회 위원으로서의 직무 수행과 관련하여 근로자위원에게 불이익을 주는 처분을 하여서는 아니 된다.',
      '③ 위원의 협의회 출석 시간은 근로한 시간으로 본다. 협의회 출석과 직접 관련된 이동 시간과 자료 검토 시간도 회의 1회당 2시간까지 근로한 시간으로 본다.',
    ]);
    expect(article(ls, 14)[0]).toContain('사용자나 사용자를 위하여 행동하는 사람은 선거관리위원이 될 수 없다.');
  });

  it('제22조 정족수 — 견본 글자 그대로', () => {
    expect(article(lines(BASE), 22)).toEqual(['제22조(정족수) 회의는 근로자위원과 사용자위원 각 과반수의 출석으로 열고, 출석위원 3분의 2 이상의 찬성으로 의결한다.']);
  });
});

describe('협의회규정 견본 — [선택] 조항은 하나만 남긴다', () => {
  it('제6조② A(선거) / B(노동조합 위촉)', () => {
    expect(article(lines(BASE), 6)).toContain('② 근로자위원은 근로자가 제17조에 따라 선출한다.');
    const u = articleByTitle(lines(UNION), '협의회의 구성').body;
    expect(u).toContain('② 근로자위원은 가상상사 노동조합의 대표자와 그 노동조합이 위촉하는 자로 한다.');
    expect(u.join('\n')).not.toContain('선출한다');
    expect(articleByTitle(lines({ ...UNION, unionName: undefined }), '협의회의 구성').body).toContain('② 근로자위원은 ○○의 대표자와 그 노동조합이 위촉하는 자로 한다.');
  });

  it('제7조① 공동의장은 고를 때만', () => {
    expect(article(lines(BASE), 7)[0]).toBe('제7조(의장) ① 협의회의 의장은 위원 중에서 호선한다.');
    expect(article(lines(FULL), 7)[0]).toBe('제7조(의장) ① 협의회의 의장은 위원 중에서 호선한다. 이 경우 근로자위원과 사용자위원 중 각 1명을 공동의장으로 한다.');
  });

  it('제17조④ 선거구 · ⑤ 위원선거인(부득이한 사유) — 남긴 것만 차례로 번호', () => {
    const plain = article(lines(BASE), 17);
    expect(plain.map((l) => l.replace(/^제17조\(근로자위원의 선출\) /, '')[0])).toEqual(['①', '②', '③']);
    const full = article(lines(FULL), 17);
    expect(full[3]).toBe('④ 근로자위원을 선거구별로 선출하는 경우 선거구와 선거구별 인원은 별표와 같이 하고, 선거구마다 그 선거구 근로자 과반수가 참여하여야 한다.');
    expect(full[4]).toBe(`⑤ 부서별로 근로자 수에 비례하여 위원선거인을 근로자 과반수가 참여한 직접·비밀·무기명 투표로 선출하고, 위원선거인 과반수가 참여한 직접·비밀·무기명 투표로 근로자위원을 선출할 수 있다. 부득이한 사유: ${REASON}`);
    const ind = article(lines(VARIANTS.indirectOnly), 17);
    expect(ind).toHaveLength(4);
    expect(ind[3]).toMatch(/^④ 부서별로 근로자 수에 비례하여 위원선거인을/);
    const dis = article(lines(VARIANTS.districtsOnly), 17);
    expect(dis).toHaveLength(4);
    expect(dis[3]).toMatch(/^④ 근로자위원을 선거구별로/);
  });

  it('선거구 별표 — 이름·인원, 없으면 ○○', () => {
    const ls = lines(FULL);
    const s = ls.indexOf('[별표] 선거구별 근로자위원 수');
    expect(s).toBeGreaterThan(0);
    expect(ls.slice(s + 1, s + 7)).toEqual(['선거구', '근로자위원 수', '생산부', '3명', '관리부', '2명']);
    const d = lines(VARIANTS.districtsOnly);
    expect(d.slice(d.indexOf('[별표] 선거구별 근로자위원 수') + 3, d.indexOf('[별표] 선거구별 근로자위원 수') + 5)).toEqual(['생산부', '○○']);
    expect(lines(BASE)).not.toContain('[별표] 선거구별 근로자위원 수');
  });

  it('견본 표기([선택]·{칸}·제3장 머리 괄호)가 남지 않는다', () => {
    for (const input of Object.values(VARIANTS)) {
      const t = lines(input).join('\n');
      expect(t).not.toMatch(/\[선택|선택 A|선택 B|[{}]|제6조제2항 선택/);
    }
  });

  it('조·장·항 번호가 빠짐없이 이어진다', () => {
    const expectCount: Record<string, [number, number]> = { base: [40, 7], full: [40, 7], union: [33, 6], unionFull: [33, 6], districtsOnly: [40, 7], indirectOnly: [40, 7] };
    for (const [name, input] of Object.entries(VARIANTS)) {
      const ls = lines(input);
      const arts = ls.filter((l) => /^제\d+조\(/.test(l)).map((l) => Number(/^제(\d+)조/.exec(l)![1]));
      expect(arts, name).toEqual(Array.from({ length: expectCount[name][0] }, (_, k) => k + 1));
      const chs = ls.filter((l) => /^제\d+장 /.test(l)).map((l) => Number(/^제(\d+)장/.exec(l)![1]));
      expect(chs, name).toEqual(Array.from({ length: expectCount[name][1] }, (_, k) => k + 1));
      for (const n of arts) {
        const body = article(ls, n);
        const marks = body.map((l, k) => (k === 0 ? l.replace(/^제\d+조\([^)]*\) /, '') : l)).filter((l) => CIRCLED.includes(l[0])).map((l) => l[0]);
        if (marks.length) expect(marks.join(''), `${name} 제${n}조`).toBe(CIRCLED.slice(0, marks.length));
      }
    }
  });
});

describe('협의회규정 견본 — 칸 채우기', () => {
  it('값이 있으면 채우고 조사(으로/로)를 맞춘다', () => {
    const t = lines(FULL).join('\n');
    expect(lines(FULL)[0]).toBe('가상상사 노사협의회 규정');
    expect(t).toContain('제1조(목적) 이 규정은 근로자와 사용자 쌍방이 이해와 협조를 통하여 노사 공동의 이익을 증진함으로써 가상상사의 발전과 근로자 복지증진에 이바지함을 목적으로 한다.');
    expect(t).toContain('제2조(명칭 및 설치단위) 노사협의회(이하 "협의회"라 한다)는 가상상사 본사에 두며, 명칭은 가상상사 노사협의회로 한다.');
    expect(t).toContain('각 5명으로 구성한다. 위원 수는 각 3명 이상 10명 이하로 한다.');
    expect(t).toContain('③ 의장의 임기는 1년으로 한다.');
    expect(t).toContain('② 실무소위원회는 노사위원 각 2명으로 구성한다.');
    expect(t).toContain('① 근로자위원 선출을 관리하기 위하여 3명 이내의 위원으로 선거관리위원회(이하 "선관위"라 한다)를 둔다.');
    expect(t).toContain('득표수가 같으면 근속기간이 긴 사람 순으로 정한다.');
    expect(t).toContain('정기회의는 3월·6월·9월·12월 둘째 주 화요일에 연다.');
    expect(t).toContain('② 협의회에 두는 중재기구는 노사 각 2명으로 구성한다.');
    expect(t).toContain('이 규정은 2026년 12월 1일부터 시행한다.');
    expect(items(article(lines(FULL), 6))).toEqual(['1. 인사팀장', '2. 생산팀장', '3. 그 밖에 대표자가 위촉하는 임직원']);
  });

  it('값이 없으면 ○○ 로 둔다', () => {
    const t = lines(BASE).join('\n');
    expect(t).toContain('는 ○○에 두며, 명칭은 ○○으로 한다.');
    expect(t).toContain('각 ○○명으로 구성한다.');
    expect(t).toContain('③ 의장의 임기는 ○○로 한다.');
    expect(t).toContain('회의 1회당 ○○시간까지');
    expect(t).toContain('이 규정은 ○○○○년 ○○월 ○○일부터 시행한다.');
    expect(items(article(lines(BASE), 6))).toEqual(['1. ○○', '2. ○○', '3. 그 밖에 대표자가 위촉하는 임직원']);
    expect(t).toContain('고충처리위원은 노사를 대표하는 ○○명(3명 이내)으로 하고');
  });

  it('위원 수 한쪽만 주면 그 수로 쓴다', () => {
    expect(lines({ ...BASE, employerMembers: 4 }).join('\n')).toContain('각 4명으로 구성한다');
  });
});

describe('협의회규정 견본 — 만들지 않는 경우', () => {
  it('위원 수 3 미만·10 초과면 오류, 만들지 않는다', () => {
    for (const bad of [{ workerMembers: 2 }, { workerMembers: 11 }, { employerMembers: 0 }, { employerMembers: 11 }]) {
      const errs = rulesErrors({ ...BASE, ...bad });
      expect(errs.join(' '), JSON.stringify(bad)).toMatch(/3명 이상 10명 이하/);
      expect(() => councilRulesDoc({ ...BASE, ...bad })).toThrow(/3명 이상 10명 이하/);
    }
    expect(rulesErrors({ ...BASE, workerMembers: 3, employerMembers: 3 })).toEqual([]);
    expect(rulesErrors({ ...BASE, workerMembers: 10 })).toEqual([]);
  });
  it('근로자위원·사용자위원 수가 다르면 오류(법 제6조제1항 같은 수)', () => {
    expect(rulesErrors({ ...BASE, workerMembers: 5, employerMembers: 4 }).join(' ')).toMatch(/같은 수/);
  });
  it('고충처리위원 4명 이상이면 오류(3명 이내)', () => {
    expect(rulesErrors({ ...BASE, grievanceMembers: 4 }).join(' ')).toMatch(/3명 이내/);
    expect(rulesErrors({ ...BASE, grievanceMembers: 3 })).toEqual([]);
  });
  it('시행일 형식', () => {
    expect(rulesErrors({ ...BASE, effectiveDate: '2026-13-01' }).length).toBe(1);
  });
});

describe('협의회규정 견본 — 금지어·출처·렌더', () => {
  it('금지어(「적법」 포함) 없음', () => {
    for (const [name, input] of Object.entries(VARIANTS)) {
      expect(bannedHits(lines(input).join('\n'), NOSA_WORDS), name).toEqual([]);
      expect(lines(input).join('\n')).not.toContain('적법');
    }
  });

  it('견본 출처 문장은 문서에 넣지 않는다(도구 notice 로만)', () => {
    expect(RULES_SOURCE).toBe('고용노동부 『노사협의회 운영 매뉴얼』(2022. 12.) [부록 1]을 2022. 12. 11. 시행 법령에 맞추어 고침');
    for (const input of Object.values(VARIANTS)) {
      const t = lines(input).join('\n');
      expect(t).not.toContain('부록');
      expect(t).not.toContain('매뉴얼');
    }
  });

  it('PDF(①②③ 원문자 포함)·한글로 그려진다', async () => {
    const font = new Uint8Array(fs.readFileSync(path.join(process.cwd(), 'public/fonts/NanumGothic-Regular.ttf')));
    for (const [name, input] of Object.entries(VARIANTS)) {
      const doc = councilRulesDoc(input);
      const t = formLines(doc).join('\n');
      for (const c of '①②③') expect(t, name).toContain(c);
      const pdf = await formPdf([doc], font);
      expect(Buffer.from(pdf.subarray(0, 4)).toString('latin1'), name).toBe('%PDF');
      const hwpx = await formHwpx([doc]);
      expect(Buffer.from(hwpx.subarray(0, 2)).toString('latin1'), name).toBe('PK');
    }
  }, 60_000);
});
