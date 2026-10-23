// 취업규칙 점검 챗 화면(/tools/work-rules) 수동 검증 — 360·375·390px 와 데스크톱.
// 실행: NEXT_PUBLIC_WORK_RULES_PRECISE=1 로 띄운 개발 서버(127.0.0.1:3126)에 대고 `node tests/layout/work-rules-chat.mjs`
// AI 정밀 점검·관리자 기록 API 는 합성 응답으로 막는다(외부 전송 없음).
import fs from 'node:fs';import assert from 'node:assert/strict';import {chromium} from '@playwright/test';
const base=process.env.VISUAL_BASE_URL||'http://127.0.0.1:3126',dir='docs/design-visuals/work-rules-chat';fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});const results=[];const errors=[];
const row=(조문,결과)=>({'조문':조문,'현행':'','개정안':'','개정 사유':'합성 사유 — 화면 동작만 확인하는 자료입니다.','근거·시행일':'근로기준법 제00조','불이익변경':'해당 없음','점검 결과':결과,'운영 메모':'','제안 문안':''});
const SECOND='제1조(목적) 이 규칙은 회사 근로조건을 정한다.\n제2조(적용범위) 이 규칙은 모든 근로자에게 적용한다.';
async function overflow(page){return page.evaluate(()=>{const w=document.documentElement.clientWidth;return {sw:document.documentElement.scrollWidth,w,over:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.right>w+1&&getComputedStyle(e).position!=='fixed';}).slice(0,5).map(e=>e.className||e.tagName)};});}
for (const width of [360,375,390,1440]) {
  const ctx=await browser.newContext({viewport:{width,height:width>1000?1000:800}});
  await ctx.addInitScript(()=>{try{localStorage.setItem('admin_token','synthetic');}catch{}});
  let runs=0;
  await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==base)return r.abort();
    if(u.pathname==='/api/admin/work-rule-observations')return r.fulfill({json:{active:false}});
    if(u.pathname==='/api/tools/work-rules-precise'){runs++;return r.fulfill({json:{runId:'synthetic-'+runs,articles:2,rows:[row('제1조(목적)','현행 수정 필요'),row('제2조(적용범위)','추가 확인')]}});}
    if(u.pathname.startsWith('/api/'))return r.fulfill({status:204,body:''});
    return r.continue();});
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(`${width}: ${e.message}`));page.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED|Failed to load resource/.test(m.text()))errors.push(`${width}: ${m.text()}`);});
  await page.goto(base+'/tools/work-rules');await page.locator('.wr-composer').waitFor();
  // 1. 외부 전송 안내는 좁은 화면에서도 보인다(짧은 문장)
  const privacy=page.locator('.wr-privacy');assert.equal(await privacy.isVisible(),true,`${width}: 전송 안내가 보여야 한다`);
  const ptext=(await privacy.innerText()).trim();assert.match(ptext,/외부 AI/,`${width}: 안내에 외부 AI 전송이 있어야 한다`);
  const box=await page.locator('.wr-composer').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1,`${width}: 입력창이 화면 안에 있어야 한다`);
  for (const name of ['점검하기','hwp·hwpx·docx 파일 올리기']){const b=await page.getByRole('button',{name,exact:true}).boundingBox();assert.ok(b.x>=0&&b.x+b.width<=width+1,`${width}: ${name} 버튼이 화면 안`);}
  let o=await overflow(page);assert.ok(o.sw<=o.w+1&&!o.over.length,`${width}: 첫 화면 가로 넘침 ${JSON.stringify(o)}`);
  await page.screenshot({path:`${dir}/start-${width}.png`});
  // 2. 예시 → 기간별 대조. 「기록 기능 비활성」 안내는 결과마다가 아니라 한 번만
  await page.getByRole('button',{name:'예시 취업규칙으로 해보기'}).click();await page.getByRole('button',{name:'표 복사'}).first().waitFor();
  await page.getByText('기록 기능이 비활성 상태입니다',{exact:false}).first().waitFor();
  assert.equal(await page.getByText('기록 기능이 비활성 상태입니다',{exact:false}).count(),1,`${width}: 비활성 안내는 한 번만`);
  assert.equal(await page.getByRole('button',{name:'관리자 검토기록 저장'}).count(),0,`${width}: 비활성일 때 결과마다 저장 버튼을 붙이지 않는다`);
  // 3. AI 정밀 점검(합성 응답) — 결과에 실행 조건이 붙는다
  await page.getByRole('button',{name:/AI 정밀 점검 실행/}).click();await page.locator('.lr-pc-result').first().waitFor();
  assert.match(await page.locator('.lr-pc-basis').first().innerText(),/점검 시작일 2025\. 01\. 01\./);
  const firstTurnId=await page.locator('.wr-msg.user').first().getAttribute('id');
  // 4. 다음 질문을 보내도 앞 AI 결과가 남고, 그 결과가 앞 입력·기준일로 이어진다
  await page.getByRole('textbox',{name:'취업규칙 본문'}).fill(SECOND);await page.getByRole('button',{name:'점검하기'}).click();
  await page.locator('.wr-msg.user').nth(1).waitFor();
  assert.equal(await page.locator('.lr-pc-result').count(),1,`${width}: 앞 AI 결과가 남아야 한다`);assert.equal(await page.locator('.lr-pc-result').first().isVisible(),true);
  const basis=page.locator('.wr-basis a').first();assert.equal(await basis.getAttribute('href'),'#'+firstTurnId,`${width}: 앞 결과가 앞 입력으로 이어져야 한다`);
  assert.match(await page.locator('.wr-basis').first().innerText(),/예시 취업규칙.*2025\. 1\. 1\. 다음 날부터/);
  assert.equal(await page.getByRole('button',{name:/AI 정밀 점검 실행/}).count(),1,`${width}: 실행 버튼은 마지막 차례에만`);
  assert.equal(await page.getByText('기록 기능이 비활성 상태입니다',{exact:false}).count(),1,`${width}: 두 차례가 쌓여도 비활성 안내는 화면에 한 번`);
  o=await overflow(page);assert.ok(o.sw<=o.w+1&&!o.over.length,`${width}: 결과 화면 가로 넘침 ${JSON.stringify(o)}`);
  await page.locator('.lr-pc-result').first().evaluate(e=>e.closest('.wr-msg').scrollIntoView({block:'start'}));await page.screenshot({path:`${dir}/kept-ai-${width}.png`});
  if(width===390){await page.evaluate(()=>document.documentElement.classList.add('dark'));await page.screenshot({path:`${dir}/kept-ai-390-dark.png`});}
  results.push(`${width}px: 전송 안내 「${ptext}」 · 비활성 안내 1회 · 앞 AI 결과 유지·기준 연결 · 가로 넘침 0`);
  await ctx.close();
}
await browser.close();
assert.deepEqual(errors,[],errors.join('\n'));fs.writeFileSync(`${dir}/browser-results.json`,JSON.stringify({synthetic:true,results},null,2));console.log(results.join('\n'));
