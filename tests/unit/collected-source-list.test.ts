import {expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import Body from '@/components/CollectedSourceBody';
import OfficialSourceLink from '@/components/OfficialSourceLink';
it('preserves ordered-list start/item numbers and letter type without forcing disc bullets',()=>{
 const html=renderToStaticMarkup(createElement(Body,{text:'<ol start="3"><li>세 번째</li><li value="7">일곱 번째</li></ol><ol type="a"><li>문자 순번</li></ol><ul><li>글머리</li></ul>'}));
 expect(html).toContain('start="3"');expect(html).toContain('value="7"');expect(html).toContain('list-style-type:decimal');expect(html).toContain('list-style-type:lower-alpha');expect(html).toContain('[&amp;_ul&gt;li]:list-disc');expect(html).not.toContain('[&amp;_li]:list-disc');
});
it('shows an identity caution as visible text, not just an anchor title',()=>{
 const html=renderToStaticMarkup(createElement(OfficialSourceLink,{urls:['https://www.law.go.kr/LSW/precInfoP.do?precSeq=372172']}));
 expect(html).toMatch(/<span[^>]*>자료 일치 확인 필요<\/span>/);
});
it('rewrites HTML id/name targets and fragments together with clobber protection',()=>{
 const html=renderToStaticMarkup(createElement(Body,{text:'<a href="#fn1">각주1</a><p id="fn1">첫 각주</p><a href="#fn2">각주2</a><a name="fn2"></a><p id="constructor">보존할 문장</p><a href="#missing">미확인 각주</a>'}));
 expect(html).toContain('id="collected-source-fn1"');expect(html).toContain('href="#collected-source-fn1"');expect(html).toContain('id="collected-source-fn2"');expect(html).toContain('href="#collected-source-fn2"');expect(html).not.toContain('name=');expect(html).not.toContain('id="constructor"');expect(html).not.toContain('href="#missing"');expect(html).toContain('미확인 각주');
});
it('preserves GFM footnote targets and accessibility references after sanitization',()=>{
 const html=renderToStaticMarkup(createElement(Body,{text:'각주를 확인한다.[^a]\n\n[^a]: 보존할 각주 문장'}));
 const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
 for(const [,ref] of html.matchAll(/href="#([^"]+)"/g))expect(ids.has(decodeURIComponent(ref))).toBe(true);
 for(const [,ref] of html.matchAll(/aria-describedby="([^"]+)"/g))expect(ids.has(ref)).toBe(true);
 expect(html).toContain('보존할 각주 문장');expect(html).toContain('href="#collected-source-');
});
