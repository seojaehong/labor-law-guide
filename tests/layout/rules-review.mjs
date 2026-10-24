// 규정 정비 점검 드라이런 — 예시 규정(합성)으로 올리기 → 확인 → 부서 의견 왕복 → 결재 묶음까지 화면으로 본다.
// VISUAL_BASE_URL=http://127.0.0.1:3127 node tests/layout/rules-review.mjs
// RR_REAL_DIR=<실제 규정 폴더> 를 주면 그 폴더도 올려 화면만 찍는다(스크린샷은 RR_REAL_OUT 에, 저장소에는 넣지 않는다).
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {chromium} from '@playwright/test';
import JSZip from 'jszip';import ExcelJS from 'exceljs';
const base=process.env.VISUAL_BASE_URL || 'http://127.0.0.1:3127',out='docs/design-visuals/rules-review';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});const checks=[];
const FORBIDDEN=['진단','자문','판정','노무사','적법','위반입니다','확률','undefined','NaN'];
const overflow=page=>page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
const open=async(width)=>{const ctx=await browser.newContext({viewport:{width,height:900},acceptDownloads:true});const page=await ctx.newPage();const errors=[];
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('pageerror',e=>errors.push(String(e)));
  const res=await page.goto(base+'/tools/rules-review');assert(res&&res.ok(),'/tools/rules-review 응답 '+(res&&res.status()));
  // 스크린샷은 캐럿을 숨기려고 입력칸에 style 을 넣는다 — 하이드레이션이 끝나기 전에 찍으면 불일치 경고가 난다
  await page.waitForLoadState('networkidle');return {ctx,page,errors};};
const save=async(page,dl)=>{const p=path.join(out,'_dl_'+dl.suggestedFilename());await dl.saveAs(p);return p;};

// ── 1. 넓은 화면: 예시 규정 전 과정 ──
let {ctx,page,errors}=await open(1280);
await page.screenshot({path:`${out}/1280-start.png`,fullPage:true});
await page.getByRole('button',{name:'예시 규정으로 먼저 보기'}).click();
await page.getByRole('heading',{name:/규정 5개를 읽었습니다/}).waitFor({timeout:60000});checks.push('예시 규정 5개 읽음');
await page.screenshot({path:`${out}/1280-read.png`,fullPage:true});
await page.getByRole('button',{name:/확인 시작/}).click();
const cards=page.locator('article.rr-item');await cards.first().waitFor();
const total=await cards.count();assert(total>=10,'항목 수 '+total);checks.push(`확인 작업대 항목 ${total}건 표시`);
for(const k of ['없는 조문 인용','삭제된 조문 인용','규정 이름 표기 다름','항 번호 글자 다름','조 번호 빠짐·겹침','같은 용어 다른 정의','규정·세칙 기준 차이','알기 쉬운 표현']){
  assert(await page.locator('.rr-kind',{hasText:k}).count()>0,'심은 결함 종류가 화면에 없음: '+k);}
