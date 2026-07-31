// US-303: 문제조항 4개 체크 시나리오 → 위반 4건 이상 표시 + 수정 방향 + CTA 링크 확인.
import { test, expect } from '@playwright/test';

test('문제조항 4개 체크 시 위반 4건 이상과 수정 방향·CTA가 표시된다', async ({ page }) => {
  await page.goto('/tools/contract-check');

  // ①~③ 스텝은 전부 건너뛰기(모름 허용)
  await page.getByRole('button', { name: '다음' }).click();
  await page.getByRole('button', { name: '다음' }).click();
  await page.getByRole('button', { name: '다음' }).click();

  // ④ 문제조항 4개 체크 (모두 violation 태그 규칙)
  await page.getByText('퇴직 후 14일을 넘겨 임금·퇴직금을 지급한다는 약정').click();
  await page.getByText('"즉시 해고할 수 있다"는 문구').click();
  await page.getByText('회사에 이의제기·소송을 하지 않겠다는 조항').click();
  await page.getByText('위약금·손해배상액을 미리 정해 둔 조항').click();
  await page.getByRole('button', { name: '결과 보기' }).click();

  // 결과: 위반 4건 이상
  await expect(page.getByRole('heading', { name: '점검 결과' })).toBeVisible();
  const badge = await page.getByText(/^위반 \d+$/).textContent();
  const violations = parseInt(badge?.replace(/\D/g, '') ?? '0', 10);
  expect(violations).toBeGreaterThanOrEqual(4);

  // 위반 항목별 수정 방향(amendments 문안) 표시
  await expect(page.getByText('수정 방향:').first()).toBeVisible();
  await expect(page.getByText(/위약금·손해배상액 예정 조항 삭제/)).toBeVisible();

  // needs_data 구분 안내
  await expect(page.getByText(/입력하면 판정됩니다/).first()).toBeVisible();

  // CTA 링크 + 인쇄 버튼 + 면책 문구
  const cta = page.getByRole('link', { name: '전문가에게 계약서 검토 요청' });
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute('href', '/contact');
  await expect(page.getByRole('button', { name: '결과 인쇄' })).toBeVisible();
  // 결과 화면 면책 문구(페이지 하단 상시 문구와 별개로 2곳 존재)
  await expect(page.getByText(/법률자문이 아닙니다/).first()).toBeVisible();
});
