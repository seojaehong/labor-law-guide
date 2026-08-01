// US-306: 사진 업로드 카드 렌더 + 501 폴백 안내 + (라우트 목) 폼 자동 채움·하이라이트.
import { test, expect } from '@playwright/test';

// 1x1 투명 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const upload = (page: import('@playwright/test').Page) =>
  page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'contract.png', mimeType: 'image/png', buffer: PNG });

test('업로드 카드가 보이고, 키가 없는 환경에서는 501 안내 후 수동 입력으로 유도한다', async ({ page }) => {
  await page.goto('/tools/contract-check');

  await expect(page.getByText('계약서 파일로 자동 입력')).toBeVisible();
  await expect(page.getByRole('button', { name: '파일 선택' })).toBeVisible();
  // 개인정보 고지 갱신 — 폼은 브라우저 내, 사진만 분석 목적 전송·무저장
  await expect(page.getByText('입력하신 내용은 저장되지 않습니다')).toBeVisible();
  await expect(page.getByText(/파일은 글자를 읽어내는 동안에만 서버를 거치고/)).toBeVisible();
  // 개인정보 보호법 §28조의8 — 파일은 통째로 전송되므로 마스킹 안내가 업로드 지점에 있어야 한다
  // 업로드 카드와 상단 고지 양쪽에 있다(의도) — strict mode 회피를 위해 first()
  await expect(page.getByText(/이름·주민등록번호·주소는 가리고 올려 주세요/).first()).toBeVisible();

  await upload(page);

  // Next의 route announcer도 role=alert이라 텍스트로 특정한다.
  await expect(page.getByText('사진 자동 인식을 준비 중입니다')).toBeVisible();
  // 안내 후에도 폼은 그대로 쓸 수 있어야 한다
  await expect(page.getByLabel('계약 시작일')).toBeVisible();
});

test('추출 결과가 오면 폼에 채우고 못 읽은 항목을 하이라이트한다', async ({ page }) => {
  await page.route('**/api/tools/contract-check/extract', (route) =>
    route.fulfill({
      status: 200,
      json: {
        contract: {
          period: { start_date: '2026-01-01', indefinite: true, probation: { applied: false } },
          work_time: { days_per_week: 5, start: '09:00', end: '18:00', breaks: [{ minutes: 60 }] },
          wage: {
            monthly_total: 2500000,
            items: [{ code: 'BASE', amount: 2000000 }],
            payday: '매월 10일',
            payment_method: '계좌이체',
          },
          holidays_leave: { weekly_rest: '일요일', weekly_rest_day_specified: true },
          risk_clauses: [{ clause_ref: '제9조', text: '중도 퇴사 시 배상', tags: ['위약예정'] }],
        },
        notes: ['임금 항목 일부가 흐릿합니다'],
      },
    }),
  );

  await page.goto('/tools/contract-check');
  await upload(page);

  // 확인 배너 + 모델 메모
  await expect(page.getByRole('status')).toContainText('인식 결과를 확인·수정하세요');
  await expect(page.getByRole('status')).toContainText('임금 항목 일부가 흐릿합니다');

  // 채워진 값
  await expect(page.getByLabel('계약 시작일')).toHaveValue('2026-01-01');
  await expect(page.getByLabel('월급여 총액')).toHaveValue('2,500,000');
  await expect(page.getByLabel('기본급')).toHaveValue('2,000,000');

  // 못 읽은 항목은 하이라이트 (수습 개월 수는 '수습 없음'이라 아예 노출되지 않음)
  await expect(page.getByText('사진에서 못 읽음').first()).toBeVisible();

  // 이후 기존 플로우 그대로 — 문제조항까지 진행하면 위약예정이 체크되어 있다
  await page.getByRole('button', { name: '다음' }).click();
  await expect(page.getByLabel('주 근무일수')).toHaveValue('5');
  await expect(page.getByLabel('하루 휴게시간')).toHaveValue('60');
  await page.getByRole('button', { name: '다음' }).click();
  await expect(page.getByLabel('임금 지급일')).toHaveValue('매월 10일');
  await page.getByRole('button', { name: '다음' }).click();
  await expect(page.getByRole('checkbox').nth(5)).toBeChecked();

  await page.getByRole('button', { name: '결과 보기' }).click();
  await expect(page.getByRole('heading', { name: '점검 결과' })).toBeVisible();
});

test('인식된 항목이 없으면 확인 배너 대신 재시도 안내를 띄운다', async ({ page }) => {
  await page.route('**/api/tools/contract-check/extract', (route) =>
    route.fulfill({ status: 200, json: { contract: {}, notes: [] } }),
  );

  await page.goto('/tools/contract-check');
  await upload(page);

  await expect(page.getByRole('status')).toContainText('사진에서 인식된 항목이 없습니다');
  await expect(page.getByRole('status')).not.toContainText('인식 결과를 확인·수정하세요');
});