checks.push('심은 결함 8종이 화면에 보임');
await page.screenshot({path:`${out}/1280-bench.png`,fullPage:false});
// 키보드: 첫 항목에서 1(반영) → 미확인 목록에서 빠진다
const before=await cards.count();await cards.first().focus();await page.keyboard.press('1');
await page.waitForFunction(n=>document.querySelectorAll('article.rr-item').length===n-1,before);checks.push('키보드 1 → 반영, 미확인 목록에서 빠짐');
// 종류별로 묶어 「용어·문장」 일괄 반영(두 번 눌러야 적용)
await page.getByRole('radio',{name:'종류별'}).click();
await page.locator('.rr-nav-list button',{hasText:'용어·문장'}).click();
const bulk=page.getByRole('button',{name:/고칠 문안 있는 \d+건 반영/});
if(await bulk.count()){await bulk.click();await page.getByRole('button',{name:/한 번 더 누르면/}).click();checks.push('종류별 일괄 반영(두 번 눌러 적용)');}
// 사유 없는 보류 하나, 직접 고칠 곳 하나
await page.getByRole('radio',{name:'규정별'}).click();await page.locator('.rr-nav-list button',{hasText:'전체'}).click();
const hold=cards.first();await hold.getByRole('button',{name:'보류'}).click();
await page.screenshot({path:`${out}/1280-bench-after.png`,fullPage:false});
// ── 부서 의견 ──
await page.getByRole('tab',{name:/부서 의견/}).click();
await page.getByRole('heading',{name:'소관 부서 의견'}).waitFor();
const insaRow=page.getByLabel('직원 인사 규정 소관 부서');assert.equal(await insaRow.inputValue(),'인사팀','본문의 「소관부서」가 기본값이어야 함');checks.push('본문 「소관부서 : 인사팀」을 기본값으로 읽음');
await page.screenshot({path:`${out}/1280-dept.png`,fullPage:true});
const card=page.locator('.rr-card',{hasText:'인사팀'});
const [dl]=await Promise.all([page.waitForEvent('download'),card.getByRole('button',{name:'의견 요청 엑셀'}).click()]);
const reqPath=await save(page,dl);
const book=new ExcelJS.Workbook();await book.xlsx.readFile(reqPath);const sh=book.getWorksheet('의견 요청');
const asked=sh.rowCount-1;assert(asked>=1,'의견 요청 항목 0');sh.getCell('G2').value='반대';sh.getCell('H2').value='현행 유지가 맞습니다';sh.getCell('I2').value='김담당';
const replyPath=path.join(out,'_dl_회신.xlsx');await book.xlsx.writeFile(replyPath);
await page.locator('input[type=file][accept=".xlsx"]').setInputFiles(replyPath);
await page.getByText(/의견 1건을 붙였습니다/).waitFor({timeout:20000}).catch(async e=>{throw new Error('회신 붙이기 결과: '+(await page.locator('.rr-panel [role=status], .rr-panel [role=alert], .rr-error').allInnerTexts()).join(' | ')+' / '+e.message);});checks.push(`부서 의견 요청 엑셀 ${asked}건 → 회신 반대 1건이 항목에 붙음`);
assert(await page.getByRole('tab',{name:/부서 의견/}).locator('em.warn').count()===1,'이견 표시가 탭에 없음');checks.push('조율 전 이견이 탭에 표시됨');
// 확인 탭 「이견」에서 조율 결과 적기
await page.getByRole('tab',{name:/확인/}).click();await page.getByRole('radio',{name:/^이견/}).click();
await page.getByLabel('조율 결과').fill('인사팀과 협의 — 다음 개정 때 함께 반영');checks.push('이견 항목에 조율 결과 입력');
// ── 조문 고치기: 점검 항목 없이 담당자가 조문을 고친다 ──
await page.getByRole('tab',{name:'조문 고치기'}).click();
await page.locator('.rr-am-nav .rr-nav-list button').first().click();
const amTa=page.locator('.rr-am-line textarea').first();await amTa.fill((await amTa.inputValue())+' 다만, 총장이 따로 정할 수 있다.');
await page.getByLabel(/고친 사유/).fill('위원회 운영 보완');
assert.equal(await page.locator('.rr-am-line.on').count(),1,'고친 줄 표시 없음');
await page.screenshot({path:`${out}/1280-amend.png`,fullPage:true});checks.push('조문 고치기 — 고친 줄 표시·사유 입력');
// ── 결재 묶음 ──
await page.getByRole('tab',{name:'결재 묶음'}).click();
await page.locator('input[type=date]').fill('2026-03-01');
await page.screenshot({path:`${out}/1280-bundle.png`,fullPage:true});
const [d2]=await Promise.all([page.waitForEvent('download'),page.locator('.rr-out',{hasText:'신·구조문대비표(docx)'}).getByRole('button').click()]);
const docx=await JSZip.loadAsync(fs.readFileSync(await save(page,d2)));const xml=await docx.file('word/document.xml').async('string');
const plain=xml.replace(/<w:br\/>/g,'\n').replace(/<[^>]+>/g,'');
assert(plain.includes('신·구조문대비표'));assert(plain.includes('&lt;개정 2026. 3. 1.&gt;')||plain.includes('<개정 2026. 3. 1.>'),'개정 표시 없음');
assert(plain.includes('이 규정은 2026년 3월 1일부터 시행한다.'));assert(plain.includes('사유 미기재'),'사유 없는 보류 표시 없음');assert(plain.includes('인사팀과 협의'),'조율 결과 없음');assert(plain.includes('총장이 따로 정할 수 있다')&&plain.includes('위원회 운영 보완'),'직접 고친 조문이 대비표에 없음');
for(const w of ['진단','자문','판정','노무사'])assert(!plain.includes(w),'결재 묶음 금지어: '+w);
checks.push('신·구조문대비표 docx — 개정 표시·부칙 시행일·사유 미기재 보류·조율 결과·직접 고친 조문 실림, 금지어 0');
const [d3]=await Promise.all([page.waitForEvent('download'),page.locator('.rr-out',{hasText:'정비 검토표'}).getByRole('button').click()]);
const rb=new ExcelJS.Workbook();await rb.xlsx.readFile(await save(page,d3));assert.equal(rb.getWorksheet('정비 검토표').rowCount-1,total+1,'검토표 행 수가 항목 수와 다름');checks.push(`정비 검토표 xlsx ${total+1}행 = 항목 수(직접 고친 조문 포함)`);
const body=await page.locator('main.rr').innerText();for(const w of FORBIDDEN)assert(!body.includes(w),'화면 금지어·내부 값: '+w);checks.push('화면 금지어·내부 값 0');
// 다시 열면 이어서 하기 — 사람이 잠깐 멈춘 것처럼 자동 저장(0.5초) 뒤에 새로 고친다
await page.waitForTimeout(1200);
await page.reload();await page.getByRole('button',{name:'이어서 하기'}).waitFor({timeout:15000});checks.push('새로고침 → 「이어서 하기」로 작업 복원 제안');
await page.getByRole('button',{name:'이어서 하기'}).click();await page.getByRole('tab',{name:'결재 묶음'}).click();
assert.equal(await page.locator('input[type=date]').inputValue(),'2026-03-01','복원 후 시행일이 남아 있어야 함');checks.push('복원 후 시행일·결정 유지');
assert.deepEqual(errors,[]);checks.push('콘솔 오류 0 (1280)');
await ctx.close();

