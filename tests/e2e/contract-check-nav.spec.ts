// US-304: /tools 인덱스 카드에서 근로계약서 점검 페이지로 이동.
import { test, expect } from '@playwright/test';

test('/tools 인덱스 카드로 근로계약서 점검에 진입한다', async ({ page }) => {
  await page.goto('/tools');

  // #141 뒤 도구 목록은 상황 묶음별 줄 목록이다 — 도구 이름은 제목(heading)이 아니라 링크 안의 글자다(링크 이름 = 이름·요약·배지).
  // 같은 이름의 바로가기가 목록 밖에도 있어 「채용·계약」 묶음 안에서 찾는다
  const card = page.getByRole('region', { name: '채용·계약' }).getByRole('link', { name: /^근로계약서 점검/ });
  await expect(card).toBeVisible();

  await card.click();
  await expect(page).toHaveURL(/\/tools\/contract-check$/);
  await expect(page.getByRole('heading', { name: '근로계약서 점검' })).toBeVisible();
  await expect(page.getByText('입력하신 내용은 저장되지 않습니다')).toBeVisible();
});
