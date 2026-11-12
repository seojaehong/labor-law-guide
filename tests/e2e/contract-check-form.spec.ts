// US-302: /tools/contract-check 4스텝 폼 진행 → 결과 화면 도달.
import { test, expect } from '@playwright/test';

test('4스텝 폼을 진행하면 결과 화면에 도달한다', async ({ page }) => {
  await page.goto('/tools/contract-check');

  await expect(page.getByRole('heading', { name: '근로계약서 점검' })).toBeVisible();
  await expect(page.getByText('입력하신 내용은 저장되지 않습니다')).toBeVisible();

  // ① 기본
  await page.getByRole('button', { name: '기간 정함 없음' }).click();
  await page.getByLabel('계약 시작일').fill('2026-01-01');
  await page.getByLabel('월급여 총액').fill('2200000');
  await page.getByLabel('기본급').fill('2200000');
  await page.getByRole('button', { name: '다음' }).click();

  // ② 근로시간
  await page.getByLabel('주 근무일수').fill('5');
  await page.getByLabel('출근 시각').fill('09:00');
  await page.getByLabel('퇴근 시각').fill('18:00');
  await page.getByLabel('하루 휴게시간').fill('60');
  await page.getByRole('button', { name: '없음', exact: true }).click();
  await page.getByRole('button', { name: '다음' }).click();

  // ③ 임금 구성·지급 — 일부만 입력(건너뛰기 허용 확인)
  await page.getByLabel('임금 지급일').fill('매월 10일');
  await page.getByRole('button', { name: '계좌이체' }).click();
  await page.getByRole('button', { name: '다음' }).click();

  // ④ 문제조항 — 1건 체크 후 결과 보기
  await page.getByText('위약금·손해배상액을 미리 정해 둔 조항').click();
  await page.getByRole('button', { name: '결과 보기' }).click();

  // 결과 화면 도달
  await expect(page.getByRole('heading', { name: '점검 결과' })).toBeVisible();
  await expect(page.getByText(/^위반 \d+$/)).toBeVisible();
});

// 261112 운영 실측: 주 근무일수 -100 이 빼기표만 지워져 100 으로 들어갔다 — 고쳐 넣지 않고 알린다.
test('주 근무일수에 음수를 넣으면 지우지 않고 알린다', async ({ page }) => {
  await page.goto('/tools/contract-check');
  await page.getByRole('button', { name: '다음' }).click();
  const days = page.getByLabel('주 근무일수');
  await days.fill('-100');
  await expect(days).toHaveValue('-100');
  await expect(days).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('주 근무일수는 1일부터 7일까지 숫자로 넣어 주세요.', { exact: false })).toBeVisible();
  await days.fill('5');
  await expect(days).toHaveValue('5');
  await expect(page.getByText('주 근무일수는 1일부터 7일까지', { exact: false })).toHaveCount(0);
});
