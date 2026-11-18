import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const key = 'llg.history.v1:contract-write';
    localStorage.setItem(key, JSON.stringify([{ savedAt: '2026-11-10T00:00:00Z', label: '합성 입력', state: {} }]));
    localStorage.setItem('llg.history.remember.v1:contract-write', 'true');
    const original = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (name) {
      if (this === localStorage && name === key && !sessionStorage.getItem('synthetic:allow-removal')) {
        throw new DOMException('synthetic removal failure', 'SecurityError');
      }
      original.call(this, name);
    };
  });
  await page.goto('/tools/contract-write');
  await page.getByText('최근 입력 (선택)', { exact: true }).click();
});

test('기억하기 삭제 실패를 알리고 반복 실패 후에도 같은 변경을 재시도할 수 있다', async ({ page }) => {
  const checkbox = page.getByLabel('이 브라우저에 최근 입력 기억하기', { exact: true });
  await checkbox.uncheck();
  await expect(checkbox).toBeChecked();
  await expect(page.getByText(/기억하기 변경을 완료하지 못했습니다/)).toBeVisible();
  await expect(page.getByText('이 탭을 닫으면 최근 입력이 사라집니다.', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '기억하기 변경 다시 시도', exact: true }).click();
  await expect(checkbox).toBeChecked();
  await page.evaluate(() => sessionStorage.setItem('synthetic:allow-removal', 'yes'));
  await page.getByRole('button', { name: '기억하기 변경 다시 시도', exact: true }).click();
  await expect(checkbox).not.toBeChecked();
  await expect(page.getByText(/기억하기 변경을 완료하지 못했습니다/)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('llg.history.v1:contract-write'))).toBeNull();
  await expect(page.getByRole('button', { name: '합성 입력 입력 불러오기', exact: true })).toBeVisible();
});

test('최근 입력 지우기 실패 후 경고와 버튼을 유지하고 성공 시 영역을 닫는다', async ({ page }) => {
  const clear = page.getByRole('button', { name: '최근 입력 지우기', exact: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    await clear.click();
    await expect(page.getByText(/최근 입력 삭제를 완료하지 못했습니다/)).toBeVisible();
    await expect(clear).toBeVisible();
  }
  await page.evaluate(() => sessionStorage.setItem('synthetic:allow-removal', 'yes'));
  await clear.click();
  await expect(page.getByText('최근 입력 (선택)', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('llg.history.v1:contract-write'))).toBeNull();
});

test('설정 복구 실패로 체크가 이미 풀렸어도 같은 변경을 다시 시도한다', async ({ page }) => {
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (this === localStorage && name === 'llg.history.remember.v1:contract-write' && !sessionStorage.getItem('synthetic:allow-removal')) {
        throw new DOMException('synthetic flag rollback failure', 'SecurityError');
      }
      original.call(this, name, value);
    };
  });
  const checkbox = page.getByLabel('이 브라우저에 최근 입력 기억하기', { exact: true });
  await checkbox.uncheck();
  await expect(checkbox).not.toBeChecked();
  await expect(page.getByText(/기억하기 변경을 완료하지 못했습니다/)).toBeVisible();
  await expect(page.getByRole('button', { name: '기억하기 변경 다시 시도', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('llg.history.v1:contract-write'))).not.toBeNull();
  await page.evaluate(() => sessionStorage.setItem('synthetic:allow-removal', 'yes'));
  await page.getByRole('button', { name: '기억하기 변경 다시 시도', exact: true }).click();
  await expect(page.getByText(/기억하기 변경을 완료하지 못했습니다/)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('llg.history.v1:contract-write'))).toBeNull();
  await expect(page.getByRole('button', { name: '합성 입력 입력 불러오기', exact: true })).toBeVisible();
});
