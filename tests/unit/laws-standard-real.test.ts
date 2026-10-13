// 실제 데이터(public/data/laws) 위에서 A 판정의 뼈대를 시험한다.
// ① 표준 문안을 그대로 넣으면 모든 조문이 자기와 1:1 로 짝지어진다
// ② 표준 2026 문안은 배포(2026.2.) 전에 시행된 개정의 정답이다 — 그 기간 매핑은 전부 「반영됨」이어야 한다
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LawIndex } from '@/lib/laws/format';
import { matchArticles, periodCheck, splitArticles, STD_ASOF, stdForEvent, type StdArticle, type StdRule } from '@/lib/laws/standard-check';

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

  it('육아지원 3법(2025.2.23. 남녀고용평등법)이 표준 조문에 연결된다', () => {
    const e = IDX.events.find((x) => x.id === '000130-20250223');
    expect(e).toBeDefined();
    expect(stdForEvent(e!, STD).length).toBeGreaterThan(0);
  });
});
