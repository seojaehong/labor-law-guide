import { test, expect } from '@playwright/test';
import index from '../../public/data/laws/index.json';
const event = index.events.find(e => e.date > '20261006')!;
test('calendar results, selection persistence, real selected downloads and mobile layout', async ({ page }) => {
 await page.clock.install({ time: new Date('2026-10-06T12:00:00Z') });
 await page.goto('/laws?view=all');
 await expect(page.getByRole('heading', { name: '노동관계법령 개정 현황' })).toBeVisible();
 await page.getByRole('checkbox', { name: `${event.short} ${event.date.slice(0,4)}. ${+event.date.slice(4,6)}. ${+event.date.slice(6)}. 개정 선택`, exact: true }).check();
 await expect(page.getByLabel('선택한 개정 내보내기')).toContainText('1건 선택');
 await page.getByLabel('개정 검색').fill('없는검색결과xyz');
 await expect(page.getByLabel('선택한 개정 내보내기')).toContainText('현재 결과 밖 1건 포함');
 await page.getByRole('button', { name: '선택한 항목 보기', exact: true }).click();
 await expect(page.locator('.lr-card')).toHaveCount(1);
 for (const [name, ext] of [['엑셀(.xlsx)', '.xlsx'], ['문서(.docx)', '.docx']]) {
   const downloaded = page.waitForEvent('download');
   await page.getByRole('button', { name, exact: true }).click();
   const file = await downloaded;
   expect(file.suggestedFilename()).toContain(ext);
   await file.saveAs(`test-results/selected-law${ext}`);
 }
 await page.getByRole('button', { name: '현재 결과로 돌아가기' }).click();
 await page.getByLabel('개정 검색').fill('');
 await page.getByRole('button', { name: '날짜로 보기', exact: true }).click();
 await expect(page.locator('.lr-cal-head h2')).toHaveText('2026년 10월');
 await expect(page).toHaveURL(/m=202610/);
 await page.getByRole('button', { name: '다음 달', exact: true }).click();
 await expect(page).toHaveURL(/m=202611/);
 for (const text of await page.locator('.lr-card .lr-date .d').allTextContents()) expect(text).toMatch(/^11\./);
 await page.setViewportSize({ width: 360, height: 800 });
 await page.screenshot({ path: 'test-results/laws-mobile.png', fullPage: true });
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
 await page.getByRole('button', { name: '선택 해제', exact: true }).click();
 await expect(page.getByLabel('선택한 개정 내보내기')).toHaveCount(0);
});
test('invalid dates normalize and legacy event return/back restores details', async ({page}) => {
 await page.goto(`/laws?view=all&event=${event.id}&utm_source=qa#${event.id}`);
 await expect(page.locator(`[id="${event.id}"]`)).toHaveAttribute('data-open','true');
 await page.getByRole('link', {name:'개정 목록 보기',exact:true}).click();
 await expect(page).not.toHaveURL(/event=/);
 await expect(page).toHaveURL(/utm_source=qa/);
 await page.goBack();
 await expect(page.locator(`[id="${event.id}"]`)).toHaveAttribute('data-open','true');
 await page.goto('/laws?mode=cal&m=202613&d=20260231');
 await expect(page.locator('.lr-cal-head h2')).not.toHaveText(/NaN/);
 await expect(page).not.toHaveURL(/202613|20260231/);
});
test('failed detail fetch retains selection, retries successfully, and repeated clicks download once', async ({page}) => {
 await page.goto('/laws?view=all');
 const label = `${event.short} ${event.date.slice(0,4)}. ${+event.date.slice(4,6)}. ${+event.date.slice(6)}. 개정 선택`;
 await page.getByRole('checkbox', {name:label,exact:true}).check();
 let attempts = 0;
 await page.route(`**/data/laws/${event.lawId}.json`, async route => {
   attempts++;
   if (attempts === 1) await route.fulfill({status:503,body:'temporary failure'});
   else { await new Promise(resolve => setTimeout(resolve, 250)); await route.continue(); }
 });
 await page.getByRole('button', {name:'엑셀(.xlsx)',exact:true}).click();
 await expect(page.locator('.lr-export-error')).toContainText('선택은 유지됩니다');
 await expect(page.getByLabel('선택한 개정 내보내기')).toContainText('1건 선택');
 let downloads = 0; page.on('download', () => downloads++);
 const done = page.waitForEvent('download');
 await page.getByRole('button', {name:'엑셀(.xlsx)',exact:true}).evaluate(el => { (el as HTMLButtonElement).click(); (el as HTMLButtonElement).click(); });
 await done;
 await expect(page.getByRole('button', {name:'엑셀(.xlsx)',exact:true})).toBeEnabled();
 expect(attempts).toBe(2); expect(downloads).toBe(1);
});

test('large export confirms exact scope and bytes; Escape/cancel preserve selection and confirmation downloads once', async ({page}) => {
 await page.goto('/laws?view=all');
 await page.getByRole('checkbox', {name:'현재 결과 401건 전체 선택',exact:true}).check();
 let downloads = 0; page.on('download', () => downloads++);
 await page.getByRole('button', {name:'문서(.docx)',exact:true}).click();
 const dialog = page.getByRole('dialog', {name:'분량이 큰 원문 파일입니다',exact:true});
 await expect(dialog).toBeVisible();
 await expect(dialog).toContainText('개정 401건');
 await expect(dialog).toContainText('실제 파일 크기');
 await expect(dialog).toContainText('바이트');
 await expect(dialog.getByRole('button',{name:'취소하고 선택 유지',exact:true})).toBeFocused();
 await page.keyboard.press('Shift+Tab');
 await expect(dialog.getByRole('button',{name:'원문 전체 내려받기',exact:true})).toBeFocused();
 await page.keyboard.press('Escape');
 await expect(dialog).toHaveCount(0);
 await expect(page.getByRole('button', {name:'문서(.docx)',exact:true})).toBeFocused();
 expect(downloads).toBe(0);
 await expect(page.getByLabel('선택한 개정 내보내기')).toContainText('401건 선택');
 await page.getByRole('button', {name:'문서(.docx)',exact:true}).click();
 await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'취소하고 선택 유지',exact:true}).click();
 expect(downloads).toBe(0);
 await page.getByRole('button', {name:'엑셀(.xlsx)',exact:true}).click();
 await expect(dialog).toBeVisible();
 await expect(dialog).toContainText('XLSX');
 const done=page.waitForEvent('download');
 await dialog.getByRole('button',{name:'원문 전체 내려받기',exact:true}).evaluate(el=>{(el as HTMLButtonElement).click();(el as HTMLButtonElement).click();});
 await done;
 await expect(dialog).toHaveCount(0);
 expect(downloads).toBe(1);
});
