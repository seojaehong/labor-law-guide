import {expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {officialSource} from '@/lib/public-source-url';
import MarkdownSnippet from '@/app/database/_components/MarkdownSnippet';
import Body from '@/components/CollectedSourceBody';
it('canonicalizes legacy official API URLs without guessing an ID or retaining account parameters',()=>{
 const stored='http://www.law.go.kr/DRF/lawService.do?OC=synthetic-account&target=prec&ID=372172&type=HTML';
 expect(officialSource(stored)?.url).toBe('https://www.law.go.kr/LSW/precInfoP.do?mode=0&precSeq=372172');
 for(const value of [stored.replace('www.law.go.kr','law.go.kr.evil.invalid'),stored+'&redirect=https://evil.invalid',stored.replace('372172','unknown'),stored.replace('target=prec','target=prec&target=other'),stored.replace('type=HTML','type=XML'),'http://www.law.go.kr/LSW/precInfoP.do?precSeq=372172'])expect(officialSource(value)).toBeNull();
});
it.each(['https://kss/','https://localhost/','https://192.168.1.1/','https://bad..example/x','https://user:pass@example.invalid/x'])('preserves malformed external link text without a clickable destination %s',href=>{
 const text=`[수집된 주소](${href})`;for(const html of [renderToStaticMarkup(createElement(MarkdownSnippet,{value:text})),renderToStaticMarkup(createElement(Body,{text}))]){expect(html).toContain('수집된 주소');expect(html).not.toContain('href=');}
});
it('renders truncated summary HTML safely without reconstructing absent text or losing the separate full-body tail',()=>{
 const text='<style>.summary { font-size:12px } /* PRIVATE_CSS_PROBE */</style><table><tr><td>보존할 요약 셀</td></tr></table><p>요약 마지막 문장</p><td class="';
 const html=renderToStaticMarkup(createElement(Body,{text}));expect(html).toContain('보존할 요약 셀');expect(html).toContain('요약 마지막 문장');expect(html).not.toContain('PRIVATE_CSS_PROBE');expect(html).not.toContain('&lt;style');expect(html).not.toContain('&lt;td');
});

it('blocks the reported bare single-host autolink in both text and imported HTML',()=>{
 const plain=renderToStaticMarkup(createElement(MarkdownSnippet,{value:'수집 주소 https://kss/ 는 불완전하다.'}));
 const raw=renderToStaticMarkup(createElement(Body,{text:'<p>수집 주소 <a href="https://kss/">https://kss/</a></p>'}));
 for(const html of [plain,raw]){expect(html).toContain('https://kss/');expect(html).not.toContain('href="https://kss/"');}
});

it('keeps summary and full-body footnotes in distinct safe namespaces',()=>{
 const input='<a href="#fn1">각주</a><p id="fn1">각주 문장</p>';
 const a=renderToStaticMarkup(createElement(Body,{text:input,anchorScope:'interpretation-answer'}));
 const b=renderToStaticMarkup(createElement(Body,{text:input,anchorScope:'interpretation-body'}));
 expect(a).toContain('href="#collected-source-interpretation-answer-fn1"');expect(b).toContain('href="#collected-source-interpretation-body-fn1"');expect(a+b).not.toContain('id="fn1"');
});
