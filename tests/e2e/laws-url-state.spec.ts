import { expect, test, type Page } from '@playwright/test';

const EVENT = '001872-20261008';
const ARTICLE = `${EVENT}~0107001`;
const card = (page: Page) => page.locator(`[id="${EVENT}"]`);
const row = (page: Page) => card(page).locator('[aria-expanded]');
const article = (page: Page) => page.locator(`[id="${ARTICLE}"]`);
const selectedUrl = `/laws?event=${EVENT}#${ARTICLE}`;

async function expectSelection(page: Page, expanded: boolean) {
  await expect(row(page)).toHaveAttribute('aria-expanded', String(expanded));
  await expect.poll(() => new URL(page.url()).searchParams.get('event')).toBe(expanded ? EVENT : null);
}

async function expectNoSelectionUrl(page: Page, hash = '') {
  await expect.poll(() => new URL(page.url()).searchParams.get('event')).toBeNull();
  await expect.poll(() => new URL(page.url()).hash).toBe(hash);
}

test.beforeEach(async ({ page }) => {
  // Keep Date deterministic without freezing timeouts, hydration or animations.
  await page.clock.setFixedTime(new Date('2026-10-06T00:00:00Z'));
});

test('opening and closing repeatedly updates the selected event', async ({ page }) => {
  await page.goto('/laws');
  await expectSelection(page, false);
  for (let attempt = 0; attempt < 3; attempt++) {
    await row(page).click();
    await expectSelection(page, true);
    await expect(article(page)).toBeVisible();
    await row(page).click();
    await expectSelection(page, false);
    await expectNoSelectionUrl(page);
    await expect(article(page)).toHaveCount(0);
  }
});

test('closing a direct article selection removes its stale hash', async ({ page }) => {
  await page.goto(selectedUrl);
  await expectSelection(page, true);
  await expect(article(page)).toBeVisible();
  await row(page).click();
  await expectSelection(page, false);
  await expectNoSelectionUrl(page);
  await page.reload();
  await expectSelection(page, false);
});

test('top list link clears detail selection and keeps the list anchor', async ({ page }) => {
  await page.goto(selectedUrl);
  await expectSelection(page, true);
  await page.getByRole('link', { name: '개정 목록 보기', exact: true }).click();
  await expectSelection(page, false);
  await expectNoSelectionUrl(page, '#law-list');
  await expect(card(page)).toHaveAttribute('data-focus', 'false');
  await expect(article(page)).toHaveCount(0);
  if (page.viewportSize()?.width === 390) {
    const overflow = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    console.log('Mobile list-return overflow:', JSON.stringify(overflow));
    expect(overflow.content).toBeLessThanOrEqual(overflow.viewport);
    await page.screenshot({ path: 'test-results/laws-url-mobile-list.png', fullPage: false });
  }
  await page.goBack();
  await expectSelection(page, true);
  await expect(article(page)).toBeVisible();
  await page.goForward();
  await expectSelection(page, false);
  await expectNoSelectionUrl(page, '#law-list');
  await page.reload();
  await expectSelection(page, false);
  await expectNoSelectionUrl(page, '#law-list');
});

for (const filter of ['search', 'period', 'month', 'law', 'rules'] as const) {
  test(`${filter} filter clears hidden selection without resurrecting it`, async ({ page }) => {
    await page.goto(selectedUrl);
    await expectSelection(page, true);
    if (filter === 'search') {
      await page.getByRole('textbox', { name: '개정 검색' }).fill('no-matching-amendment-xyz');
    } else if (filter === 'period') {
      await page.getByRole('group', { name: '기간', exact: true }).getByRole('button', { name: /^최근 시행/ }).click();
    } else if (filter === 'month') {
      await page.getByRole('navigation', { name: '월별 시행 건수' }).getByTitle('2026년 12월 시행', { exact: false }).click();
    } else if (filter === 'law') {
      await page.getByRole('group', { name: '법령 필터' }).getByRole('button', { name: /^산업안전보건법/ }).click();
    } else {
      await page.getByRole('button', { name: '취업규칙 관련', exact: true }).click();
    }
    await expect(card(page)).toHaveCount(0);
    await expectNoSelectionUrl(page);
    if (filter === 'period') {
      await page.getByRole('group', { name: '기간', exact: true }).getByRole('button', { name: /^시행 예정/ }).click();
    } else {
      await page.getByRole('button', { name: '필터 해제', exact: true }).click();
    }
    await expectSelection(page, false);
    await expect(article(page)).toHaveCount(0);
    await expectNoSelectionUrl(page);
  });
}

