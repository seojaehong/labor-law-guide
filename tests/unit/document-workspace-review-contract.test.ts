import { it as test } from 'vitest';
import assert from 'node:assert/strict';
import { ReviewedCase } from '@/lib/document-workspace/review-contract';
import type { Revision, Request, Result } from '@/lib/document-workspace/evidence-contract';
function fixture(id = 'M1', kind: Revision['kind'] = 'M1') {
  const revision: Revision = { id, kind, originalNotice: '원문 통지',
    currentAllegations: ['08-25'], headcount: 8, outline: ['적용범위'],
    draft: '합성 조건부 답변서', draftDigest: id+'draft', outlineDigest: id+'outline',
    sourceSetDigest: id+'sources', unresolvedImpact: false, explanation: id+'정정 설명' };
  const request: Request = { userId: 'A', caseId: 'E01', revisionId: id,
    operationId: 'selection', factsDigest: id+'facts', candidateSetDigest: id+'sources',
    legalAsOf: '2026-09-15', issues: ['scope'], sources: [{ id: 'S', text: '합성 근거',
      digest: 'digest', kind: 'law', temporalStatus: 'verified', effectiveFrom: '2026-08-20' }] };
  const result: Result = { revisionId: id, factsDigest: id+'facts',
    candidateSetDigest: id+'sources', providerId: 'mock', modelVersion: 'mock1',
    adapterVersion: '1', status: 'selected', reasons: [], selections: [{
      issueId: 'scope', sourceId: 'S', rawScore: .8, scoreKind: 'probability',
      start: 0, end: 2, quote: '합성', sourceDigest: 'digest' }] };
  return { revision, request, result };
}
test('review gate requires verified current evidence before explicit approval/export', () => {
  const a = fixture(); const flow = new ReviewedCase('A', 'E01', a.revision);
  assert.throws(() => flow.approve('A', 'outline', '2026-10-13'), /evidence-review/);
  assert.deepEqual(flow.acceptEvidence('A', a.request, a.result), []);
  flow.review('A'); flow.approve('A', 'outline', '2026-10-13');
  flow.approve('A', 'final', '2026-10-13');
  flow.store('A', { revisionId: 'M1', draftDigest: a.revision.draftDigest,
    format: 'word', bytes: new Uint8Array([1]) });
  assert.deepEqual(flow.download('A', 'M1', 'word'), new Uint8Array([1]));
  const b = fixture('M2', 'M2'); flow.correct('A', b.revision);
  assert.throws(() => flow.download('A', 'M1', 'word'), /evidence-review/);
  assert.ok(flow.acceptEvidence('A', a.request, a.result).includes('revision-mismatch'));
  assert.deepEqual(flow.acceptEvidence('A', b.request, b.result), []);
  flow.review('A'); flow.approve('A', 'outline', '2026-10-13');
  flow.approve('A', 'final', '2026-10-13');
  assert.equal(flow.history.length, 2);
});
test('invalid replacement clears evidence gate; cross-case sources rejected', () => {
  const a = fixture(); const flow = new ReviewedCase('A', 'E01', a.revision);
  assert.deepEqual(flow.acceptEvidence('A', a.request, a.result), []);
  const bad = structuredClone(a.result); bad.selections[0].sourceId = 'missing';
  assert.ok(flow.acceptEvidence('A', a.request, bad).includes('unknown-source'));
  assert.throws(() => flow.approve('A', 'outline', '2026-10-13'), /evidence-review/);
  a.request.caseId = 'other';
  assert.ok(flow.acceptEvidence('A', a.request, a.result).includes('case-mismatch'));
});
