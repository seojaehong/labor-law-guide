import fs from 'node:fs';
import cp from 'node:child_process';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const base='http://127.0.0.1:3126',out='docs/design-visuals/severance-statement-20261005';
fs.mkdirSync(out,{recursive:true});
const gitArgs=['-c','safe.directory=C:/Users/iceam/Documents/Codex/2026-10-05/task-2/site-final-review','show'];
const oldHtml=cp.execFileSync('git',[...gitArgs,'33d9d72:public/tools/severance.html'],{encoding:'utf8'});
const oldCss=cp.execFileSync('git',[...gitArgs,'33d9d72:public/tools/severance-brand.css'],{encoding:'utf8'});
const browser=await chromium.launch({executablePath:'C:/Users/iceam/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'});
const results=[],matrix=[];
try {
for(const version of ['before','after']){
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==base||u.pathname.startsWith('/api/'))return r.abort();if(version==='before'&&u.pathname==='/tools/severance.html')return r.fulfill({body:oldHtml,contentType:'text/html'});if(version==='before'&&u.pathname==='/tools/severance-brand.css')return r.fulfill({body:oldCss,contentType:'text/css'});return r.continue();});
 await page.goto(base+'/tools/severance.html');
 for(const[id,value]of Object.entries({startDate:'2020-01-01',endDate:version==='before'?'2026-10-05':'2026-10-04',workerName:'합성 근로자',businessName:'합성 사업장',ownerName:'합성 사업주',wage1:'3000000',wage2:'3000000',wage3:'3000000',wage4:'3000000'}))await page.locator('#'+id).fill(value);
 await page.evaluate(()=>{document.activeElement?.blur();onCalculate();});await page.waitForTimeout(3200);
 results.push(await page.evaluate(()=>state.workers[0].result));
 for(const theme of ['light','dark']){await page.evaluate(t=>updateToolTheme(t==='dark'),theme);await page.locator('.statement').screenshot({path:`${out}/${version}-${theme}-390.png`,animations:'disabled'});}
 if(version==='after'){
  for(const width of [360,390,430,768,1440]){await page.setViewportSize({width,height:900});const v=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,break:getComputedStyle(document.querySelector('.statement')).wordBreak}));assert.ok(v.scroll<=v.width,JSON.stringify(v));assert.equal(v.break,'keep-all');matrix.push(v);}
  await page.setViewportSize({width:390,height:844});await page.locator('.stmt-scroll').focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(200);assert.ok(await page.locator('.stmt-scroll').evaluate(e=>e.scrollLeft>0));
  const words=await page.locator('.stmt-meta dt').evaluateAll(nodes=>nodes.map(n=>{const r=document.createRange();r.selectNodeContents(n);return [...r.getClientRects()].length;}));assert.ok(words.every(count=>count===1));
  const longContent=await page.evaluate(()=>{const w=state.workers[0],name=w.workerName;w.workerName='https://example.invalid/'+ 'long-url-'.repeat(40);renderResult(w.result);const valid=document.documentElement.scrollWidth<=innerWidth;w.workerName=name;renderResult(w.result);return valid;});assert.ok(longContent);
 }
 await page.evaluate(()=>updateToolTheme(false));await page.emulateMedia({media:'print'});await page.pdf({path:`${out}/${version}-a4.pdf`,format:'A4',printBackground:true,margin:{top:'10mm',bottom:'10mm',left:'10mm',right:'10mm'}});await context.close();
}
// 261113 — 예전에는 before(33d9d72)·after 계산이 똑같아야 했다. #104(퇴직금 엔진을 고용노동부 계산기와 일치)가 계속근로기간을 「햇수+잔여일/365」에서 「총일수/365」로, 평균임금을 원 미만 둘째 자리 올림으로 바꿔 의도적으로 달라졌다(26,447,885 → 26,469,328). 디자인 시험이므로 before 계산은 비교하지 않고, after 를 현재 정본 값에 고정한다: 12,000,000 ÷ 92 = 130,434.79(올림) × 30 × 2,469 ÷ 365.
{const r=results[1];assert.equal(r.serviceDays,2469);assert.equal(r.avgWage,130434.79);assert.equal(r.severancePay,26469328);assert.equal(r.totalTax,337980);assert.equal(r.netSeverance,26131348);assert.equal(r.lastWorkDate,'2026-10-04');assert.equal(r.retireDate,'2026-10-05');}
fs.writeFileSync(`${out}/design-checks.json`,JSON.stringify({baseline:'33d9d72',calculationPinned:{severancePay:26469328,avgWage:130434.79,serviceDays:2469},realApiCalls:0,matrix,keyboardTableScroll:true,koreanLabelsUnbroken:true,longUrlWithoutPageOverflow:true,result:results[1]},null,2));
console.log('Statement design: calculation pinned to current engine; 5 widths; keyboard table scroll; before/after PNG and A4 PDFs rendered');
}finally{await browser.close();}
