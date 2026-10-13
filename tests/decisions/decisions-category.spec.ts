import { expect, test } from '@playwright/test';
import { REASON_LABELS } from '../../src/lib/types';
const rows = 'main li a[href^="/decisions/fixture-"]';
test.beforeEach(async ({ request }) => { await request.get('http://127.0.0.1:4319/control?fail=0'); });
test('cards, pagination, history, all enums, form reset and metadata', async ({page}) => {
  await page.goto('/decisions');
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content','index, follow');
  const card=page.locator('main a[href="/decisions?reason=no_dismissal"]');
  await expect(card).toContainText('45건');
  await card.click();
  await expect(page).toHaveURL(/reason=no_dismissal$/);
  await expect(page.getByRole('heading',{name:'해고부존재/사직 유형별 노동위 판정례'})).toBeVisible();
  await expect(page.locator(rows)).toHaveCount(20);
  const first=await page.locator(rows).evaluateAll(els=>els.map(e=>e.getAttribute('href')));
  await page.getByRole('link',{name:'다음 →',exact:true}).click();
  await expect(page).toHaveURL(/reason=no_dismissal&page=2$/);
  const second=await page.locator(rows).evaluateAll(els=>els.map(e=>e.getAttribute('href')));
  expect(second).toHaveLength(20);expect(second.filter(x=>first.includes(x))).toEqual([]);
  await page.goBack();await expect(page).toHaveURL(/reason=no_dismissal$/);
  await page.goForward();await expect(page).toHaveURL(/page=2$/);
  await page.getByRole('link',{name:'다음 →',exact:true}).click();
  await expect(page.locator(rows)).toHaveCount(5);
  for(const [reason,label] of Object.entries(REASON_LABELS)) {
    await page.goto(`/decisions?reason=${reason}`);
    await expect(page.getByRole('heading',{name:`${label} 유형별 노동위 판정례`})).toBeVisible();
    await expect(page.locator(rows)).toHaveCount(20);
    await expect(page.locator('meta[name=robots]')).toHaveAttribute('content','noindex, follow');
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href',/\/decisions$/);
  }
  for (const width of [360,375]) {
    await page.setViewportSize({width,height:800});
    for (const dark of [false,true]) {
      await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
    }
  }
  await page.getByRole('searchbox').fill('성희롱');
  await page.getByRole('button',{name:'검색',exact:true}).click();
  await expect(page).not.toHaveURL(/reason=|page=/);
  await expect(page.locator(rows)).toHaveCount(20);
  await page.goto('/decisions?q=성희롱&tab=cases');
  await expect(page.locator('main li a[href^="/cases/"]')).toHaveCount(20);
  await page.goto('/decisions?q=성희롱&tab=admin');
  await expect(page.locator('main li a[href^="/interpretations/"]')).toHaveCount(20);
});
test('invalid, unsupported, empty, errors and retry', async ({page,request}) => {
  await page.goto('/decisions?reason=constructor');await expect(page.getByText('지원하지 않는 유형입니다.')).toBeVisible();
  await page.goto('/decisions?reason=no_dismissal&q=해고');await expect(page.getByText('유형과 키워드 또는 다른 자료 종류를 함께 지정할 수 없습니다.')).toBeVisible();
  await page.goto('/decisions?reason=no_dismissal&page=99');await expect(page.getByText('이 페이지에 결과가 없습니다.')).toBeVisible();
  await request.get('http://127.0.0.1:4319/control?fail=1');
  for(const url of ['/decisions?reason=no_dismissal','/decisions?q=성희롱']) {
    await page.goto(url);await expect(page.getByText('판정례를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')).toBeVisible();
    await expect(page.getByText(/해당하는 결과가 없습니다/)).toHaveCount(0);
  }
  await request.get('http://127.0.0.1:4319/control?fail=0');await page.getByRole('link',{name:'다시 시도'}).click();await expect(page.locator(rows)).toHaveCount(20);
  await page.goto('/decisions?q=empty');await expect(page.getByText('「empty」에 해당하는 결과가 없습니다.')).toBeVisible();
});
test('mobile and no-JavaScript links', async ({browser}) => {
  const context=await browser.newContext({javaScriptEnabled:false,viewport:{width:360,height:800}});
  const page=await context.newPage();await page.goto('/decisions');
  await page.locator('main a[href="/decisions?reason=no_dismissal"]').click();await expect(page.locator(rows)).toHaveCount(20);
  await page.getByRole('link',{name:'다음 →',exact:true}).click();await expect(page).toHaveURL(/reason=no_dismissal&page=2$/);
  await context.close();
});