test('unrelated query parameters and hash survive filter and accordion changes', async ({ page }) => {
  await page.goto('/laws?utm_source=regression&tag=one&tag=two#notes');
  await expectSelection(page, false);
  await page.getByRole('textbox', { name: '개정 검색' }).fill('근로기준법');
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('근로기준법');
  await row(page).click();
  await expectSelection(page, true);
  await row(page).click();
  await expectSelection(page, false);
  await page.getByRole('button', { name: '필터 해제', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBeNull();
  const url = new URL(page.url());
  expect(url.searchParams.get('utm_source')).toBe('regression');
  expect(url.searchParams.getAll('tag')).toEqual(['one', 'two']);
  expect(url.hash).toBe('#notes');
});

for (const target of [selectedUrl, `/laws#${EVENT}`, `/laws#${ARTICLE}`]) {
  test(`direct and legacy links expand their target: ${target}`, async ({ page }) => {
    await page.goto(target);
    await expectSelection(page, true);
    await expect(article(page)).toBeVisible();
    await expect.poll(() => decodeURIComponent(new URL(page.url()).hash)).toBe(target.slice(target.indexOf('#')));
  });
}

test('same-document back and forward restore filters, selection and anchors', async ({ page }) => {
  await page.goto('/laws?utm_source=history#law-list');
  await expectSelection(page, false);
  // Construct real same-document history entries, then traverse with browser APIs.
  // A document marker prevents an accidental full reload from making this pass.
  await page.evaluate(({ event, articleId }) => {
    document.documentElement.dataset.historyMarker = 'same-document';
    history.pushState(history.state, '', `/laws?utm_source=history&view=all&q=근로기준법&law=001872&level=law&m=202610&event=${event}#${articleId}`);
    history.pushState(history.state, '', '/laws?utm_source=history&view=recent&q=not-found&rules=1#law-list');
  }, { event: EVENT, articleId: ARTICLE });
  await page.goBack();
  await expectSelection(page, true);
  await expect(page.getByRole('textbox', { name: '개정 검색' })).toHaveValue('근로기준법');
  await expect(page.getByRole('group', { name: '기간', exact: true }).getByRole('button', { name: /^전체/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '법률만', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(article(page)).toBeVisible();
  await expect.poll(() => new URL(page.url()).hash).toBe(`#${ARTICLE}`);
  await page.goBack();
  await expectSelection(page, false);
  await expect(page.getByRole('textbox', { name: '개정 검색' })).toHaveValue('');
  await expect(page.getByRole('button', { name: '법률만', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expectNoSelectionUrl(page, '#law-list');
  await page.goForward();
  await expectSelection(page, true);
  await page.goForward();
  await expect(page.getByRole('textbox', { name: '개정 검색' })).toHaveValue('not-found');
  await expect(page.getByRole('button', { name: '취업규칙 관련', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(card(page)).toHaveCount(0);
  await expectNoSelectionUrl(page, '#law-list');
  await expect(page.locator('html')).toHaveAttribute('data-history-marker', 'same-document');
});

test('calendar day survives back/forward and clearing it does not reopen a hidden card', async ({ page }) => {
  await page.goto(`/laws?mode=cal&d=20261008&event=${EVENT}#${ARTICLE}`);
  await expectSelection(page, true);
  await expect(page.getByRole('region', { name: '개정 달력' })).toBeVisible();
  await page.evaluate(() => {
    history.pushState(history.state, '', '/laws?mode=cal&d=20261208#law-list');
    history.pushState(history.state, '', '/laws#law-list');
  });
  await page.goBack();
  await expect(card(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '날짜 해제', exact: true })).toBeVisible();
  await expectNoSelectionUrl(page, '#law-list');
  await page.goBack();
  await expectSelection(page, true);
  await expect(page.getByRole('region', { name: '개정 달력' }).getByRole('button', { name: /^2026\. 10\. 8\./ })).toHaveAttribute('aria-pressed', 'true');
  await page.goForward();
  await expect(card(page)).toHaveCount(0);
  await page.getByRole('button', { name: '날짜 해제', exact: true }).click();
  // Clearing a day keeps the visible month; returning to October must not reopen its card.
  await expect(card(page)).toHaveCount(0);
  await page.getByRole('button', { name: '이번 달', exact: true }).click();
  await expectSelection(page, false);
  await expectNoSelectionUrl(page, '#law-list');
  await expect.poll(() => new URL(page.url()).searchParams.get('d')).toBeNull();
});

test('native list-link destination excludes detail selection and preserves unrelated parameters', async ({ page }) => {
  await page.goto(`/laws?utm_source=native-link&q=근로기준법&event=${EVENT}#${ARTICLE}`);
  await expectSelection(page, true);
  const link = page.getByRole('link', { name: '개정 목록 보기', exact: true });
  await expect.poll(async () => {
    const href = await link.getAttribute('href');
    return href ? new URL(href, page.url()).searchParams.get('event') : 'missing-href';
  }).toBeNull();
  const destination = new URL((await link.getAttribute('href'))!, page.url());
  expect(destination.searchParams.get('utm_source')).toBe('native-link');
  expect(destination.searchParams.get('q')).toBe('근로기준법');
  expect(destination.hash).toBe('#law-list');
  // Follow the href itself, as a new-tab/native navigation would.
  await page.goto(destination.toString());
  await expectSelection(page, false);
  await expectNoSelectionUrl(page, '#law-list');
});
