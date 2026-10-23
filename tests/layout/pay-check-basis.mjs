// 월급 대조(#74) 운영 드라이런 — 계산 기준 문서 확인 두 분기와 주휴일 미지정 확인을 합성 값으로 본다.
// VISUAL_BASE_URL=https://yellowenvelope.kr node tests/layout/pay-check-basis.mjs
import fs from 'node:fs';import assert from 'node:assert/strict';import {chromium} from '@playwright/test';
const base=process.env.VISUAL_BASE_URL || 'http://127.0.0.1:3126',out='docs/design-visuals/pay-check-basis';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});const checks=[];
const FORBIDDEN=['확률','적중률','노무사','적법','BASIS_NOT_DOCUMENTED','WEEKLY_HOLIDAY_NOT_DESIGNATED','FACT_MISSING','NEEDS_CONFIRMATION'];
const VALUES={'평균 기간의 약정 소정근로시간 합계':'60','평균을 낸 주수':'4','명세서 주휴 금액':'30000','확정 시급':'10000','같은 기간 통상 근로자의 소정근로일수':'20','명세서 주휴 항목이 몇 주분인지':'1'};
async function run(width,{designated,documented}){
  const ctx=await browser.newContext({viewport:{width,height:844}});const page=await ctx.newPage();const errors=[];
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('pageerror',e=>errors.push(String(e)));
  const res=await page.goto(base+'/tools/pay-check');assert(res&&res.ok(),'/tools/pay-check 응답 '+(res&&res.status()));
  await page.getByRole('button',{name:/시급제·주휴/}).click();
  const group=label=>page.getByRole('group',{name:label});
  await group('그 주 7일 동안 계약이 이어졌는지').getByRole('button').first().click();
  await group('주휴일 지정').getByRole('button',{name:designated?'계약·규칙에 지정됨':'지정되지 않음을 확인함'}).click();
  await group('그 주 소정근로일 개근').getByRole('button').first().click();
  await page.getByRole('button',{name:/주휴 고정 스케줄/}).click();
  await group('계산 기준 문서 확인').getByRole('button',{name:documented?'문서에서 확인함':'문서는 확인하지 못함'}).click();
  for(const [label,v] of Object.entries(VALUES))await page.getByLabel(label,{exact:false}).first().fill(v);
  const card=page.getByRole('region',{name:'대조 결과'});await card.waitFor();
  const text=await card.innerText();const all=await page.locator('body').innerText();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  await page.screenshot({path:`${out}/${width}-${designated?'designated':'undesignated'}-${documented?'doc':'nodoc'}.png`,fullPage:true});
  await ctx.close();
  return {text,all,overflow,errors};
}
// 1) 기준을 문서에서 확인 · 주휴일 지정 → 대조 일치, 남은 확인 없음
let r=await run(390,{designated:true,documented:true});
assert(r.text.includes('대조 일치'),r.text);assert(r.text.includes('확인한 기준으로 계산'));assert(r.text.includes('30,000원'));
assert(!r.text.includes('확인되지 않은 채 남은 것'),'문서 확인 분기에 남은 확인 상자가 보임');checks.push('기준 문서 확인함 → 대조 일치 30,000원, 남은 확인 없음');
// 2) 기준을 문서에서 확인하지 못함 → 참고 계산 + 「계산 기준 문서 미확인」
r=await run(390,{designated:true,documented:false});
assert(r.text.includes('고른 기준으로 참고 계산'),r.text);assert(r.text.includes('확인되지 않은 채 남은 것'));assert(r.text.includes('계산 기준 문서 미확인'));
assert(!r.text.includes('확인한 기준으로 계산'));checks.push('기준 문서 미확인 → 참고 계산 표시와 「계산 기준 문서 미확인」');
// 3) 주휴일 지정되지 않음을 확인 → 금액은 대조하되 「주휴일 확인 필요」 (360px 모바일)
r=await run(360,{designated:false,documented:true});
assert(r.text.includes('30,000원'),r.text);assert(r.text.includes('주휴일 확인 필요'));checks.push('주휴일 미지정 → 금액 대조 유지 + 「주휴일 확인 필요」');
assert.equal(r.overflow,0,'360px 가로 넘침 '+r.overflow+'px');checks.push('360px 가로 넘침 0');
for(const w of FORBIDDEN)assert(!r.all.includes(w),'금지어·내부 코드 노출: '+w);checks.push('금지어·내부 코드 0');
assert.deepEqual(r.errors,[]);checks.push('콘솔 오류 0');
fs.writeFileSync(out+'/result.json',JSON.stringify({synthetic:true,base,checks},null,2));await browser.close();console.log(JSON.stringify(checks));
