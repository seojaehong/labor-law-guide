import { expect, test, type Page } from '@playwright/test';

// 퇴직금 계산기(public/tools/severance.html) — 디자인 평가 261124. 합성 값만. 바깥 요청은 막는다.
// ① [저장]을 누르지 않으면 새로고침 뒤 복원하지 않는다 ② 결과 블록 순서와 숫자 ③ 390 폭 가로 넘침 없음 ④ 다크 포커스 링

const PATH = '/tools/severance.html';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort();
  });
});

async function openPersonal(page: Page) {
  const box = page.locator('#personalInfo');
  if ((await box.count()) && !(await box.evaluate((d) => (d as HTMLDetailsElement).open))) await box.locator('summary').click();
}

test('이름을 넣고 [저장]을 누르지 않으면 새로고침 뒤 복원하지 않는다', async ({ page }) => {
  await page.goto(PATH);
  await openPersonal(page);
  await page.locator('#workerName').fill('가상근로자');
  await page.locator('#startDate').fill('2023-01-01');
  await page.locator('#startDate').blur();
  await page.waitForTimeout(900); // 옛 자동 저장(500ms 지연)보다 오래 기다린다
  await page.reload();
  await expect(page.locator('#workerName')).toHaveValue('');
  await expect(page.locator('#startDate')).toHaveValue('');
  await expect(page.locator('#savedNotice')).toBeHidden();
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('severanceCalcData')))).toEqual([]);
});

test('[저장]을 누르면 복원하고 「지우기」로 저장값을 지운다', async ({ page }) => {
  await page.goto(PATH);
  await openPersonal(page);
  await page.locator('#workerName').fill('가상근로자');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.locator('#actionStatus')).toContainText('저장했습니다');
  await page.reload();
  await expect(page.locator('#workerName')).toHaveValue('가상근로자');
  await expect(page.locator('#savedNotice')).toBeVisible();
  await expect(page.locator('#savedNotice')).toContainText('이 브라우저에 저장된 입력이 있습니다');
  await page.locator('#savedNotice').getByRole('button', { name: '지우기' }).click();
  await expect(page.locator('#savedNotice')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('severanceCalcData_v5'))).toBeNull();
});

test('저장 표식이 없는 옛 자동 저장값은 복원하지 않고 지운다', async ({ page }) => {
  await page.goto(PATH);
  await page.evaluate(() => localStorage.setItem('severanceCalcData_v4', JSON.stringify({ currentIndex: 0, workers: [{ workerName: '가상근로자', startDate: '2023-01-01', endDate: '2025-12-31' }] })));
  await page.reload();
  await expect(page.locator('#workerName')).toHaveValue('');
  expect(await page.evaluate(() => localStorage.getItem('severanceCalcData_v4'))).toBeNull();
});

test('결과 블록 — 금액 → 산식 → 근거 → 기준 → 면책 → 다음 할 일, 숫자는 바꾸기 전과 같다', async ({ page }) => {
  await page.goto(PATH);
  await page.locator('#startDate').fill('2021-01-04');
  await page.locator('#endDate').fill('2025-12-31');
  for (const i of [1, 2, 3]) await page.locator(`#wage${i}`).fill('3000000');
  await page.getByRole('button', { name: '계산하기' }).click();
  const status = page.locator('#resultStatus');
  await expect(status).toHaveAttribute('aria-live', 'polite');
  await expect(status).toContainText('계산했습니다');
  const block = page.locator('#resultArea .result-block');
  await expect(block.locator('.result-amount')).toContainText('14,657,832');
  await expect(block).toContainText('97,826.09 × 30 × 1,823일 ÷ 365 = 14,657,832원');
  await expect(block).toContainText('151,780');
  await expect(block).toContainText('15,170');
  await expect(block).toContainText('14,490,882');
  await expect(block).toContainText('근로자퇴직급여 보장법 제8조');
  await expect(block).toContainText('2026. 10. 29.');
  await expect(block.locator('a[href="/tools/wage-delay-interest"]')).toBeVisible();
  await expect(block.locator('a[href="/exit"]')).toBeVisible();
  const order = await block.evaluate((b) => ['.result-amount', '.result-formula', '.result-basis', '.result-asof', '.result-caption', '.result-next']
    .map((s) => b.querySelector(s)!.getBoundingClientRect().top));
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  await expect(page.locator('#toast')).toHaveCount(0);
  // 산정서는 접힘 안 — 펴면 서명란이 있다
  const sheet = page.locator('#statementBox');
  await expect(sheet.locator('.stmt-signature')).toBeHidden();
  await sheet.locator('summary').click();
  await expect(sheet.locator('.stmt-signature')).toBeVisible();
  // 인쇄용 칸은 계산 뒤에 채워도 결과가 남고 산정서에 들어간다
  await openPersonal(page);
  await page.locator('#workerName').fill('가상근로자');
  await expect(block.locator('.result-amount')).toContainText('14,657,832');
  await expect(sheet).toContainText('가상근로자');
});

async function calc(page: Page, start: string, last: string) {
  await page.goto(PATH);
  page.on('dialog', (d) => d.accept());
  await page.locator('#startDate').fill(start);
  await page.locator('#endDate').fill(last);
  for (const i of [1, 2, 3]) await page.locator(`#wage${i}`).fill('3000000');
  await page.getByRole('button', { name: '계산하기' }).click();
  await expect(page.locator('#resultStatus')).toContainText('계산했습니다');
}

