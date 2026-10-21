import { it as test } from 'vitest';
import assert from 'node:assert/strict';
import { validate, CaseFlow, MockOperations } from '@/lib/document-workspace/evidence-contract';
import type { Request, Result, Revision, Selector } from '@/lib/document-workspace/evidence-contract';
const request = (): Request => ({
  userId: 'A', caseId: 'E01', revisionId: 'M1', operationId: 'select',
  factsDigest: 'facts1', candidateSetDigest: 'sources1', legalAsOf: '2026-09-15',
  issues: ['scope'], sources: [{ id: 'law11', text: '합성 적용범위 근거', digest: 's1',
    kind: 'law', temporalStatus: 'verified', effectiveFrom: '2026-08-20' }],
});
const result = (): Result => ({
  revisionId: 'M1', factsDigest: 'facts1', candidateSetDigest: 'sources1',
  providerId: 'mock', modelVersion: 'mock-v1', adapterVersion: '1',
  status: 'selected', reasons: [],
  selections: [{ issueId: 'scope', sourceId: 'law11', rawScore: .8,
    scoreKind: 'probability', start: 0, end: 2, quote: '합성', sourceDigest: 's1' }],
});
const revision = (kind: Revision['kind'] = 'M1'): Revision => ({
  id: kind, kind, originalNotice: '08-18/08-25 불참 통지 원문',
  currentAllegations: kind === 'M1' ? ['08-18', '08-25'] : ['08-25'],
  headcount: kind === 'M3a' ? null : kind === 'M3b' ? 4 : 8,
  outline: ['신청취지', '경위', '적용범위', '회사주장', '반론·한계', '서면통지', '해고예고', '결론·보완'],
  draft: kind + ' 조건부 초안; 답변기한/통상임금 미상',
  draftDigest: kind + '-draft', outlineDigest: kind + '-outline',
  sourceSetDigest: kind + '-sources', unresolvedImpact: false, explanation: kind + ' 변경 설명',
});
const flow = () => new CaseFlow('A', 'E01', revision());
function approve(f: CaseFlow) {
  f.approve('A', f.current.id, 'outline', '2026-10-13T04:16:00Z');
  f.approve('A', f.current.id, 'final', '2026-10-13T04:17:00Z');
}
test('F01 valid synthetic selection and editable isolated revision', () => {
  assert.deepEqual(validate(request(), result()), []);
  const f = flow(); const copy = f.current; copy.draft = '외부 수정';
  assert.match(f.current.draft, /조건부/); assert.equal(f.current.outline.length, 8);
});
test('F02 nonexistent source rejected', () => {
  const r = result(); r.selections[0].sourceId = 'invented';
  assert.ok(validate(request(), r).includes('unknown-source'));
});
test('F03 citation and digest mismatch rejected', () => {
  const r = result(); r.selections[0].quote = '없는 인용'; r.selections[0].sourceDigest = 'bad';
  assert.ok(validate(request(), r).includes('quote-mismatch'));
  assert.ok(validate(request(), r).includes('digest-mismatch'));
});
test('F04 missing body rejected', () => {
  const q = request(); q.sources[0].text = ' ';
  assert.ok(validate(q, result()).includes('missing-body'));
});
test('F05 unknown/future/invalid effective date rejected', () => {
  for (const value of ['unknown', 'future', 'invalid']) {
    const q = request();
    if (value === 'unknown') q.sources[0].temporalStatus = 'unknown';
    else q.sources[0].effectiveFrom = value === 'future' ? '2027-01-01' : '2026-02-30';
    assert.ok(validate(q, result()).some(e => ['unknown-time', 'out-of-time'].includes(e)));
  }
});
test('F06 M2 preserves notice and invalidates approval', () => {
  const f = flow(); approve(f); f.correct('A', revision('M2'));
  assert.equal(f.current.originalNotice, f.history[0].originalNotice);
  assert.deepEqual(f.current.currentAllegations, ['08-25']);
  assert.throws(() => f.approve('A', 'M2', 'final', '2026-10-13'), /blocked/);
  assert.throws(() => f.download('A', 'M1', 'word'), /blocked/);
});
test('F07 M2 review and explicit reapproval retain versions', () => {
  const f = flow(); f.correct('A', revision('M2')); f.review('A', 'M2'); approve(f);
  assert.deepEqual(f.history.map(r => r.id), ['M1', 'M2']);
  assert.notEqual(f.history[0].draftDigest, f.current.draftDigest);
});
test('F08 M3a remains uncertain and cannot finalize', () => {
  const f = flow(); f.correct('A', revision('M3a'));
  assert.equal(f.current.headcount, null);
  assert.throws(() => f.review('A', 'M3a'), /blocked/);
});
test('F09 M3b requires new scope outline and draft', () => {
  const f = flow(); approve(f);
  const stale = revision('M3b'); stale.draftDigest = f.current.draftDigest;
  assert.throws(() => f.correct('A', stale), /new-outline/);
  f.correct('A', revision('M3b'));
  assert.ok(f.current.outline.includes('적용범위'));
  assert.throws(() => f.download('A', 'M1', 'pdf'), /blocked/);
});
test('F10 late M1 selection cannot attach to M2', () => {
  const q = request(); q.revisionId = 'M2'; q.factsDigest = 'facts2';
  assert.ok(validate(q, result()).includes('stale-result'));
});
test('F11 timeout unknown retains reservation and retries zero', async () => {
  const ledger = new MockOperations(); let calls = 0;
  const adapter: Selector = { async select() { calls++; throw new Error('timeout-unknown'); } };
  const p = ledger.run(request(), 100, adapter);
  await assert.rejects(p, /unknown/);
  await assert.rejects(ledger.run(request(), 100, adapter), /unknown/);
  assert.equal(calls, 1); assert.equal(ledger.reserved(), 100);
});
test('F12 simultaneous identical operations execute once', async () => {
  const ledger = new MockOperations(); let calls = 0;
  const adapter: Selector = { async select() { calls++; return result(); } };
  const a = ledger.run(request(), 100, adapter); const b = ledger.run(request(), 100, adapter);
  assert.equal(a, b); await Promise.all([a,b]); assert.equal(calls, 1);
  const changed = request(); changed.factsDigest = 'changed';
  assert.throws(() => ledger.run(changed, 100, adapter), /conflict/);
});
test('F13 user/case isolation', async () => {
  const f = flow(); assert.throws(() => f.approve('B', 'M1', 'outline', '2026-10-13'), /forbidden/);
  const ledger = new MockOperations(); let calls = 0;
  const adapter: Selector = { async select() { calls++; return result(); } };
  const other = request(); other.caseId = 'E02';
  await Promise.all([ledger.run(request(), 1, adapter), ledger.run(other, 1, adapter)]);
  assert.equal(calls, 2);
});
test('F14 unapproved and correction-before-download blocked', () => {
  const f = flow(); assert.throws(() => f.download('A', 'M1', 'word'), /blocked/);
  approve(f); f.store('A', { revisionId: 'M1', draftDigest: f.current.draftDigest,
    format: 'word', bytes: new Uint8Array([1,2]) });
  f.correct('A', revision('M2')); assert.throws(() => f.download('A', 'M1', 'word'), /blocked/);
});
test('F15 repeated stored Word/PDF mock bytes are immutable without selector', () => {
  const f = flow(); approve(f);
  for (const format of ['word','pdf'] as const) {
    f.store('A', { revisionId: 'M1', draftDigest: f.current.draftDigest, format,
      bytes: new Uint8Array([1,2,3]) });
    const a = f.download('A', 'M1', format); a[0] = 9;
    assert.deepEqual(f.download('A', 'M1', format), new Uint8Array([1,2,3]));
  } // Mock bytes only; no actual document format quality claimed.
});
test('F16 provider score semantics and finite values', () => {
  for (const score of [NaN, Infinity, -.1, 1.1]) {
    const r = result(); r.selections[0].rawScore = score;
    assert.ok(validate(request(), r).includes('invalid-score'));
  }
  const r = result(); r.providerId = 'qwen-mock'; r.selections[0].scoreKind = 'logit';
  r.selections[0].rawScore = -11.375; assert.deepEqual(validate(request(), r), []);
});
