import { test, expect } from '@playwright/test';

test('반복 클릭, 취소, 부분 실패·충돌 표시, 오류 후 재시도와 입력 변경', async ({ page }) => {
  // Browser and server both block external traffic. All submitted text is synthetic.
  await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  let calls = 0;
  let release: (() => void) | undefined;
  await page.route('**/api/tools/work-rules-precise', async (route) => {
    calls++;
    if (calls === 1) await new Promise<void>((resolve) => { release = resolve; });
    if (calls === 2) { await route.fulfill({ status: 503, json: { message: '이용 한도를 확인할 수 없어 유료 AI 점검을 시작하지 않았습니다.' } }); return; }
    await route.fulfill({ json: { runId: 'synthetic', articles: 1, review: { incomplete: 1, conflicts: 1, asOf: '20261022', since: '20260101' },
      rows: [{ 조문: '제1조', 현행: '', 개정안: '', '개정 사유': '합성 실패 사례', '근거·시행일': 'AI 인용(미검증): 합성 인용', 불이익변경: '확인 필요', '점검 결과': '추가 확인', '운영 메모': '검토 미완료 · 회차 의견 충돌', '제안 문안': '' }] } }).catch(() => {});
  });
  await page.goto('/laws');
  await page.locator('.lr-row[role=button]').first().click();
  await page.getByRole('button', { name: '취업규칙 점검', exact: true }).first().click();
  await page.getByLabel('취업규칙 본문', { exact: true }).fill('제1조(합성 휴가) 유급휴가 5일. 다만 예외를 확인한다.');
  const run = page.getByRole('button', { name: '정밀 점검 실행', exact: true });
  await run.click();
  await expect.poll(() => calls).toBe(1);
  await expect(page.getByRole('button', { name: /점검 중/ })).toBeDisabled();
  await page.getByRole('button', { name: /점검 중/ }).evaluate((el: HTMLButtonElement) => { el.click(); el.click(); });
  expect(calls).toBe(1);
  await page.getByRole('button', { name: '결과 대기 취소' }).click();
  await expect(page.getByText('결과 대기를 취소했습니다.', { exact: false })).toBeVisible();
  release?.();
  await run.click();
  await expect(page.getByText('이용 한도를 확인할 수 없어 유료 AI 점검을 시작하지 않았습니다.', { exact: true })).toBeVisible();
  await run.click();
  await expect(page.getByText(/검토 미완료 1조 · 회차 의견 충돌 1조/)).toBeVisible();
  await expect(run).toBeEnabled();
  await page.getByText('제1조', { exact: true }).click();
  await expect(page.getByText('근거: AI 인용(미검증): 합성 인용', { exact: true })).toBeVisible();
  await page.getByLabel('상시 근로자 수').fill('24');
  await expect(page.getByText(/검토 미완료 1조 · 회차 의견 충돌 1조/)).toHaveCount(0);
  expect(calls).toBe(3);
});
