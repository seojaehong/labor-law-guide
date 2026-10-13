import {chromium,expect} from '@playwright/test';
import fs from 'node:fs';import path from 'node:path';
const base=process.env.E01_BASE_URL||'http://127.0.0.1:3180';
const output=path.resolve('test-results/e01-race');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.E01_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const context=await browser.newContext({acceptDownloads:true});
 await context.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
 const page=await context.newPage();let downloads=0;page.on('download',()=>downloads++);
 const click=async name=>page.getByRole('button',{name,exact:true}).click();
 const ready=async()=>{await click('입력 사실로 모의 상담');await click('회사 답변서 목차 제시');await click('현재 목차 명시적 승인');await click('조건부 초안 작성');await click('검토용 문서 출력 명시적 승인');};
 const log=[];
 for(const correction of ['M2 승인휴무 증거 반영','M3a 인원 판단 미확정','사실 저장·이전 승인 무효화']) {
  await page.goto(base+'/ai/workspace',{waitUntil:'networkidle'});await ready();const before=downloads;
  await page.evaluate(name=>{const find=n=>[...document.querySelectorAll('button')].find(b=>b.textContent===n);find('Word 다운로드').click();find('Word 다운로드').click();find(name).click();},correction);
  await expect(page.getByText('출력 도중 사실 또는 승인이 변경됐습니다. 현재 버전을 다시 검토·승인하세요.',{exact:true})).toBeVisible();
  if(downloads!==before)throw Error('stale download '+correction);log.push({race:correction,result:'canceled',downloads:0});
 }
 await page.goto(base+'/ai/workspace',{waitUntil:'networkidle'});await ready();
 await page.getByLabel('회사',{exact:true}).fill('편집중');await expect(page.getByRole('button',{name:'Word 다운로드',exact:true})).toHaveCount(0);log.push({case:'unsaved editing invalidates approval',result:'passed'});
 await page.goto(base+'/ai/workspace',{waitUntil:'networkidle'});await ready();const before=downloads;
 const download=page.waitForEvent('download');await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Word 다운로드');b.click();b.click();b.click();});await download;
 await expect(page.getByRole('button',{name:'Word 다운로드',exact:true})).toBeEnabled();if(downloads!==before+1)throw Error('multiple downloads');log.push({case:'rapid triple click',downloads:1,result:'passed'});
 await click('M2 승인휴무 증거 반영');
 const notice='08-25 정상출근 확인. 현재 불참 주장을 철회한다.';const relief='금전보상만 청구하며 복직은 구하지 않음';
 await page.getByLabel('현재 통지 주장',{exact:true}).fill(notice);await page.getByLabel('근로자 주장·청구',{exact:true}).fill(relief);await page.getByLabel('08-18 현재 불참 주장 상태',{exact:true}).selectOption('excluded');await click('사실 저장·이전 승인 무효화');await ready();
 const body=await page.getByLabel('E01 답변서 초안').innerText();if(!body.includes(notice)||!body.includes(relief)||body.includes('신청취지: 근로자의 복직·임금상당액 청구'))throw Error('fact distortion');
 log.push({case:'M2 current allegation/relief preserved',result:'passed'});
 for(const notice of ['08-18 승인휴무 인정. 08-25 정상출근 확인. 불참 주장을 모두 철회한다.','8월 18일 승인휴무는 불참에서 제외. 08-25 불참만 재검토한다.']) {
  await page.getByLabel('현재 통지 주장',{exact:true}).fill(notice);
  await page.getByLabel('08-18 현재 불참 주장 상태',{exact:true}).selectOption('excluded');
  await click('사실 저장·이전 승인 무효화');await ready();
  if(!(await page.getByLabel('E01 답변서 초안').innerText()).includes(notice))throw Error('valid correction rejected');
 }
 log.push({case:'two valid dated corrections accepted',result:'passed'});
 for(const status of ['alleged','unclear']) {
  await page.getByLabel('현재 통지 주장',{exact:true}).fill('08-18 불참 재주장');
  await page.getByLabel('08-18 현재 불참 주장 상태',{exact:true}).selectOption(status);
  await click('사실 저장·이전 승인 무효화');await click('입력 사실로 모의 상담');await click('회사 답변서 목차 제시');await click('현재 목차 명시적 승인');await click('조건부 초안 작성');
  const message=status==='alleged'?'08-18 승인휴무와 현재 불참 주장이 충돌합니다. 현재 주장 상태와 문구를 확인하고 다시 저장하세요.':'08-18을 현재 불참 주장에 포함하는지 미확정입니다. 현재 불참 주장 상태를 명시적으로 확인하세요.';
  await expect(page.getByText(message,{exact:true})).toBeVisible();
 }
 log.push({case:'structured conflict and unknown show specific cause',result:'passed'});
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(log,null,2));console.log(JSON.stringify(log));await browser.close();
})().catch(e=>{console.error(e.message);process.exit(1)});
