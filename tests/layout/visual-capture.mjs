import { chromium } from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out='docs/design-visuals'; const base='http://127.0.0.1:3125';
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
const blocked=[];await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==base||u.pathname.startsWith('/api/')){if(u.pathname.startsWith('/api/'))blocked.push(u.pathname);return r.abort();}return r.continue();});
const page=await context.newPage(); const log=[];
async function snap(route,name){const response=await page.goto(base+route);assert.equal(response.status(),200);await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:`${out}/${name}.png`});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));log.push({route,status:response.status(),overflow:false});}
await snap('/laws','final-laws-mobile');await page.locator('nav').first().screenshot({path:`${out}/header-proposal-390.png`});
await page.evaluate(()=>{for(const img of document.querySelectorAll('.editorial-wordmark img')){img.src='/brand/work-patterns-wordmark-original.svg';img.srcset='';}});await page.waitForTimeout(200);await page.locator('nav').first().screenshot({path:`${out}/header-original-390.png`});
await page.setViewportSize({width:1440,height:1000});await snap('/laws','final-laws-desktop');await page.setViewportSize({width:390,height:844});await page.evaluate(()=>localStorage.setItem('theme','dark'));await snap('/laws','final-laws-dark');await page.evaluate(()=>localStorage.setItem('theme','light'));
await snap('/tools/work-rules','work-rules-mobile');await page.getByRole('button',{name:'취업규칙 입력·점검'}).click();await page.screenshot({path:`${out}/final-rules-mobile.png`});log.push({route:'/tools/work-rules',dialog:true});
await snap('/blog','blog-summary-mobile');assert(!(await page.locator('main').innerText()).includes('<p>'));
await snap('/faq','faq-category-mobile');
for(const [route,name] of [['/opengraph-image','og-general'],['/og/wordmark-review?variant=original','og-wordmark-original'],['/og/wordmark-review','og-wordmark-proposal'],['/og/laws','og-laws-index'],['/og/laws?event=006288-20251001','og-laws'],['/og/news-20261003-01','og-article-fixture']]){const r=await context.request.get(base+route);assert.equal(r.status(),200);fs.writeFileSync(`${out}/${name}.png`,await r.body());log.push({route,status:r.status()});}
await context.unroute('**/*');await page.goto('file:///'+process.cwd().replaceAll('\\','/')+'/'+out+'/comparison.html');await page.setViewportSize({width:876,height:620});await page.screenshot({path:`${out}/wordmark-header-og-comparison.png`});
assert.deepEqual(blocked,[]);fs.writeFileSync(`${out}/verification-current.json`,JSON.stringify({checks:log,blockedApiRequests:blocked},null,2));await browser.close();

