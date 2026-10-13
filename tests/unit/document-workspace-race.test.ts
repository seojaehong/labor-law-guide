import {expect,it} from 'vitest';
import {initialE01,beginEditE01,correctE01,editE01,consultE01,outlineE01,approveOutlineE01,draftE01,approveOutputE01,type E01} from '@/lib/document-workspace/e01';
import {renderApprovedE01} from '@/lib/document-workspace/e01-export';
function ready(s:E01){return approveOutputE01(draftE01(approveOutlineE01(outlineE01(consultE01(s)))));}
it.each(['M2','M3a','facts','buffer'] as const)('rejects delayed Word rendering after %s invalidates approval',async kind=>{
  const snapshot=ready(initialE01());let current=snapshot;
  let release!:(bytes:Uint8Array)=>void;
  const renderer=()=>new Promise<Uint8Array>(resolve=>{release=resolve;});
  const result=renderApprovedE01(snapshot,()=>current,renderer);
  current=kind==='buffer'?beginEditE01(snapshot):kind==='facts'?editE01(snapshot,{...snapshot.facts,employer:'새 회사 주장'}):correctE01(snapshot,kind);
  release(new Uint8Array([1,2,3]));
  await expect(result).rejects.toThrow('stale-export');
  expect(current.outputApproved).toBe(false);
});
it('returns approved unchanged bytes and never renders unapproved state',async()=>{
  const snapshot=ready(initialE01());let calls=0;
  const renderer=async()=>{calls++;return new Uint8Array([1]);};
  await expect(renderApprovedE01(snapshot,()=>snapshot,renderer)).resolves.toEqual(new Uint8Array([1]));
  await expect(renderApprovedE01(initialE01(),()=>snapshot,renderer)).rejects.toThrow('review-required');
  expect(calls).toBe(1);
});
it('M2 withdrawal preserves current notice and original past notice separately',()=>{
  const m2=correctE01(ready(initialE01()),'M2');
  const notice='08-25 정상출근 확인. 현재 불참 주장을 철회한다.';
  const next=ready(editE01(m2,{...m2.facts,notice}));
  expect(next.sections[2].text).toContain(notice);
  expect(next.sections[2].text).not.toContain('08-25 불참·사전 연락 주장만 재검토');
  expect(next.originalNotice).toContain('08-18/08-25');
});
it('changed relief appears consistently without fabricating reinstatement',()=>{
  const first=ready(initialE01());
  const workerPosition='금전보상만 청구하며 복직은 구하지 않음';
  const next=ready(editE01(first,{...first.facts,workerPosition}));
  expect(next.sections[0].text).toContain(workerPosition);
  expect(next.sections[2].text).toContain(workerPosition);
  expect(next.sections[0].text).not.toContain('복직·임금상당액 청구');
});
it('custom conflicting approved-leave allegation is not silently rewritten',()=>{
  const initial=editE01(initialE01(),{...initialE01().facts,notice:'08-18 불참 재주장'});
  const m2=correctE01(initial,'M2');
  expect(m2.facts.notice).toBe('08-18 불참 재주장');
  expect(()=>draftE01(approveOutlineE01(outlineE01(consultE01(m2))))).toThrow('leave-claim-conflict');
});