test('계산 뒤 입력을 두 글자 고쳐도 「결과를 지웠습니다」 안내가 남는다', async ({ page }) => {
  await calc(page, '2021-01-04', '2025-12-31');
  await page.locator('#wage1').fill('30000001');
  await page.locator('#wage1').press('Backspace');
  await page.locator('#wage1').press('Backspace');
  await expect(page.locator('#resultStatus')).toContainText('앞의 계산 결과를 지웠습니다');
  await expect(page.locator('#resultArea')).toBeHidden();
});

test('1년 미만이면 지급 기한을 단정하지 않고 대상이 아닐 수 있다고 적는다', async ({ page }) => {
  await calc(page, '2025-06-01', '2025-12-31');
  const next = page.locator('.result-next');
  await expect(next).toContainText('1년 미만이면 퇴직금 지급 대상이 아닐 수 있습니다');
  await expect(next).not.toContainText('14일째');
});

test('1년 이상이면 마지막 근무일에서 14일째 되는 날을 적는다', async ({ page }) => {
  await calc(page, '2021-01-04', '2025-12-31');
  await expect(page.locator('.result-next')).toContainText('마지막 근무일에서 14일째 되는 날까지 지급합니다');
  await expect(page.locator('.result-next')).toContainText('2026. 01. 14.');
});

test('2022. 12. 31. 이전 퇴사는 퇴직소득세를 계산하지 않았다고 적고 세율표 확인일을 쓰지 않는다', async ({ page }) => {
  await calc(page, '2019-01-02', '2022-12-31');
  const block = page.locator('.result-block');
  await expect(block.locator('.result-label')).toHaveText('퇴직금(세전)');
  await expect(block).toContainText('퇴직소득세 반영 전 금액');
  await expect(block.locator('.result-asof')).toContainText('퇴직소득세는 계산하지 않았습니다');
  await expect(block.locator('.result-asof')).not.toContainText('확인일');
});

test('「자동」을 끄고 세액을 직접 넣으면 세율표 확인일을 쓰지 않는다', async ({ page }) => {
  await page.goto(PATH);
  await page.locator('#extraWages summary').click();
  await page.locator('#autoCalcTax').uncheck();
  await page.locator('#retirementTax').fill('100000');
  await page.locator('#startDate').fill('2021-01-04');
  await page.locator('#endDate').fill('2025-12-31');
  for (const i of [1, 2, 3]) await page.locator(`#wage${i}`).fill('3000000');
  await page.getByRole('button', { name: '계산하기' }).click();
  await expect(page.locator('.result-asof')).toContainText('직접 입력한 값');
  await expect(page.locator('.result-asof')).not.toContainText('확인일');
});

test('빈 칸으로 계산하면 칸 옆에 오류 문장을 두고 aria-describedby 로 잇는다', async ({ page }) => {
  await page.goto(PATH);
  await page.getByRole('button', { name: '계산하기' }).click();
  const field = page.locator('#startDate');
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  const ids = ((await field.getAttribute('aria-describedby')) ?? '').split(' ');
  expect(ids).toContain('startDateError');
  await expect(page.locator('#startDateError')).toContainText('입력해 주세요');
  await expect(field).toBeFocused();
});

for (const theme of ['light', 'dark'] as const) {
  test(`390 폭(${theme}) — 4구간이어도 가로로 넘치지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
    await page.goto(PATH);
    await page.locator('#startDate').fill('2021-01-04');
    await page.locator('#endDate').fill('2026-01-14');
    await page.locator('#endDate').blur();
    await expect(page.locator('#wage4')).toBeVisible();
    for (const i of [1, 2, 3, 4]) await page.locator(`#wage${i}`).fill('3000000');
    await page.getByRole('button', { name: '계산하기' }).click();
    await expect(page.locator('#resultStatus')).toContainText('계산했습니다');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
}

test('다크 화면 포커스 링은 2px 이고 바탕과 3:1 이상이다, 입력칸 테두리도 3:1 이상', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  await page.goto(PATH);
  const lum = `(c) => { const m = c.match(/\\d+(\\.\\d+)?/g).map(Number); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); }`;
  const ratio = async (fg: string, bg: string) => page.evaluate(([a, b, l]) => { const L = eval(l); const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }, [fg, bg, lum]);
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  for (const sel of ['nav a[href="/blog"]', '#startDate', 'button.btn-primary']) {
    await page.locator(sel).first().focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const ring = await page.locator(sel).first().evaluate((el) => { const s = getComputedStyle(el); return { color: s.outlineColor, width: s.outlineWidth, style: s.outlineStyle }; });
    expect(ring.style, sel).toBe('solid');
    expect(ring.width, sel).toBe('2px');
    expect(await ratio(ring.color, bodyBg), sel).toBeGreaterThanOrEqual(3);
  }
  const field = await page.locator('#startDate').evaluate((el) => {
    const s = getComputedStyle(el);
    let p: Element | null = el.parentElement; let bg = 'rgba(0, 0, 0, 0)';
    while (p && (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) { bg = getComputedStyle(p).backgroundColor; p = p.parentElement; }
    return { border: s.borderTopColor, fill: s.backgroundColor, around: bg };
  });
  expect(await ratio(field.border, field.around)).toBeGreaterThanOrEqual(3);
});