// ── 2. 좁은 화면(390) ──
({ctx,page,errors}=await open(390));
assert.equal(await overflow(page),0,'390 시작 화면 가로 넘침');
await page.screenshot({path:`${out}/390-start.png`,fullPage:true});
const reset=page.getByRole('button',{name:'지우고 새로 시작'});if(await reset.count())await reset.click();
await page.getByRole('button',{name:'예시 규정으로 먼저 보기'}).click();
await page.getByRole('button',{name:/확인 시작/}).click();await page.locator('article.rr-item').first().waitFor();
assert.equal(await overflow(page),0,'390 작업대 가로 넘침');
await page.screenshot({path:`${out}/390-bench.png`,fullPage:false});
await page.getByRole('tab',{name:'조문 고치기'}).click();await page.locator('.rr-am-nav select.rr-nav-select').selectOption({index:1});await page.locator('.rr-am-line textarea').first().waitFor();assert.equal(await overflow(page),0,'390 조문 고치기 가로 넘침');
await page.screenshot({path:`${out}/390-amend.png`,fullPage:true});
await page.getByRole('tab',{name:'결재 묶음'}).click();assert.equal(await overflow(page),0,'390 결재 묶음 가로 넘침');
await page.screenshot({path:`${out}/390-bundle.png`,fullPage:true});
checks.push('390px 시작·작업대·조문 고치기·결재 묶음 가로 넘침 0');
assert.deepEqual(errors,[]);checks.push('콘솔 오류 0 (390)');
await ctx.close();

// ── 3. 실제 규정 폴더(선택) ──
if(process.env.RR_REAL_DIR){
  const realOut=process.env.RR_REAL_OUT||out;const walk=d=>fs.readdirSync(d).flatMap(n=>fs.statSync(path.join(d,n)).isDirectory()?walk(path.join(d,n)):[path.join(d,n)]);
  ({ctx,page,errors}=await open(1280));
  const reset2=page.getByRole('button',{name:'지우고 새로 시작'});if(await reset2.count())await reset2.click();
  const t0=Date.now();await page.locator('input[type=file][accept^=".zip"]').setInputFiles(walk(process.env.RR_REAL_DIR));
  await page.getByRole('heading',{name:/규정 \d+개를 읽었습니다/}).waitFor({timeout:180000});
  checks.push(`실제 규정 폴더 읽기 ${((Date.now()-t0)/1000).toFixed(1)}초 — `+(await page.getByRole('heading',{name:/읽었습니다/}).innerText()));
  await page.screenshot({path:`${realOut}/real-1280-read.png`,fullPage:true});
  await page.getByRole('button',{name:/확인 시작/}).click();await page.locator('article.rr-item').first().waitFor();
  await page.screenshot({path:`${realOut}/real-1280-bench.png`,fullPage:false});
  assert.deepEqual(errors,[]);checks.push('실제 규정 — 콘솔 오류 0');await ctx.close();
}
for(const f of fs.readdirSync(out))if(f.startsWith('_dl_'))fs.rmSync(path.join(out,f));
fs.writeFileSync(out+'/result.json',JSON.stringify({synthetic:true,base,checks},null,2));await browser.close();console.log(JSON.stringify(checks,null,1));
