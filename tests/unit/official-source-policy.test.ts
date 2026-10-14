import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {officialSource} from '@/lib/public-source-url';
import OfficialSourceLink from '@/components/OfficialSourceLink';
import MarkdownSnippet from '@/app/database/_components/MarkdownSnippet';
import CollectedSourceBody from '@/components/CollectedSourceBody';
it.each(['http://www.law.go.kr/LSW/precInfoP.do?precSeq=1','//www.law.go.kr/LSW/precInfoP.do?precSeq=1','https://law.go.kr@evil.example/LSW/precInfoP.do?precSeq=1','https://evil.example@law.go.kr/LSW/precInfoP.do?precSeq=1','https://www.law.go.kr:8443/LSW/precInfoP.do?precSeq=1','https://www.law.go.kr/LSW/precInfoP.do?precSeq=1&url=https://bigcase.ai','javascript:alert(1)','data:text/html,x','https://bigcase.ai/cases/123','https://elbox.io/case/1','https://superlawyer.ai/x','https://ilabor.co.kr/x','https://elabor.co.kr/x','https://www.law.go.kr.evil.invalid/LSW/precInfoP.do?precSeq=372172','https://www.law.go.kr/','https://www.law.go.kr/search?q=372172','https://labor.moel.go.kr/redirect?id=18820','https://www.law.go.kr/LSW/precInfoP.do?precSeq=1&precSeq=2'])('rejects private, spoofed, non-document and ambiguous source URLs %s',url=>{
 expect(officialSource(url)).toBeNull();const html=renderToStaticMarkup(createElement(OfficialSourceLink,{urls:[url]}));expect(html).toContain('공식 원문 미확인');expect(html).not.toContain('href=');
});
it('uses stored official IDs only and identifies the actual agency',()=>{
 const a=officialSource('https://www.law.go.kr/DRF/lawService.do?target=prec&ID=372172&type=HTML');expect(a?.url).toBe('https://www.law.go.kr/DRF/lawService.do?target=prec&ID=372172&type=HTML');
 expect(officialSource('https://labor.moel.go.kr/cmmt/iqrs_detail.do?id=18820')?.agency).toBe('고용노동부');
 expect(officialSource('https://www.law.go.kr/LSW/precInfoP.do?precSeq=372172&redirect=https://evil.invalid')).toBeNull();
});
it('source Markdown blocks private original/reference links but preserves ordinary citation and footnote contracts',()=>{
 const text='[원문 보기](https://bigcase.ai/cases/1) [참고](https://example.invalid/private) [일반 인용](https://example.invalid/citation) 각주[^a]\n\n[^a]: 각주 본문';
 const html=renderToStaticMarkup(createElement(MarkdownSnippet,{value:text}));expect(html).not.toContain('href="https://bigcase.ai');expect(html).not.toContain('href="https://example.invalid/private');expect(html).toContain('href="https://example.invalid/citation');expect(html).toContain('href="#user-content-fn-a"');
});
it('collected HTML preserves tables/tails while stripping active content and private source links',()=>{
 const text='<p>앞부분</p><table><tr><td>장근로수당만 발생함</td><td>규정을 준용한다.</td></tr></table><p>최종 결론</p><script>window.__fixtureExecuted=1</script><img src="https://evil.invalid/x" onerror="x"><a href="https://bigcase.ai/x">원문 보기</a>';
 const html=renderToStaticMarkup(createElement(CollectedSourceBody,{text}));expect(html).toContain('<table>');expect(html).toContain('최종 결론');expect(html).toContain('장근로수당만 발생함');expect(html).not.toMatch(/<script|<img|onerror|href="https:\/\/bigcase/);expect(html).not.toContain('window.__fixtureExecuted');
});
it('checks candidates independently, never relabels a private URL as official',()=>{
 const html=renderToStaticMarkup(createElement(OfficialSourceLink,{urls:['https://bigcase.ai/1','https://labor.moel.go.kr/cmmt/iqrs_detail.do?id=18820']}));expect(html).toContain('고용노동부');expect(html).not.toContain('bigcase');expect(html).not.toContain('법제처');
});
