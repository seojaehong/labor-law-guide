// 실제 데이터(public/data/laws) 위에서 A 판정의 뼈대를 시험한다.
// ① 표준 문안을 그대로 넣으면 모든 조문이 자기와 1:1 로 짝지어진다
// ② 표준 2026 문안은 배포(2026.2.) 전에 시행된 개정의 정답이다 — 그 기간 매핑은 전부 「반영됨」이어야 한다
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LawIndex } from '@/lib/laws/format';
import { NEGATED_SHORT } from '@/lib/laws/rules-check';
import { exportItems, exportStatus, matchArticles, periodCheck, splitArticles, STD_ASOF, stdForEvent, type StdArticle, type StdRule } from '@/lib/laws/standard-check';

const dir = join(process.cwd(), 'public', 'data', 'laws');
const read = <T,>(f: string): T => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const STD = read<{ articles: StdArticle[] }>('standard.json').articles;
const IDX = read<LawIndex>('index.json');
const RULES = read<{ rules: StdRule[] }>('rules.json').rules;
const STD_TEXT = STD.map((s) => s.text).join('\n');

describe('실데이터 — 표준취업규칙 2026', () => {
  it('조문 100개(택일 안 포함), id 가 겹치지 않는다', () => {
    expect(STD.length).toBe(100);
    expect(new Set(STD.map((s) => s.id)).size).toBe(STD.length);
  });

  it('표준 문안 자체를 넣으면 모든 조문이 자기와 짝지어지고, 남의 조문은 붙지 않는다', () => {
    const user = splitArticles(STD_TEXT);
    const m = matchArticles(user, STD);
    // 택일 안(제61조 퇴직연금형·퇴직금형)은 번호·제목이 같아 서로 동점이다 — 같은 번호·제목끼리는 허용
    const wrong = STD.filter((s) => {
      const got = m.get(s.id) ?? [];
      return !got.length || got.some((u) => u.no !== s.no || u.title !== s.title);
    }).map((s) => `${s.id}(${s.title}) → ${(m.get(s.id) ?? []).map((u) => `${u.no}(${u.title})`).join(', ') || '없음'}`);
    expect(wrong).toEqual([]);
  });

  it('매핑마다 걸리는 표준 조문이 있다', () => {
    expect(RULES.filter((r) => !r.std?.length).map((r) => `${r.lawId} ${r.article} ${r.topic}`)).toEqual([]);
  });

  it('표준 2026 문안은 배포 전 시행 필수 매핑을 전부 반영하고 있다(선택 규정은 표준이 넣지 않는다)', () => {
    const r = periodCheck({ text: STD_TEXT, std: STD, events: IDX.events, rules: RULES, from: '20221231', to: STD_ASOF });
    const bad = r.items
      .flatMap((it) => it.verdicts.map((v) => ({ it, v })))
      .filter(({ v }) => v.status !== '반영됨' && v.rule.required)
      .map(({ it, v }) => `${v.rule.topic} @${it.std.id} ${v.status} stale=${v.stale} missing=${v.missing}`);
    expect(bad).toEqual([]);
  });

  // G4 261126 I22 — 부정문 판정은 merge-base(7f2b273c, 부정문 판정 없음) 대비 표준 문안 판정을 하나도 바꾸지 않는다.
  // 모든 매핑을 기간 안(2000~2099)과 「이전 시행」 쪽(earlier) 양쪽으로 돌려 negated 가 0 이어야 회귀 0 이다.
  it('표준 2026 문안 전체 — 모든 매핑이 기간 안·이전 시행 어느 쪽으로 돌아도 부정문으로 잡히지 않는다', () => {
    const wide = periodCheck({ text: STD_TEXT, std: STD, events: IDX.events, rules: RULES, from: '20000101', to: '20991231' });
    const late = periodCheck({ text: STD_TEXT, std: STD, events: IDX.events, rules: RULES, from: '20991230', to: '20991231' });
    const neg = [
      ...wide.items.flatMap((it) => it.verdicts.filter((v) => v.negated).map((v) => `${v.rule.topic} @${it.std.id}`)),
      ...late.earlier.filter((e) => e.verdict.negated).map((e) => `earlier ${e.verdict.rule.topic} @${e.std.id}`),
    ];
    expect(neg).toEqual([]);
  });

  // G4 R2(261127) R25 — 아스트라 재현: 단기 육아휴직 시행일을 최종 개정일, 다음 날을 종료일로 두면 earlier 부정 1건·items 0건이었다.
  // 내보내기 행이 생기고, 현행 칸은 판정이 실제로 본 내 조문(제48조)이어야 한다(표준 조문 짝만 보면 비어 「해당 조문 없음」으로 나간다).
  it('이전 시행에서만 나온 부정문 — 내보내기 1행, 현행은 판정한 내 조문', () => {
    const rules = RULES.filter((r) => r.topic === '단기 육아휴직(1주·2주) 신설');
    const from = rules[0].effective;
    const next = new Date(Date.UTC(+from.slice(0, 4), +from.slice(4, 6) - 1, +from.slice(6, 8) + 1)).toISOString().slice(0, 10).replace(/-/g, '');
    const text = '제48조(육아휴직) ① 회사는 1주 또는 2주 단위의 육아휴직을 허용하지 않는다.';
    const r = periodCheck({ text, std: STD, events: IDX.events, rules, from, to: next });
    expect(r.items.filter((i) => i.status !== '반영됨')).toEqual([]);
    const ex = exportItems(r);
    expect(ex).toHaveLength(1);
    expect(ex[0].user.map((u) => u.no)).toEqual(['제48조']);
    expect(exportStatus(ex[0])).toContain(NEGATED_SHORT);
  });

  it('육아지원 3법(2025.2.23. 남녀고용평등법)이 표준 조문에 연결된다', () => {
    const e = IDX.events.find((x) => x.id === '000130-20250223');
    expect(e).toBeDefined();
    expect(stdForEvent(e!, STD).length).toBeGreaterThan(0);
  });
});
