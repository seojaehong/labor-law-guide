import { expect, test } from '@playwright/test';
import { REASON_LABELS } from '../../src/lib/types';
const rowLinks = (html:string) => [...html.matchAll(/<a[^>]*href="(\/decisions\/fixture-[^"]+)"/g)].map(m=>m[1]);
test('server HTML: all cards and enums, stable pages including NULL dates, q/legacy modes and metadata', async ({request}) => {
  await request.get('http://127.0.0.1:4319/control?fail=0');
  const hub=await (await request.get('/decisions')).text();
  expect(hub).toContain('href="/decisions?reason=no_dismissal"');expect(hub).toContain('45');
  expect(hub).toContain('name="robots" content="index, follow"');
  for (const [reason,label] of Object.entries(REASON_LABELS)) {
    const html=await (await request.get(`/decisions?reason=${reason}`)).text();
    expect(html).toContain(label);expect(rowLinks(html)).toHaveLength(20);
    expect(html).toContain(`href="/decisions?reason=${reason}&amp;page=2"`);
    expect(html).toContain('name="robots" content="noindex, follow"');
    expect(html).toMatch(/rel="canonical" href="https:\/\/[^"?]+\/decisions"/);
    expect(html).not.toContain('name="reason"');expect(html).not.toContain('name="page"');
  }
  const a=rowLinks(await (await request.get('/decisions?reason=no_dismissal')).text());
  const b=rowLinks(await (await request.get('/decisions?reason=no_dismissal&page=2')).text());
  const c=rowLinks(await (await request.get('/decisions?reason=no_dismissal&page=3')).text());
  expect(b).toHaveLength(20);expect(c).toHaveLength(5);expect(new Set([...a,...b,...c]).size).toBe(45);
  expect(c).toEqual(Array.from({length:5},(_,i)=>`/decisions/fixture-0${40+i}`));
  expect(rowLinks(await (await request.get('/decisions?q=성희롱')).text())).toHaveLength(20);
  expect(await (await request.get('/decisions?q=성희롱&tab=cases')).text()).toContain('href="/cases/fixture-000"');
  expect(await (await request.get('/decisions?q=성희롱&tab=admin')).text()).toContain('href="/interpretations/fixture-000"');
});
test('server HTML: invalid/mixed inputs, DB error and retry, successful empty results', async ({request}) => {
  await request.get('http://127.0.0.1:4319/control?fail=1');
  for (const query of ['reason=no_dismissal','q=성희롱']) {
    const html=await (await request.get(`/decisions?${query}`)).text();
    expect(html).toContain('판정례를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    expect(html).not.toContain('해당하는 결과가 없습니다.');expect(html).not.toContain('다음 →');
    expect(html).toContain(`href="/decisions?${new URLSearchParams(query)}"`);
  }
  expect(await (await request.get('/decisions?reason=constructor')).text()).toContain('지원하지 않는 유형입니다.');
  expect(await (await request.get('/decisions?reason=no_dismissal&q=해고')).text()).toContain('유형과 키워드 또는 다른 자료 종류를 함께 지정할 수 없습니다.');
  await request.get('http://127.0.0.1:4319/control?fail=0');
  expect(rowLinks(await (await request.get('/decisions?reason=no_dismissal')).text())).toHaveLength(20);
  expect(await (await request.get('/decisions?reason=no_dismissal&page=99')).text()).toContain('이 페이지에 결과가 없습니다.');
  expect(await (await request.get('/decisions?q=empty')).text()).toContain('해당하는 결과가 없습니다.');
});
