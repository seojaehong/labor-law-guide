import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import fs from 'node:fs';

// 모성보호 서식 — 합성 값만. 바깥 요청은 막고, 칸 검사 → 안내 → 한글 파일 내려받기까지 본다.
test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort();
  });
  await page.goto('/tools/hr-forms');
});

test('빈 칸으로 누르면 고칠 칸을 보여 주고 파일을 만들지 않는다', async ({ page }) => {
  await page.getByRole('button', { name: '한글 파일 내려받기' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '고칠 칸' })).toContainText('「성명」을(를) 적어 주세요.');
});

test('육아휴직 신청서 — 30일 전 안내 후 hwpx 를 내려받는다', async ({ page }) => {
  const fill = (label: RegExp, v: string) => page.getByLabel(label).first().fill(v);
  await fill(/^성명/, '김가상');
  await fill(/^생년월일/, '1990-03-04');
  await page.getByLabel(/^신청 사유/).selectOption('child');
  await fill(/^대상 자녀 성명/, '김가가');
  await fill(/^자녀 생년월일/, '2022-05-01');
  await fill(/^휴직 시작 예정일/, '2027-01-04');
  await fill(/^휴직 종료 예정일/, '2027-07-03');
  await fill(/^신청일/, '2026-12-20');
  await fill(/^사업장명/, '가상상사');
  await expect(page.getByText('근거 조문과 대조한 안내')).toBeVisible();
  await expect(page.getByText(/휴직 시작 15일 전입니다/)).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '한글 파일 내려받기' }).click()]);
  expect(dl.suggestedFilename()).toBe('육아휴직 신청서_김가상.hwpx');
  const z = await JSZip.loadAsync(fs.readFileSync((await dl.path())!));
  expect(Object.keys(z.files)[0]).toBe('mimetype');
  expect(await z.file('Contents/section0.xml')!.async('string')).toContain('김가가');
  await expect(page.getByRole('status')).toContainText('내려받았습니다');
});

test('다른 서식으로 바꾸면 그 서식 칸이 나오고, 휴대폰 폭에서 가로로 넘치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '배우자 출산전후휴가 고지서' }).click();
  await expect(page.getByLabel(/^1회차 시작일/)).toBeVisible();
  // 2차 서식(261124)도 고를 수 있다
  await page.getByRole('button', { name: '가족돌봄휴가 신청서' }).click();
  await expect(page.getByLabel(/^돌봄 대상 가족 성명/)).toBeVisible();
  await page.getByRole('button', { name: '육아기 근로시간 단축 신청서' }).click();
  await expect(page.getByLabel(/^단축 후 주 근로시간/)).toBeVisible();
  // 3차(261128) — 근로조건 서면
  await page.getByRole('button', { name: '육아기 근로시간 단축 근로조건 서면' }).click();
  await expect(page.getByLabel(/^임금 항목 1 단축 후 월액/)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
