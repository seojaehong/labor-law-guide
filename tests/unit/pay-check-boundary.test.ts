// 월급 대조 엔진의 12개 경계값 (원본: ~/dev/pay-exception-check @3263456 test/boundary.test.ts).
// 사이트로 옮긴 src/lib/pay-check 가 원본과 같은 결과를 내는지 고정한다.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { forbiddenHits, renderCard } from '@/lib/pay-check/card';
import { check } from '@/lib/pay-check/check';
import type { CheckInput, Status } from '@/lib/pay-check/types';

interface Case {
  id: string;
  scenario: CheckInput['scenario'];
  confirmed: CheckInput['confirmed'];
  policy_id: CheckInput['policy_id'];
  expected: { status: Status; expected_amount: number | null; difference?: number; required_question: string | null };
}

const file = JSON.parse(readFileSync(join(__dirname, '../fixtures/pay-check/boundary-12.json'), 'utf8')) as { cases: Case[] };
const run = (c: Case) => check({ case_id: c.id, scenario: c.scenario, confirmed: c.confirmed, policy_id: c.policy_id });

describe('12 boundary cases', () => {
  it('there are 12', () => expect(file.cases).toHaveLength(12));

  for (const c of file.cases) {
    it(`${c.id} → ${c.expected.status}`, () => {
      const r = run(c);
      expect(r.status).toBe(c.expected.status);
      expect(r.expected_amount).toBe(c.expected.expected_amount);
      if (c.expected.difference !== undefined) expect(r.difference).toBe(c.expected.difference);
      expect(r.required_question).toBe(c.expected.required_question);
    });
  }
});

describe('pass criteria (spec §6)', () => {
  const results = file.cases.map(run);

  it('NEEDS_CONFIRMATION never carries an amount, and there are at least 5 of them', () => {
    const needs = results.filter((r) => r.status === 'NEEDS_CONFIRMATION');
    expect(needs.length).toBeGreaterThanOrEqual(5);
    for (const r of needs) {
      expect(r.expected_amount).toBeNull();
      expect(r.difference).toBeNull();
      expect(renderCard(r)).not.toMatch(/\d{1,3}(,\d{3})+원/);
    }
  });

  it('POTENTIAL_MISMATCH only with a policy the user confirmed', () => {
    for (const r of results.filter((x) => x.status === 'POTENTIAL_MISMATCH')) expect(r.policy_id).not.toBeNull();
  });

  it('no card contains a forbidden expression', () => {
    for (const r of results) expect(forbiddenHits(renderCard(r))).toEqual([]);
  });

  it('evidence is at most 3 items', () => {
    for (const r of results) expect(r.evidence_needed.length).toBeLessThanOrEqual(3);
  });

  it('same input, same output', () => {
    expect(JSON.stringify(file.cases.map(run))).toBe(JSON.stringify(results));
  });
});
