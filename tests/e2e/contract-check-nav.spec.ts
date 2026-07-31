// US-304: /tools 인덱스 카드에서 근로계약서 자가진단 페이지로 이동.
import { test, expect } from '@playwright/test';

test('/tools 인덱스 카드로 근로계약서 자가진단에 진입한다', async ({ page }) => {
  await page.goto('/tools');

  const card = page.getByRole('heading', { name: '근로계약서 자가진단' });
  await expect(card).toBeVisible();

  await card.click();
  await expect(page).toHaveURL(/\/tools\/contract-check$/);
  await expect(page.getByRole('heading', { name: '근로계약서 자가진단' })).toBeVisible();
  await expect(page.getByText('입력 내용은 브라우저를 떠나지 않습니다')).toBeVisible();
});
