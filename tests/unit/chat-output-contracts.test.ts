import {expect,it,vi} from 'vitest';
import {createUrlScrubber,scrubFakeUrls} from '@/lib/chat/scrub-urls';
import {linkifyFaqCitations,hasVerifiedCitation} from '@/lib/chat/citations';
vi.mock('@/lib/supabase',()=>({supabase:{}}));
vi.mock('@/lib/supabase-server',()=>({supabaseAdmin:{}}));
import {extractLawCitations} from '@/lib/legal-verify';
it('all character split boundaries produce the same sanitized answer',()=>{
 const text='설명 [상담](https://www.winhr.co.kr/contact) 및 https://winhr.co.kr/path 끝';
 for(let i=0;i<=text.length;i++){
  const scrubber=createUrlScrubber();
  const output=scrubber.push(text.slice(0,i))+scrubber.push(text.slice(i))+scrubber.flush();
  expect(output,`split ${i}`).toBe(scrubFakeUrls(text));
 }
 const scrubber=createUrlScrubber();
 expect([...text].map(c=>scrubber.push(c)).join('')+scrubber.flush()).toBe(scrubFakeUrls(text));
});
it('server FAQ footer becomes clickable citation links',()=>{
 const output=linkifyFaqCitations('설명\n\n---\n참고 FAQ: [FAQ#123], [FAQ#456]', [{type:'FAQ',id:'123'},{type:'FAQ',id:'456'}]);
 expect(output).toContain('(/faq?id=123)');expect(output).toContain('(/faq?id=456)');
 expect(output.match(/참고 자료/g)).toHaveLength(1);
});
it.each([
 '남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률',
 '기간제 및 단시간근로자 보호 등에 관한 법률',
 '파견근로자 보호 등에 관한 법률',
 '근로자참여 및 협력증진에 관한 법률',
])('formal title is a verifiable law citation: %s',law=>{
 expect(extractLawCitations(`${law} 제76조의2`)).toEqual([{law,article:76,sub:2,label:'제76조의2'}]);
});

it('invented IDs never become clickable even alongside verified citations',()=>{
 const text='근거 [FAQ#123], [FAQ#999], [CASE#invented], [COURT#invented], [INTERP#invented]';
 const output=linkifyFaqCitations(text,[{type:'FAQ',id:'123'}]);
 expect(output).toContain('(/faq?id=123)');expect(output).not.toContain('id=999');
 expect(output).not.toContain('/decisions/');expect(output).not.toContain('/cases/');expect(output).not.toContain('/interpretations/');
});
it('missing evidence fails closed, and direct source links cannot bypass ID checks',()=>{
 expect(linkifyFaqCitations('[FAQ#123]')).not.toContain('/faq');
 const output=linkifyFaqCitations('[원문](/cases/allowed) [허구](/cases/invented)',[{type:'COURT',id:'allowed'}]);
 expect(output).toContain('[원문](/cases/allowed)');expect(output).toContain('허구');expect(output).not.toContain('/cases/invented');
});
it('verified original Korean identifiers remain intact and URL encoded',()=>{
 const id='노사관계법제과-2110';
 expect(linkifyFaqCitations(`[INTERP#${id}]`,[{type:'INTERP',id}])).toContain(`/interpretations/${encodeURIComponent(id)}`);
});

it('citation matching honors exact identifiers and escaped punctuation',()=>{
 expect(hasVerifiedCitation('[FAQ#123]',[{type:'FAQ',id:'123'}])).toBe(true);
 expect(hasVerifiedCitation('[FAQ#1234]',[{type:'FAQ',id:'123'}])).toBe(false);
 expect(hasVerifiedCitation('[COURT#A.1]',[{type:'COURT',id:'A.1'}])).toBe(true);
 expect(hasVerifiedCitation('[COURT#Ax1]',[{type:'COURT',id:'A.1'}])).toBe(false);
});
