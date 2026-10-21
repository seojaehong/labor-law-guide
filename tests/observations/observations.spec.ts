import {test,expect} from '@playwright/test';
import catalog from '../../scripts/laws/work_rules_map.json';
import {observationId} from '../../src/lib/laws/observation-payload';
import standard from '../../public/data/laws/standard.json';
import {MATCHER_VERSION,RULE_VERSION} from '../../src/lib/laws/observation-version';
const sample='제1조(휴게) 회사명 SENSITIVE_EMPLOYER_MARKER. 회사는 근로시간이 4시간인 경우에는 30분 이상, 8시간인 경우에는 1시간 이상의 휴게시간을 근로시간 도중에 준다.\n제2조(육아휴직) 근로자가 만 8세 이하 자녀를 양육하는 경우 육아휴직을 허용한다.';
const r=catalog.rules[0];
const payload={id:'',run_id:'22222222-2222-4222-8222-222222222222',period_from:'20250101',period_to:'20261013',standard_article_id:standard.articles[0].id,rule_id:`${r.lawId}:${r.article}:${r.effective}`,candidate_clause_ids:['제1조'],selected_clause_ids:['제1조'],verdict:'반영됨',reason:'period_check_output',missing_count:0,stale_count:0,user_false_positive:true,matcher_version:MATCHER_VERSION,rule_version:RULE_VERSION};
test.beforeEach(async({page})=>{await page.route('**/api/admin/work-rule-observations?readiness=1',route=>route.fulfill({json:{active:true}}));});
test.beforeAll(async()=>{payload.id=await observationId(payload,payload.standard_article_id,payload.rule_id);});
test('all unauthenticated API methods are denied; configured admin sees disabled',async({request})=>{
 for(const method of ['GET','POST','PATCH']){
  const res=await request.fetch('/api/admin/work-rule-observations',{method,data:method==='GET'?undefined:payload});expect(res.status()).toBe(401);
 }
 const res=await request.get('/api/admin/work-rule-observations',{headers:{'x-admin-token':'local-test-admin'}});expect(res.status()).toBe(503);expect(await res.json()).toMatchObject({active:false,error:'observations_unavailable'});
 const write=await request.post('/api/admin/work-rule-observations',{headers:{'x-admin-token':'local-test-admin'},data:payload});expect(write.status()).toBe(503);
 const change=await request.patch('/api/admin/work-rule-observations',{headers:{'x-admin-token':'local-test-admin'},data:{id:payload.id,review_state:'expected'}});expect(change.status()).toBe(503);
});
test('nonadmin inspection has no recording button or outgoing observation',async({page})=>{
 let posts=0;page.on('request',r=>{if(r.url().includes('work-rule-observations')&&r.method()==='POST')posts++;});
 await page.goto('/tools/work-rules');await page.getByRole('button',{name:'취업규칙 입력·점검'}).click();await page.getByRole('dialog').locator('textarea').fill(sample);
 await expect(page.getByRole('button',{name:'관리자 검토기록 저장'})).toHaveCount(0);expect(posts).toBe(0);
});
test('disabled admin view makes no collecting/saved claim',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('admin_token','local-test-admin'));
 await page.goto('/admin/work-rule-observations');await page.getByRole('button',{name:'저장 기록 조회'}).click();await expect(page.getByRole('status')).toContainText('기록 기능이 준비되지 않았습니다');await expect(page.getByText('검토 상태 저장 확인됨')).toHaveCount(0);
});
test('failure stays unsaved, retry reuses id, confirmed save disables repeat, no original text leaves browser',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('admin_token','local-test-admin'));
 const sent:Array<Record<string,unknown>>=[];
 await page.route('**/api/admin/work-rule-observations',async route=>{const body=route.request().postDataJSON();sent.push(body);await route.fulfill({status:sent.length===1?503:201,json:sent.length===1?{active:false,error:'observations_unavailable'}:{record:body,active:true}});});
 await page.goto('/tools/work-rules');await page.getByRole('button',{name:'취업규칙 입력·점검'}).click();await page.getByRole('dialog').locator('textarea').fill(sample);
 const button=page.getByRole('button',{name:'관리자 검토기록 저장'}).first();await expect(button).toBeVisible();await page.getByLabel('오탐 의심 표시').first().check();await button.click();await expect(page.getByText('저장 확인에 실패했습니다. 같은 실행의 재시도는 최초 기록 내용으로 진행됩니다.').first()).toBeVisible();await expect(button).toBeEnabled();
 await expect(page.getByLabel('오탐 의심 표시').first()).toBeDisabled();await button.click();await expect(page.getByText('기록 저장 확인됨').first()).toBeVisible();await expect(button).toBeDisabled();
 expect(sent).toHaveLength(2);expect(sent[0]).toEqual(sent[1]);expect(sent[1].user_false_positive).toBe(true);expect(JSON.stringify(sent)).not.toContain('SENSITIVE_EMPLOYER_MARKER');expect(JSON.stringify(sent)).not.toContain('근로시간');expect(Object.keys(sent[0]).sort()).toEqual(Object.keys(payload).sort());
});
test('administrator can read metadata and confirm review changes without submitting text',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('admin_token','local-test-admin'));
 let changed:Record<string,unknown>|null=null;
 const row={...payload,created_at:'2026-10-13T00:00:00Z',review_state:'unreviewed'};
 await page.route('**/api/admin/work-rule-observations',async route=>{
  if(route.request().method()==='PATCH'){
   changed=route.request().postDataJSON();await route.fulfill({json:{record:{...row,review_state:'confirmed_false_positive'}}});
  }else await route.fulfill({json:{records:[row],active:true}});
 });
 await page.goto('/admin/work-rule-observations');await page.getByRole('button',{name:'저장 기록 조회'}).click();await expect(page.getByRole('status')).toContainText('저장 기록 1건 조회됨');
 await page.getByRole('combobox').selectOption('confirmed_false_positive');await expect(page.getByRole('status')).toContainText('검토 상태 저장 확인됨');expect(changed).toEqual({id:payload.id,review_state:'confirmed_false_positive'});
});
for (const change of ['document', 'from', 'to', 'new_run'] as const) {
 test(`new ${change} creates a new execution even with identical verdict metadata`, async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('admin_token','local-test-admin'));
  const sent:Array<Record<string,unknown>>=[];
  await page.route('**/api/admin/work-rule-observations',async route=>{
   const body=route.request().postDataJSON();sent.push(body);
   await route.fulfill({status:201,json:{record:body,active:true}});
  });
  await page.goto('/tools/work-rules');await page.getByRole('button',{name:'취업규칙 입력·점검'}).click();
  const dialog=page.getByRole('dialog');await dialog.locator('textarea').fill(sample);
  await dialog.getByRole('button',{name:'관리자 검토기록 저장'}).first().click();
  await expect(dialog.getByText('기록 저장 확인됨').first()).toBeVisible();
  if(change==='document')await dialog.locator('textarea').fill(sample+'\nPRIVATE_SECOND_INPUT_MARKER');
  if(change==='from')await page.getByLabel('내 취업규칙 최종 개정일').fill('2025-01-02');
  if(change==='to')await page.getByLabel('기준일',{exact:true}).fill('2026-10-14');
  if(change==='new_run')await dialog.getByRole('button',{name:'새 점검 실행'}).click();
  const button=dialog.getByRole('button',{name:'관리자 검토기록 저장'}).first();
  await expect(dialog.getByText('기록 저장 확인됨')).toHaveCount(0);await expect(button).toBeEnabled();
  await button.click();await expect(dialog.getByText('기록 저장 확인됨').first()).toBeVisible();
  expect(sent).toHaveLength(2);expect(sent[0].id).not.toBe(sent[1].id);expect(sent[0].run_id).not.toBe(sent[1].run_id);
  for(const field of ['rule_id','standard_article_id','verdict','missing_count','stale_count','candidate_clause_ids','selected_clause_ids'])expect(sent[0][field]).toEqual(sent[1][field]);
  expect(JSON.stringify(sent)).not.toContain('PRIVATE_SECOND_INPUT_MARKER');expect(JSON.stringify(sent)).not.toContain('SENSITIVE_EMPLOYER_MARKER');
 });
}
test('late success for an old input cannot mark the new execution saved',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('admin_token','local-test-admin'));
 let release:(()=>Promise<void>)|undefined;const sent:Array<Record<string,unknown>>=[];
 await page.route('**/api/admin/work-rule-observations',async route=>{
  const body=route.request().postDataJSON();sent.push(body);
  if(sent.length===1)release=async()=>{await route.fulfill({status:201,json:{record:body}});};
  else await route.fulfill({status:201,json:{record:body}});
 });
 await page.goto('/tools/work-rules');await page.getByRole('button',{name:'취업규칙 입력·점검'}).click();const dialog=page.getByRole('dialog');await dialog.locator('textarea').fill(sample);
 await dialog.getByRole('button',{name:'관리자 검토기록 저장'}).first().click();await expect.poll(()=>sent.length).toBe(1);
 await dialog.locator('textarea').fill(sample+'\nPRIVATE_NEW_INPUT_MARKER');await release!();
 await expect(dialog.getByText('기록 저장 확인됨')).toHaveCount(0);
 await dialog.getByRole('button',{name:'관리자 검토기록 저장'}).first().click();await expect(dialog.getByText('기록 저장 확인됨').first()).toBeVisible();
 expect(sent[0].run_id).not.toBe(sent[1].run_id);expect(sent[0].id).not.toBe(sent[1].id);
});
test('mismatched server readback cannot produce a saved marker',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('admin_token','local-test-admin'));
 await page.route('**/api/admin/work-rule-observations',async route=>{const body=route.request().postDataJSON();await route.fulfill({status:201,json:{record:{...body,user_false_positive:!body.user_false_positive}}});});
 await page.goto('/tools/work-rules');await page.getByRole('button',{name:'취업규칙 입력·점검'}).click();const dialog=page.getByRole('dialog');await dialog.locator('textarea').fill(sample);
 await dialog.getByRole('button',{name:'관리자 검토기록 저장'}).first().click();await expect(dialog.getByText('저장 확인에 실패했습니다. 같은 실행의 재시도는 최초 기록 내용으로 진행됩니다.').first()).toBeVisible();await expect(dialog.getByText('기록 저장 확인됨')).toHaveCount(0);
});
test('invalid equal-day period has explicit guidance and cannot record',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('admin_token','local-test-admin'));
 await page.goto('/tools/work-rules');await page.getByRole('button',{name:'취업규칙 입력·점검'}).click();const dialog=page.getByRole('dialog');await dialog.locator('textarea').fill(sample);
 await page.getByLabel('내 취업규칙 최종 개정일').fill('2026-10-13');await page.getByLabel('기준일',{exact:true}).fill('2026-10-13');
 await expect(page.getByText('점검 시작일은 기준일보다 빨라야 합니다. 기간을 수정하면 기록할 수 있습니다.')).toBeVisible();await expect(dialog.getByRole('button',{name:'관리자 검토기록 저장'})).toHaveCount(0);
});
test('same-execution remount preserves frozen payload and false-positive flag',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('admin_token','local-test-admin'));
 const sent:Array<Record<string,unknown>>=[];
 await page.route('**/api/admin/work-rule-observations',async route=>{const body=route.request().postDataJSON();sent.push(body);await route.fulfill({status:sent.length===1?503:201,json:sent.length===1?{active:false}:{record:body}});});
 await page.goto('/tools/work-rules');await page.getByRole('button',{name:'취업규칙 입력·점검'}).click();const dialog=page.getByRole('dialog');await dialog.locator('textarea').fill(standard.articles.map(a=>a.text).join('\n'));
 await dialog.getByRole('button',{name:/문구가 일치한 \d+건 보기/}).click();
 const card=dialog.locator('.lr-verdict.ok').first();await card.getByLabel('오탐 의심 표시').first().check();await card.getByRole('button',{name:'관리자 검토기록 저장'}).first().click();
 await expect(card.getByText('저장 확인에 실패했습니다. 같은 실행의 재시도는 최초 기록 내용으로 진행됩니다.').first()).toBeVisible();
 await dialog.getByRole('button',{name:'문구가 일치한 항목 접기'}).click();await dialog.getByRole('button',{name:/문구가 일치한 \d+건 보기/}).click();
 await expect(card.getByLabel('오탐 의심 표시').first()).toBeChecked();await expect(card.getByLabel('오탐 의심 표시').first()).toBeDisabled();await card.getByRole('button',{name:'관리자 검토기록 저장'}).first().click();await expect(card.getByText('기록 저장 확인됨').first()).toBeVisible();expect(sent).toHaveLength(2);expect(sent[0]).toEqual(sent[1]);
});

test('real disabled readiness keeps recording unavailable without any POST',async({page})=>{
 await page.unroute('**/api/admin/work-rule-observations?readiness=1');
 await page.addInitScript(()=>localStorage.setItem('admin_token','local-test-admin'));
 let posts=0;page.on('request',r=>{if(r.url().includes('work-rule-observations')&&r.method()==='POST')posts++;});
 await page.goto('/tools/work-rules');await page.getByRole('button',{name:'취업규칙 입력·점검'}).click();const dialog=page.getByRole('dialog');await dialog.locator('textarea').fill(sample);
 await expect(dialog.getByText('기록 기능이 비활성 상태입니다. 점검 결과는 이 브라우저에서 확인할 수 있습니다.').first()).toBeVisible();await expect(dialog.getByRole('button',{name:'관리자 검토기록 저장'}).first()).toBeDisabled();await expect(dialog.getByLabel('오탐 의심 표시')).toHaveCount(0);expect(posts).toBe(0);
});
