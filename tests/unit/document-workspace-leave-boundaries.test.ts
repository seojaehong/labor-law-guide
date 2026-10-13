import {expect,it} from 'vitest';
import {initialE01,editE01,beginEditE01,correctE01,consultE01,outlineE01,approveOutlineE01,draftE01,approveOutputE01,exportE01,type E01} from '@/lib/document-workspace/e01';
function ready(s:E01){return approveOutputE01(draftE01(approveOutlineE01(outlineE01(consultE01(s)))));}
function blocked(s:E01){expect(()=>ready(s)).toThrow('leave-claim-confirmation-required');expect(()=>exportE01(s)).toThrow();}
const custom='08-18 무단결근 및 08-25 지각을 주장한다.';
it('pre-M2 custom allegation must be explicitly reconfirmed',()=>{
  const s=editE01(initialE01(),{...initialE01().facts,notice:custom,leaveClaim:'alleged'});
  const m2=correctE01(s,'M2');expect(m2.facts.notice).toBe(custom);
  expect(m2.facts.leaveClaim).toBe('unclear');blocked(m2);
  const confirmed=editE01(m2,{...m2.facts,notice:'08-18 승인휴무 제외. 08-25 지각만 주장.',leaveClaim:'excluded'});
  expect(ready(confirmed).sections[2].text).toContain('08-25 지각만 주장.');
});
it('known initial and repeated fixture correction stay safely excluded',()=>{
  let s=initialE01();for(let i=0;i<3;i++){s=correctE01(ready(s),'M2');expect(s.noticeOrigin).toBe('fixture');expect(s.facts.leaveClaim).toBe('excluded');}
  expect(s.evidence.filter(e=>e.id==='leave-0818')).toHaveLength(1);
});
it('editing back to exact initial fixture does not regain fixture provenance',()=>{
  const first=initialE01();
  const customState=editE01(first,{...first.facts,notice:custom});
  const restored=editE01(customState,{...customState.facts,notice:first.facts.notice});
  expect(restored.noticeOrigin).toBe('user');blocked(correctE01(restored,'M2'));
  blocked(correctE01(beginEditE01(first,true),'M2'));
});
it.each(['before-M2','after-M2'] as const)('M3 and repeated correction retain custom-review boundary: %s',timing=>{
  let s=initialE01();
  if(timing==='before-M2')s=editE01(s,{...s.facts,notice:custom});
  s=correctE01(s,'M2');
  if(timing==='after-M2')s=editE01(s,{...s.facts,notice:custom,leaveClaim:'unclear'});
  blocked(s);s=correctE01(s,'M3a');blocked(s);s=correctE01(s,'M3b');blocked(s);
  const firstNotice=s.originalNotice;
  const confirmed=ready(editE01(s,{...s.facts,notice:'08-18 승인휴무 인정. 지각 주장만 검토.',leaveClaim:'excluded'}));
  expect(confirmed.sections[0].text).toContain('적용범위 검토 메모');
  const repeated=correctE01(confirmed,'M2');blocked(repeated);
  expect(repeated.originalNotice).toBe(firstNotice);
  expect(repeated.evidence.map(e=>e.id).length).toBe(new Set(repeated.evidence.map(e=>e.id)).size);
  const final=ready(editE01(repeated,{...repeated.facts,leaveClaim:'excluded'}));expect(()=>exportE01(final)).not.toThrow();
});
