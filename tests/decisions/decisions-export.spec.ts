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

// 합성 판결의 이유 절과 그 판단 부분(「1. 기초사실」을 건너뛴 「2. 판단」부터 끝까지) — 원문 글자 그대로다.
const REASON = '1. 기초사실\n원고는 합성 공사에서 근무하다가 해고되었다.\n\n2. 판단\n가. 해고의 정당성\n원심은 해고 사유가 없다고 보았다.\n원심의 판단에 잘못이 없다.\n\n3. 결론\n그러므로 상고를 기각하기로 하여 주문과 같이 판결한다.\n\n대법관 합성';
const JUDGED = REASON.slice(REASON.indexOf('2. 판단'));
const SUMMARY_LABEL = '요지(판결문 원문 · 이유 중 판단 부분)';
const HEAD = '대    법    원\n\n사       건    2019두12345 해고무효확인\n원고, 상고인    합성 주식회사\n    소송대리인 변호사 합성\n피　　고　　합성 공사';
const count = (text: string, part: string) => text.split(part).length - 1;

/** 두 표지 사이를 드래그한 것처럼 고른다 — 시작 표지의 첫 글자부터 끝 표지의 마지막 글자까지 */
const selectBetween = (page: Page, startSelector: string, endSelector: string) =>
  page.evaluate(([startSel, endSel]) => {
    const textNodes = (selector: string) => {
      const walker = document.createTreeWalker(document.querySelector(selector)!, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      while (walker.nextNode()) if ((walker.currentNode as Text).data.trim()) nodes.push(walker.currentNode as Text);
      return nodes;
    };
    const start = textNodes(startSel)[0];
    const ends = textNodes(endSel);
    const end = ends[ends.length - 1];
    const range = document.createRange();
    range.setStart(start, 0);
    range.setEnd(end, end.data.length);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
  }, [startSelector, endSelector]);

test('verified judgment: copy full, verbatim 요지, citation, picked parts and download md/jsonl', async ({ page }) => {
  await page.request.get('http://127.0.0.1:4319/control?fail=0');
  const errors = consoleErrors(page);
  await page.goto('/decisions/bc_export_fixture');
  await expect(page.getByText('판결 전문 · 주문·이유·서명 확인')).toBeVisible();
  await expect(page.getByText('수집 본문 · 완전성 미확인')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '요지 · 판결문 원문(이유 중 판단 부분)' })).toBeVisible();
  // AI 정리는 지우지 않고 접힌 「AI 정리 보기」로 옮겼다. 요지라 부르지 않는다.
  const aiDetails = page.locator('details', { has: page.locator('summary', { hasText: 'AI 정리 보기 · 원문 아님' }) });
  await expect(aiDetails).toHaveCount(1);
  await expect(aiDetails).not.toHaveAttribute('open', /.*/);
  await expect(page.locator('main > .layout-reading')).not.toContainText('판결요지');

  await page.getByRole('button', { name: '전문 복사' }).click();
  await expect(page.getByRole('status')).toContainText('전문을 복사했습니다');
  const full = await clipboard(page);
  expect(full.split('\n').slice(0, 2)).toEqual(['합성 해고무효확인', '대법원 · 2020. 1. 5. 선고 · 2019두12345']);
  // 머리 절은 빈 줄·간격(전각 공백 포함)까지 저장 글자 그대로 나온다.
  expect(full).toContain(`${HEAD}\n\n[주문]\n상고를 기각한다.\n상고비용은 원고가 부담한다.`);
  expect(full).toContain(`[이유]\n${REASON}`);
  // 전문은 절만 싣는다 — 요지 상자에 같은 판단 부분이 있어도 두 번 실리지 않는다.
  expect(count(full, '2. 판단')).toBe(1);
  for (const label of ['전문 복사', '요지 복사', '판결 전문 · 주문', '내려받기', SUMMARY_LABEL, '합성 저장 요약']) expect(full).not.toContain(label);

  await page.getByRole('button', { name: '요지 복사' }).click();
  await expect(page.getByRole('status')).toHaveText('요지를 복사했습니다.');
  expect(await clipboard(page)).toBe(`${SUMMARY_LABEL}\n${JUDGED}`);

  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await page.getByRole('button', { name: '인용 형식 복사' }).click();
  await expect(page.getByRole('status')).toContainText('본문에서 인용할 부분을 먼저 드래그하세요');
  await page.evaluate(() => {
    const p = document.querySelector('[data-export-title="이유"]')!;
    const range = document.createRange();
    range.setStart(p.firstChild!, 0);
    range.setEnd(p.firstChild!, '1. 기초사실\n원고는 합성 공사에서 근무하다가 해고되었다.'.length);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
  });
  await page.getByRole('button', { name: '인용 형식 복사' }).click();
  expect(await clipboard(page)).toBe('[관련 판결] 대법원 2020. 1. 5. 선고 2019두12345 판결\n1. 기초사실\n원고는 합성 공사에서 근무하다가 해고되었다.');

  // 요지 상자부터 주문 끝까지 드래그 — 사이의 제목·배지·안내·바로가기 글자와 닫힌 AI 정리는 빠지고 표지 안 원문만 남는다.
  await selectBetween(page, '[data-export="summary"]', '[data-export-title="주문"]');
  await page.getByRole('button', { name: '인용 형식 복사' }).click();
  await expect(page.getByRole('status')).toHaveText('인용 형식으로 복사했습니다.');
  const spanning = await clipboard(page);
  expect(spanning).toBe([
    '[관련 판결] 대법원 2020. 1. 5. 선고 2019두12345 판결',
    JUDGED,
    '',
    HEAD,
    '',
    '상고를 기각한다.\n상고비용은 원고가 부담한다.',
  ].join('\n'));
  for (const label of ['판결 전문', '주문청구취지', '공식 원문', '확인한 판결', 'AI 정리', '합성 저장 요약', '요지 ·']) expect(spanning).not.toContain(label);

  // 펼친 AI 정리를 드래그하면 AI 표시가 붙는다.
  await aiDetails.locator('summary').click();
  await selectBetween(page, '[data-export="quote"][data-export-title="AI 정리"]', '[data-export="quote"][data-export-title="AI 정리"]');
  await page.getByRole('button', { name: '인용 형식 복사' }).click();
  await expect(page.getByRole('status')).toContainText('AI 정리 부분이 섞여');
  expect(await clipboard(page)).toBe('[관련 판결] 대법원 2020. 1. 5. 선고 2019두12345 판결\n(AI 정리 · 판결문 원문 아님)\n합성 저장 요약 첫 줄\n합성 저장 요약 둘째 줄');
  await aiDetails.locator('summary').click();

  // 머리 표 — 표제와 값이 같은 행에 놓인다(전각 공백 간격이 격자 칸을 차지하면 한 칸씩 밀린다).
  const headRows = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-export-kind="head"] > .contents')).map((row) => {
      const cells = Array.from(row.children) as HTMLElement[];
      const label = cells[0].getBoundingClientRect();
      const value = cells[cells.length - 1].getBoundingClientRect();
      return { value: cells[cells.length - 1].textContent, sameRow: Math.abs(label.top - value.top) < 2, rightOfLabel: value.left > label.left };
    }),
  );
  expect(headRows.map((row) => row.value)).toEqual(['2019두12345 해고무효확인', '합성 주식회사', '소송대리인 변호사 합성', '합성 공사']);
  for (const row of headRows) expect(row, row.value ?? '').toMatchObject({ sameRow: true, rightOfLabel: true });

  await page.getByRole('button', { name: '선택 복사' }).click();
  const panel = page.getByRole('group', { name: '복사할 부분 고르기' });
  await expect(panel.getByText('AI 정리')).toHaveCount(0);
  await panel.getByText('사건 정보').click();
  await panel.getByText('이유', { exact: true }).click();
  await panel.getByText(SUMMARY_LABEL).click();
  await panel.getByRole('button', { name: '고른 부분 복사' }).click();
  const picked = await clipboard(page);
  expect(picked.startsWith('대    법    원\n\n사       건')).toBe(true);
  expect(picked).toContain('[주문]\n상고를 기각한다.');
  expect(picked).toContain('[청구취지]\n피고의 해고는 무효임을 확인한다.');
  expect(picked).not.toContain('[이유]');
  expect(picked).not.toContain('2. 판단');
  expect(picked).not.toContain('합성 해고무효확인\n');
  expect(picked).not.toContain('AI 정리');

  const [md] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '.md 내려받기' }).click()]);
  expect(md.suggestedFilename()).toBe('대법원_2019두12345.md');
  const mdText = await readFile(await md.path(), 'utf8');
  expect(mdText).toMatch(/^---\ntitle: "합성 해고무효확인"\ncourt: "대법원"\ndate: "2020-01-05"\ncase_number: "2019두12345"\nsource_url: null\npage_url: "[^"]+\/decisions\/bc_export_fixture"\ntext_kind: "원문"\nexported_at: "\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00"\n---\n/);
  expect(mdText).toContain('## 주문\n\n상고를 기각한다.');
  expect(mdText).toContain(`## 이유\n\n${REASON}`);
  expect(mdText.endsWith(`## ${SUMMARY_LABEL}\n\n${JUDGED}\n`)).toBe(true);
  expect(mdText).not.toContain('AI 정리');
  expect(mdText).not.toContain('합성 저장 요약');

  const [jsonl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '.jsonl 내려받기' }).click()]);
  expect(jsonl.suggestedFilename()).toBe('대법원_2019두12345.jsonl');
  const record = JSON.parse((await readFile(await jsonl.path(), 'utf8')).trim());
  expect(record.sections.map((s: { title: string }) => s.title)).toEqual(['머리', '주문', '청구취지', '이유']);
  expect(record.sections.filter((s: { text: string }) => s.text.includes('2. 판단'))).toHaveLength(1);
  expect(record.sections.every((s: { is_ai: boolean }) => s.is_ai === false)).toBe(true);
  expect(record.summary).toEqual({ label: SUMMARY_LABEL, text: JUDGED, is_ai: false });
  expect(record.text_kind).toBe('원문');

  // 고르기 패널은 위에서 연 채 그대로다 — 다시 누르면 닫히므로 열린 상태를 확인하고 잰다.
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(panel).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`export-bar mobile overflow px=${overflow}`);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('a judgment without an original has no 요지: AI text is labelled AI and never exported as summary', async ({ page }) => {
  await page.request.get('http://127.0.0.1:4319/control?fail=0');
  const errors = consoleErrors(page);
  await page.goto('/decisions/bc_export_noorig');
  await expect(page.getByText('정리본 · 원문 미확보')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'AI 정리 · 판결문 원문 아님' })).toBeVisible();
  await expect(page.locator('main > .layout-reading')).not.toContainText('판결요지');
  await expect(page.locator('[data-export="summary"]')).toHaveCount(0);

  const summaryButton = page.getByRole('button', { name: '요지 복사' });
  await expect(summaryButton).toBeDisabled();
  await expect(summaryButton).toHaveAttribute('title', '원문 요지가 없습니다');
  await expect(summaryButton).toHaveAccessibleDescription('요지 복사: 원문 요지가 없습니다');

  const [jsonl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '.jsonl 내려받기' }).click()]);
  expect(jsonl.suggestedFilename()).toBe('서울고등법원_2020누999.jsonl');
  const record = JSON.parse((await readFile(await jsonl.path(), 'utf8')).trim());
  expect(record.summary).toBeNull();
  expect(record.text_kind).toBe('정리본');
  expect(record.sections).toEqual([{ title: '서비스 내 정리본', text: '합성 AI 상세 정리 문단 '.repeat(10).trim(), is_ai: true }]);
  expect(JSON.stringify(record)).not.toContain('합성 AI 저장 요약');

  const [md] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '.md 내려받기' }).click()]);
  const mdText = await readFile(await md.path(), 'utf8');
  expect(mdText).toContain('## 서비스 내 정리본\n\n(AI 정리 · 판결문 원문 아님)\n\n합성 AI 상세 정리 문단');
  expect(mdText).not.toContain('합성 AI 저장 요약');
  expect(mdText).not.toContain('요지');
  expect(errors).toEqual([]);
});

