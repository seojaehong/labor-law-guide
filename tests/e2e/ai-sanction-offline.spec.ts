import { test, expect, type Page } from '@playwright/test';
const sse = (events: unknown[]) => events.map(event => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`).join('');
async function isolate(page: Page) {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/faq') return route.fulfill({json:{faqs:[],total:0}});
      if (url.pathname === '/api/chat/situation') return route.fulfill({json:{profile:{}}});
      return route.fulfill({json:{}});
    }
    return route.continue();
  });
}
const card = {id:'id_123',title:'fixture 기밀유출 판정례',decision_result:'인용',holding_points:'fixture 근거',url:'',bucket:'worker_win',source:'nlrc'};
const comparison = {issueSummary:['fixture 쟁점'],workerWinCases:[card],employerWinCases:[],coreDifferences:['fixture 표제 비교'],checklist:['fixture 확인사항'],decisionGuide:[]};
const faqs = Array.from({length:5},(_,i)=>({id:i+1,question:`fixture FAQ ${i+1}`,answer:`fixture 해설 ${i+1}`,source:`fixture 검증 출처 ${i+1}`,category:'징계'}));
async function sanctionSend(page: Page, events: unknown[]) {
  await isolate(page);
  await page.route('**/api/sanction', route => route.fulfill({contentType:'text/event-stream',body:sse(events)}));
  await page.goto('/sanction');
  await page.getByPlaceholder('징계 상황을 설명해 주세요...').fill('기밀유출 징계 절차');
  await page.locator('form button[type=submit]').click();
}
test('sanction shows prose with comparison cards and all five actual FAQ sources', async ({page}) => {
  await sanctionSend(page,[{type:'meta',tags:['기밀유출'],cases:[card],comparison,faqs},{type:'delta',text:'fixture 생성 설명'},{type:'done',content:'fixture 생성 설명 완료',comparison,provider:'offline'}]);
  await expect(page.getByText('fixture 생성 설명 완료',{exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:/fixture 기밀유출 판정례/})).toBeVisible();
  for (let i=1;i<=5;i++) {
    await page.getByText(`fixture FAQ ${i}`,{exact:true}).click();
    await expect(page.getByText(`출처: fixture 검증 출처 ${i}`,{exact:true})).toBeVisible();
  }
  await expect(page.getByText('최영우 교재 · 검토자 FAQ',{exact:true})).toHaveCount(0);
});
test('sanction rejects EOF without done while preserving comparison card', async ({page}) => {
  await sanctionSend(page,[{type:'meta',cases:[card],comparison,faqs:[]},{type:'delta',text:'fixture 부분 설명'}]);
  await expect(page.getByText('응답이 완료되기 전에 연결이 종료되었습니다. 다시 시도해 주세요.').first()).toBeVisible();
  await expect(page.getByRole('link',{name:/fixture 기밀유출 판정례/})).toBeVisible();
  await expect(page.getByText(/fixture 부분 설명/)).toBeVisible();
});
async function aiSend(page: Page, events: unknown[]) {
  await isolate(page);
  await page.route('**/api/chat',route=>route.fulfill({contentType:'text/event-stream',body:sse(events)}));
  await page.goto('/ai');
  await page.getByLabel('노동법에 대한 질문 입력').fill('징계 절차를 알려주세요');
  await page.locator('form button[type=submit]').click();
}
test('ai FAQ citation remains a clickable internal reference', async({page}) => {
  await aiSend(page,[{evidence:[{type:'FAQ',id:'123'}]},{content:'fixture 답변입니다.\n\n---\n참고 FAQ: [FAQ#123]'},'[DONE]']);
  await expect(page.locator('a[href="/faq?id=123"]')).toBeVisible();
});
test('ai shows explicit second-round failure fallback after a long preliminary answer', async({page}) => {
  await aiSend(page,[{content:'fixture 먼저 관련 자료를 살펴보겠습니다. '.repeat(5)},{error:'스트리밍 중 오류가 발생했습니다.'},{content:'⚠️ 요약을 만들지 못했습니다. 위에 찾은 자료를 직접 확인하시거나 잠시 후 다시 시도해주세요.'},'[DONE]']);
  await expect(page.getByText(/⚠️ 요약을 만들지 못했습니다/)).toBeVisible();
});

test('ai shows provider error after partial content', async({page}) => {
  await aiSend(page,[{content:'fixture 부분 답변'},{error:'fixture provider failure'}]);
  await expect(page.getByText(/fixture provider failure/)).toBeVisible();
});
test('ai warns when EOF arrives after partial content without DONE', async({page}) => {
  await aiSend(page,[{content:'fixture 미완료 부분 답변'}]);
  await expect(page.getByText(/요약 전송이 중단되었습니다/)).toBeVisible();
});
test('actual markdown links normalize verified sources and block references/autolinks outside manifest', async({page}) => {
  await aiSend(page,[{evidence:[{type:'FAQ',id:'123'},{type:'COURT',id:'대법원_2023다302838'}]},
    {content:'[정상 FAQ](https://yellowenvelope.kr/faq?id=123) [정상 판례](/cases/대법원_2023다302838)\n\n[허구 참조][source]\n\n[source]: /cases/invented\n\nhttps://yellowenvelope.kr/faq?id=999'},'[DONE]']);
  await expect(page.getByRole('link',{name:'정상 FAQ'})).toHaveAttribute('href','/faq?id=123');
  await expect(page.getByRole('link',{name:'정상 판례'})).toHaveAttribute('href',`/cases/${encodeURIComponent('대법원_2023다302838')}`);
  await expect(page.getByRole('link',{name:'허구 참조'})).toHaveCount(0);
  await expect(page.locator('a[href*="invented"],a[href*="id=999"]')).toHaveCount(0);
});
// 261112 — /ai 는 「근거 자료 찾기」. 자료 목록이 요약보다 위에 있고, 개인 사정(situation) API 는 부르지 않는다.
test('ai lists found sources above the labelled summary and never calls the situation API', async({page}) => {
  const situationCalls: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/chat/situation')) situationCalls.push(request.url()); });
  await page.addInitScript(()=>localStorage.setItem('yebot_session_id','offline_existing_session'));
  await aiSend(page,[{evidence:[{type:'FAQ',id:'123'}],sources:[
    {type:'LAW',id:'근로기준법 제60조',title:'fixture 근로기준법 제60조',href:'https://www.law.go.kr/법령/근로기준법/제60조'},
    {type:'FAQ',id:'123',title:'fixture 연차 FAQ',href:'/faq?id=123'},
    {type:'BLOG',id:'leave',title:'fixture 연차 해설 글',href:'/blog/leave'}]},
    {content:'fixture 요약 본문 [FAQ#123]'},'[DONE]']);
  await expect(page.getByRole('heading',{name:'찾은 자료'})).toBeVisible();
  await expect(page.getByRole('link',{name:'fixture 연차 FAQ'})).toHaveAttribute('href','/faq?id=123');
  await expect(page.getByRole('link',{name:/fixture 근로기준법 제60조/})).toHaveAttribute('target','_blank');
  await expect(page.getByRole('heading',{name:'자료 요약(참고)'})).toBeVisible();
  await expect(page.getByText(/fixture 요약 본문/)).toBeVisible();
  const sourcesTop = (await page.getByRole('heading',{name:'찾은 자료'}).boundingBox())!.y;
  const summaryTop = (await page.getByRole('heading',{name:'자료 요약(참고)'}).boundingBox())!.y;
  expect(sourcesTop).toBeLessThan(summaryTop);
  await expect(page.locator('.layout-tool').getByText(/상담|자문/)).toHaveCount(0);
  await page.waitForTimeout(1600);
  expect(situationCalls).toEqual([]);
});
test('sanction issue evidence links only to cases in its displayed manifest', async({page}) => {
  const compared={...comparison,issueEvidence:[{key:'procedure',label:'절차를 지켰나',caseIds:['id_123','unverified']}]};
  await sanctionSend(page,[{type:'meta',cases:[card],comparison:compared,faqs:[]},{type:'done',content:'fixture 확인된 쟁점 설명',comparison:compared}]);
  await expect(page.getByRole('link',{name:'절차를 지켰나 근거 판정례: fixture 기밀유출 판정례',exact:true})).toBeVisible();
  await expect(page.locator('a[href*="unverified"]')).toHaveCount(0);
});
