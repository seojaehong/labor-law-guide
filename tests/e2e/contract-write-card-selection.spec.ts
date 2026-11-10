import { expect, test, type Page } from '@playwright/test';

const name = '합성동명';
const workplace = '합성상사';
const members = [
  { name, hireDate: '2019-03-01', terms: { startDate: '2025-03-01', duty: '첫째 업무' } },
  { name, hireDate: '2026-03-01', terms: { startDate: '2026-03-01', duty: '둘째 업무' } },
];

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort();
  });
  // 실제 사람·사업장·서버 데이터 없이 새 브라우저 문맥에 합성 카드만 넣는다.
  await page.addInitScript(({ workplace, members, name }) => {
    localStorage.setItem('work-patterns.leave.workspaces.v1', JSON.stringify([
      { id: 'synthetic-a', name: workplace, kind: 'own', remember: false, fivePlus: 'no' },
      { id: 'synthetic-b', name: '합성다음상사', kind: 'own', remember: false },
    ]));
    sessionStorage.setItem('work-patterns.leave.members.v1:synthetic-a', JSON.stringify(members));
    sessionStorage.setItem('llg.history.v1:contract-write', JSON.stringify([{
      savedAt: '2026-11-10T00:00:00.000Z', label: '합성 최근 입력',
      state: { workplaceName: workplace, employeeName: name, startDate: '2026-03-01', duty: '최근 입력 업무', fivePlus: 'no' },
    }]));
  }, { workplace, members, name });
  await page.goto('/tools/contract-write');
  await openCards(page);
  await page.getByLabel('불러올 사업장', { exact: true }).selectOption('synthetic-a');
  await page.getByLabel('불러올 직원', { exact: true }).selectOption(`${name} 2019-03-01`);
  await expect(page.getByLabel('업무', { exact: true })).toHaveValue('첫째 업무');
});

async function openCards(page: Page) {
  const cards = page.locator('details').filter({ has: page.locator('summary', { hasText: '사업장 카드에서 불러오기 (선택)' }) });
  if ((await cards.getAttribute('open')) === null) await cards.locator('summary').click();
}

async function loadHistory(page: Page) {
  const history = page.locator('details').filter({ has: page.locator('summary', { hasText: '최근 입력 (선택)' }) });
  if ((await history.getAttribute('open')) === null) await history.locator('summary').click();
  await page.getByRole('button', { name: '합성 최근 입력 입력 불러오기', exact: true }).click();
  await expect(page.getByLabel('업무', { exact: true })).toHaveValue('최근 입력 업무');
  await openCards(page);
}

test('최근 입력을 반복해서 불러와도 이전 사업장·직원 선택으로 저장하지 않는다', async ({ page }) => {
  for (let i = 0; i < 2; i++) {
    await loadHistory(page);
    await expect(page.getByLabel('불러올 사업장', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('불러올 직원', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '이 근로자를 카드에 저장', exact: true }).click();
    await expect(page.getByText(/이미 다른 계약 조건으로 저장돼 있어 덮어쓰지 않았습니다/)).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('work-patterns.leave.members.v1:synthetic-a')!))).toEqual(members);
    await page.getByLabel('불러올 사업장', { exact: true }).selectOption('synthetic-a');
    await page.getByLabel('불러올 직원', { exact: true }).selectOption(`${name} 2019-03-01`);
  }
});

test('최근 입력 뒤 다른 사업장을 고를 때 옛 카드 출처로 직원 칸을 지우지 않는다', async ({ page }) => {
  await loadHistory(page);
  await page.getByLabel('불러올 사업장', { exact: true }).selectOption('synthetic-b');
  await expect(page.getByLabel('근로자 성명', { exact: true })).toHaveValue(name);
  await expect(page.getByLabel('계약 시작일', { exact: true })).toHaveValue('2026-03-01');
  await expect(page.getByLabel('업무', { exact: true })).toHaveValue('최근 입력 업무');
});

test('고른 직원의 날짜를 다른 동명 직원의 날짜로 바꾸면 저장 전에 알린다', async ({ page }) => {
  await page.getByLabel('계약 시작일', { exact: true }).fill('2026-03-01');
  let confirmation = '';
  page.once('dialog', async (dialog) => { confirmation = dialog.message(); await dialog.dismiss(); });
  await page.getByRole('button', { name: '이 근로자를 카드에 저장', exact: true }).click();
  await expect(page.getByText(/이름이 같은 다른 직원의 입사일 또는 계약 시작일과 겹쳐/)).toBeVisible();
  expect(confirmation).toContain('입사일 2019-03-01');
  expect(confirmation).toContain('2026-03-01');
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('work-patterns.leave.members.v1:synthetic-a')!))).toEqual(members);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '이 근로자를 카드에 저장', exact: true }).click();
  await expect(page.getByText('「합성상사」 카드에 합성동명 님의 계약 조건을 저장했습니다.', { exact: true })).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem('work-patterns.leave.members.v1:synthetic-a')!));
  expect(stored[0]).toMatchObject({ hireDate: '2019-03-01', terms: { startDate: '2026-03-01', duty: '첫째 업무' } });
  expect(stored[1]).toEqual(members[1]);
});
