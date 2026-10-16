import { expect, it } from 'vitest';
import { buildComparisonMeta } from '@/lib/ai/prompt';
const row = (id:string, decision_result:string) => ({id,decision_result,title:id,holding_points:'가. 징계사유의 존재 여부 나. 징계양정의 적정성'});
it('counts only two visible card IDs when retrieval supplies three rows', () => {
  const rows=[row('w','granted'),row('e','기각'),row('hidden','각하')];
  const result=buildComparisonMeta('fixture',[],rows,rows);
  expect([...result.workerWinCases,...result.employerWinCases].map(c=>c.id)).toEqual(['w','e']);
  expect(result.issueSummary[0]).toContain('2건 중');
  expect(result.issueSummary.join(' ')).not.toContain('3건');
});
it('never restores undisplayed rows when full-text evidence has no displayed IDs',()=> {
  const result=buildComparisonMeta('fixture',[],[row('w','granted'),row('e','기각')],[row('hidden','각하')]);
  expect(result.issueSummary).toEqual([]);
});
it('caps evidence counts to the four visible representative cards',()=> {
  const rows=[row('w1','granted'),row('w2','granted'),row('w3','granted'),row('e1','기각'),row('e2','기각'),row('e3','기각')];
  const result=buildComparisonMeta('fixture',[],rows,rows);
  expect([...result.workerWinCases,...result.employerWinCases]).toHaveLength(4);
  expect(result.issueSummary[0]).toContain('4건 중');
});

it('issue evidence and displayed tally use exactly the same unique manifest IDs', () => {
  const rows=[row('w','granted'),row('w','granted'),row('e','기각'),row('hidden','각하')];
  const result=buildComparisonMeta('fixture',[],rows,rows);
  expect(result.issueEvidence).toHaveLength(2);
  expect([...result.workerWinCases,...result.employerWinCases].map(c => c.id)).toEqual(['w','e']);
  for (const issue of result.issueEvidence || []) {
    expect(issue.caseIds).toEqual(['w','e']);
    expect(result.issueSummary).toContain(`· ${issue.label} — ${issue.caseIds.length}건`);
    expect(issue.caseIds.every(id => [...result.workerWinCases,...result.employerWinCases].some(c => c.id === id))).toBe(true);
  }
  expect(result.issueSummary[0]).toContain('2건 중');
});