test('a long 요지 is folded by height only — 요지 복사 still copies all of it, and 전부 보기 unfolds it', async ({ page }) => {
  await page.request.get('http://127.0.0.1:4319/control?fail=0');
  const errors = consoleErrors(page);
  await page.goto('/decisions/bc_export_long');
  const judged = `2. 판단\n${'원고에게 해고 사유가 있다고 보기 어렵다.\n'.repeat(40)}3. 결론\n상고를 기각한다.`;
  const toggle = page.getByRole('button', { name: '전부 보기' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  const box = page.locator('[data-export="summary"]').locator('..');
  const clipped = () => box.evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(await clipped()).toBeGreaterThan(100);

  await page.getByRole('button', { name: '요지 복사' }).click();
  await expect(page.getByRole('status')).toHaveText('요지를 복사했습니다.');
  expect(await clipboard(page)).toBe(`${SUMMARY_LABEL}\n${judged}`);

  await toggle.click();
  const fold = page.getByRole('button', { name: '접기' });
  await expect(fold).toHaveAttribute('aria-expanded', 'true');
  expect(await clipped()).toBe(0);
  await fold.click();
  await expect(page.getByRole('button', { name: '전부 보기' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the 요지 keeps line-end spaces and runs of blank lines exactly as in the original', async ({ page }) => {
  await page.request.get('http://127.0.0.1:4319/control?fail=0');
  const errors = consoleErrors(page);
  await page.goto('/decisions/bc_export_spacing');
  // 이유 원문(tests/fixtures/decisions-db.mjs)의 「2. 판단」부터 끝까지 — 줄 끝 공백과 빈 줄 셋을 고치지 않는다.
  const judged = '2. 판단   \n가.  원고에게 해고 사유가   있다고 보기 어렵다.  \n\n\n\n나. 그러므로 해고는 무효이다.\n3. 결론\n상고를 기각한다.';
  expect(await page.locator('[data-export="summary"]').evaluate((el) => el.textContent)).toBe(judged);

  await page.getByRole('button', { name: '요지 복사' }).click();
  await expect(page.getByRole('status')).toHaveText('요지를 복사했습니다.');
  expect(await clipboard(page)).toBe(`${SUMMARY_LABEL}\n${judged}`);

  const [jsonl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '.jsonl 내려받기' }).click()]);
  const record = JSON.parse((await readFile(await jsonl.path(), 'utf8')).trim());
  expect(record.summary).toEqual({ label: SUMMARY_LABEL, text: judged, is_ai: false });

  const [md] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '.md 내려받기' }).click()]);
  expect((await readFile(await md.path(), 'utf8')).endsWith(`## ${SUMMARY_LABEL}\n\n${judged}\n`)).toBe(true);
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
  expect(await clipboard(page)).toBe(`${SUMMARY_LABEL}\n${JUDGED}`);
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
