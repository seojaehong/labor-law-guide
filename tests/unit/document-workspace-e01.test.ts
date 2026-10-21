import {expect,it} from 'vitest';
import JSZip from 'jszip';
import {initialE01,editE01,correctE01,consultE01,outlineE01,approveOutlineE01,draftE01,approveOutputE01,exportE01,type E01} from '@/lib/document-workspace/e01';
import {createWord} from '@/lib/document-workspace/word';
import {documentText} from '@/lib/document-workspace/workflow';
function reviewed(s:E01):E01{return approveOutputE01(draftE01(approveOutlineE01(outlineE01(consultE01(s)))));}
it('E01 M1 uses structured employer facts and all eight content units',()=>{
  const s=reviewed(initialE01()),text=documentText(exportE01(s));
  for(const unit of ['신청취지','경위','적용범위','회사주장','반론·한계','서면통지','해고예고','결론·보완'])expect(text).toContain(unit);
  expect(text).toContain('회사 측 부당해고 답변서');expect(text).toContain('2026-09-01');
  expect(text).toContain('8인');expect(text).toContain('미상');
});
it('M2 retains M1/notice and blocks old approval until regenerated/reviewed',()=>{
  const first=reviewed(initialE01()),corrected=correctE01(first,'M2');
  expect(()=>exportE01(corrected)).toThrow('review-required');
  expect(corrected.history.at(-1)?.sections).toEqual(first.sections);
  expect(corrected.originalNotice).toBe(first.originalNotice);
  const next=reviewed(corrected);
  expect(next.sections[2].text).toContain('08-18 승인휴무는 불참 주장에서 제외');
  expect(next.evidence.find(e=>e.id==='notice-original')?.body).toBe(first.originalNotice);
});
it('M3a unknown cannot turn into assumed4 and M3b creates scope memo',()=>{
  const m2=reviewed(correctE01(reviewed(initialE01()),'M2'));
  const m3a=correctE01(m2,'M3a');expect(m3a.headcount).toBe('unknown');
  expect(reviewed(m3a).sections[1].text).toContain('4인으로 단정하지 않음');
  const m3b=correctE01(reviewed(m3a),'M3b');expect(()=>exportE01(m3b)).toThrow();
  const done=reviewed(m3b);expect(done.sections[0].text).toContain('적용범위 검토 메모');
  expect(done.sections[1].text).toContain('31일·124연인원');
  expect(done.history.some(h=>h.scenario==='M1')).toBe(true);
  expect(done.history.some(h=>h.scenario==='M2')).toBe(true);
});
it('fact editing preserves original source and invalidates every approval',()=>{
  const s=reviewed(initialE01()),changed=editE01(s,{...s.facts,notice:'정정된 현재 주장'});
  expect(changed.originalNotice).toBe(s.originalNotice);expect(changed.outputApproved).toBe(false);
  expect(changed.outlineApproved).toBe(false);expect(()=>exportE01(changed)).toThrow();
  expect(()=>draftE01(outlineE01(consultE01(changed)))).toThrow('outline-approval-required');
});
it('real DOCX downloads match approved current revision with no provider hooks',async()=>{
  const s=reviewed(correctE01(reviewed(initialE01()),'M2'));
  const first=await createWord(exportE01(s)),second=await createWord(exportE01(s));
  for(const bytes of [first,second]) {
    const zip=await JSZip.loadAsync(bytes);const xml=await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('회사');expect(xml).toContain('승인휴무');
    expect(xml).toContain('문서 버전 '+s.version);expect(xml).toContain('공식 원문 확인 미완료');
  }
});
