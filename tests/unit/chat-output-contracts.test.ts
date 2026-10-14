import {expect,it,vi} from 'vitest';
import {createUrlScrubber,scrubFakeUrls} from '@/lib/chat/scrub-urls';
import {linkifyFaqCitations} from '@/lib/chat/citations';
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
 const output=linkifyFaqCitations('설명\n\n---\n참고 FAQ: [FAQ#123], [FAQ#456]');
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
