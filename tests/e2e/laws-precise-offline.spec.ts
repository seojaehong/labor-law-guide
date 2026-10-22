import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

test('PR72 스냅샷·XLSX·진행 표시와 안전 보완의 취소·부분 실패·재시도를 함께 보존한다', async ({ page }) => {
  await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  let calls = 0;
  let release: (() => void) | undefined;
  const inputs: Record<string, unknown>[] = [];
  await page.route('**/api/tools/work-rules-precise', async (route) => {
    const call = ++calls; const input = route.request().postDataJSON(); inputs.push(input);
    if (call === 1 || call === 3) await new Promise<void>((resolve) => { release = resolve; });
    if (call === 2) { await route.fulfill({ status: 503, json: { message: '이용 한도를 확인할 수 없어 유료 AI 점검을 시작하지 않았습니다.' } }); return; }
    await route.fulfill({ json: { runId: 'synthetic', articles: 1, review: { incomplete: 1, conflicts: 1, asOf: '20261022', since: input.since },
      rows: [{ 조문: '제1조', 현행: '', 개정안: input.rules, '개정 사유': '합성 실패 사례', '근거·시행일': 'AI 인용(미검증): 합성 인용', 불이익변경: '비교 불가 — 종전 규칙 미제공', '점검 결과': '추가 확인', '운영 메모': '검토 미완료 · 회차 의견 충돌', '제안 문안': '' }] } }).catch(() => {});
  });
  await page.goto('/laws');
  await page.locator('.lr-row[role=button]').first().click();
  await page.getByRole('button', { name: '취업규칙 점검', exact: true }).first().click();
  await page.getByLabel('취업규칙 본문', { exact: true }).fill('제1조(합성 휴가) 유급휴가 5일. 다만 예외를 확인한다.');
  const run = page.getByRole('button', { name: /^AI 정밀 점검 실행/ });
  await run.click(); await expect.poll(() => calls).toBe(1);
  const running = page.getByRole('button', { name: /대조하는 중/ });
  await expect(running).toBeDisabled();
  await running.evaluate((el: HTMLButtonElement) => { el.click(); el.click(); });
  expect(calls).toBe(1);
  await expect(page.locator('.lr-pc-progress')).toContainText('1묶음');
  await expect(page.locator('.lr-pc-progress .bar')).toHaveClass(/indeterminate/);
  await page.getByRole('button', { name: '결과 대기 취소' }).click(); release?.();
  await expect(page.getByText('결과 대기를 취소했습니다.', { exact: false })).toBeVisible();
  await run.click();
  await expect(page.getByText('이용 한도를 확인할 수 없어 유료 AI 점검을 시작하지 않았습니다.', { exact: true })).toBeVisible();
  await page.getByLabel('상시 근로자 수').fill('24');
  await page.getByLabel('보고 싶은 내용이나 넣고 싶은 내용').fill('합성 실행 당시 요청');
  await run.click(); await expect.poll(() => calls).toBe(3);
  await page.getByLabel('상시 근로자 수').fill('99');
  await page.getByLabel('보고 싶은 내용이나 넣고 싶은 내용').fill('변경한 현재 요청');
  await page.getByLabel('내 취업규칙 최종 개정일').fill('2025-01-01');
  await page.getByLabel('취업규칙 본문', { exact: true }).fill(Array.from({ length: 9 }, (_, i) => `제${i + 1}조(변경 합성) 변경한 현재 문서`).join('\n'));
  await page.getByRole('button', { name: '+ 종전 규칙과 비교하기(불이익변경 대조)', exact: true }).click();
  const zip = new JSZip(); zip.file('Contents/section0.xml', '<hp:p><hp:t>제1조(합성 휴가) 종전 합성 문서</hp:t></hp:p>');
  await page.locator('.lr-pc input[type=file]').last().setInputFiles({ name: 'synthetic-old.hwpx', mimeType: 'application/zip', buffer: await zip.generateAsync({ type: 'nodebuffer' }) });
  await expect(page.getByText('synthetic-old.hwpx', { exact: true })).toBeVisible();
  await expect(page.locator('.lr-pc-progress')).toContainText('조문 1개를 1묶음');
  release?.();
  await expect(page.getByText(/검토 미완료 1조 · 회차 의견 충돌 1조/)).toBeVisible();
  await expect(page.getByText(/조건이 바뀌어 다시 점검이 필요합니다/)).toBeVisible();
  await expect(page.getByText(/종전 규칙을 넣지 않아 불이익변경은 대조하지 않았습니다/)).toBeVisible();
  await expect(page.getByText('AI 인용(미검증): 합성 인용', { exact: true })).toBeVisible();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '대조표 엑셀', exact: true }).click();
  const file = await downloaded; const book = new ExcelJS.Workbook();
  await book.xlsx.load(readFileSync((await file.path())!));
  const exported = JSON.stringify(book.worksheets[0].getSheetValues());
  expect(exported).toContain('상시 근로자 24명'); expect(exported).not.toContain('99명');
  expect(exported).toContain('합성 실행 당시 요청'); expect(exported).not.toContain('변경한 현재 요청');
  const since = String(inputs[2].since).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
  expect(exported).toContain(`점검 시작일 ${since}`); expect(exported).toContain('종전 규칙 미제공');
  expect(exported).toContain('검토 미완료 1조'); expect(exported).toContain('유급휴가 5일'); expect(exported).not.toContain('변경한 현재 문서'); expect(inputs[2].old).toBeNull();
  // 다음 실행은 현재 문서·종전 문서·조건을 사용한다.
  await run.click(); await expect.poll(() => calls).toBe(4);
  expect(inputs[3].old).toContain('종전 합성 문서'); expect(inputs[3].headcount).toBe('99');
  expect(inputs[3].rules).toContain('변경한 현재 문서');
});
