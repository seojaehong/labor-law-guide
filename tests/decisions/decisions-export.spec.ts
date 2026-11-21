import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

// 판례 상세 복사·내려받기 — 합성 판례(bc_export_fixture)와 그 검증 전문으로 실제 브라우저에서 본다.
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

// 윈도우 클립보드는 줄바꿈을 CRLF 로 바꿔 돌려준다 — 비교 전에 LF 로 맞춘다.
const clipboard = async (page: Page) => (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
const consoleErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
};

test('verified judgment: copy full, summary, citation, picked parts and download md/jsonl', async ({ page }) => {
  await page.request.get('http://127.0.0.1:4319/control?fail=0');
  const errors = consoleErrors(page);
  await page.goto('/decisions/bc_export_fixture');
  await expect(page.getByText('판결 전문 · 주문·이유·서명 확인')).toBeVisible();
  await expect(page.getByText('수집 본문 · 완전성 미확인')).toHaveCount(0);

  await page.getByRole('button', { name: '전문 복사' }).click();
  await expect(page.getByRole('status')).toContainText('전문을 복사했습니다');
  const full = await clipboard(page);
  expect(full.split('\n').slice(0, 2)).toEqual(['합성 해고무효확인', '대법원 · 2020. 1. 5. 선고 · 2019두12345']);
  expect(full).toContain('사       건    2019두12345 해고무효확인\n원고, 상고인    합성 주식회사\n    소송대리인 변호사 합성\n\n[주문]\n상고를 기각한다.\n상고비용은 원고가 부담한다.');
  expect(full).toContain('[이유]\n상고이유를 판단한다.\n원심의 판단에 잘못이 없다.\n\n대법관 합성');
  for (const label of ['전문 복사', '요지 복사', '판결 전문 · 주문', '내려받기']) expect(full).not.toContain(label);

  await page.getByRole('button', { name: '요지 복사' }).click();
  const summary = await clipboard(page);
  expect(summary).toBe('(AI 정리 · 판결문 원문 아님) 판결요지 정리\n합성 저장 요약 첫 줄\n합성 저장 요약 둘째 줄');

  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await page.getByRole('button', { name: '인용 형식 복사' }).click();
  await expect(page.getByRole('status')).toContainText('본문에서 인용할 부분을 먼저 드래그하세요');
  await page.evaluate(() => {
    const p = document.querySelector('[data-export-title="이유"]')!;
    const range = document.createRange();
    range.setStart(p.firstChild!, 0);
    range.setEnd(p.firstChild!, '상고이유를 판단한다.\n원심의 판단에 잘못이 없다.'.length);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
  });
  await page.getByRole('button', { name: '인용 형식 복사' }).click();
  expect(await clipboard(page)).toBe('[관련 판결] 대법원 2020. 1. 5. 선고 2019두12345 판결\n상고이유를 판단한다.\n원심의 판단에 잘못이 없다.');

  await page.getByRole('button', { name: '선택 복사' }).click();
  const panel = page.getByRole('group', { name: '복사할 부분 고르기' });
  await panel.getByText('사건 정보').click();
  await panel.getByText('이유', { exact: true }).click();
  await panel.getByText('판결요지 정리').click();
  await panel.getByRole('button', { name: '고른 부분 복사' }).click();
  const picked = await clipboard(page);
  expect(picked.startsWith('사       건')).toBe(true);
  expect(picked).toContain('[주문]\n상고를 기각한다.');
  expect(picked).toContain('[청구취지]\n피고의 해고는 무효임을 확인한다.');
  expect(picked).not.toContain('[이유]');
  expect(picked).not.toContain('합성 해고무효확인\n');
  expect(picked).not.toContain('AI 정리');

  const [md] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '.md 내려받기' }).click()]);
  expect(md.suggestedFilename()).toBe('대법원_2019두12345.md');
  const mdText = await readFile(await md.path(), 'utf8');
  expect(mdText).toMatch(/^---\ntitle: "합성 해고무효확인"\ncourt: "대법원"\ndate: "2020-01-05"\ncase_number: "2019두12345"\nsource_url: null\npage_url: "[^"]+\/decisions\/bc_export_fixture"\ntext_kind: "원문"\nexported_at: "\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00"\n---\n/);
  expect(mdText).toContain('## 주문\n\n상고를 기각한다.');
  expect(mdText).toContain('## 판결요지 정리\n\n(AI 정리 · 판결문 원문 아님)\n\n합성 저장 요약 첫 줄');

  const [jsonl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '.jsonl 내려받기' }).click()]);
  expect(jsonl.suggestedFilename()).toBe('대법원_2019두12345.jsonl');
  const record = JSON.parse((await readFile(await jsonl.path(), 'utf8')).trim());
  expect(record.sections.map((s: { title: string }) => s.title)).toEqual(['머리', '주문', '청구취지', '이유']);
  expect(record.summary).toEqual({ label: '판결요지 정리', text: '합성 저장 요약 첫 줄\n합성 저장 요약 둘째 줄', is_ai: true });
  expect(record.text_kind).toBe('원문');

  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: '선택 복사' }).click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`export-bar mobile overflow px=${overflow}`);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('falls back to a hidden textarea when the clipboard API refuses to write', async ({ page }) => {
  await page.request.get('http://127.0.0.1:4319/control?fail=0');
  await page.addInitScript(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error('blocked by test'));
  });
  const errors = consoleErrors(page);
  await page.goto('/decisions/bc_export_fixture');
  await page.getByRole('button', { name: '요지 복사' }).click();
  await expect(page.getByRole('status')).toContainText('요지를 복사했습니다');
  expect(await clipboard(page)).toBe('(AI 정리 · 판결문 원문 아님) 판결요지 정리\n합성 저장 요약 첫 줄\n합성 저장 요약 둘째 줄');
  expect(await page.locator('textarea').count()).toBe(0);
  expect(errors).toEqual([]);
});

test('case detail copy keeps AI marks and leaves no annotation markup', async ({ page }) => {
  await page.request.get('http://127.0.0.1:4319/control?fail=0');
  const errors = consoleErrors(page);
  await page.goto('/cases/ilabor_annotation_1_0');
  await page.getByRole('button', { name: '전문 복사' }).click();
  const full = await clipboard(page);
  expect(full).toContain('[요약] (AI 정리 · 판결문 원문 아님)\n요약 근로기준법 제23조');
  expect(full).toContain('[참조 법령]\n근로기준법 제23조 제1항');
  expect(full).not.toContain('law_cite');
  expect(errors).toEqual([]);
});
