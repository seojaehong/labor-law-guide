import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bannedHits } from '@/lib/tool-kit/banned';
import { AI_PACKAGES } from '@/content/ai-tools';
import { REMOTE_TOOLS } from '../../tools/k-labor/remote.mjs';
import { nhisTools } from '../../tools/k-labor/groups/nhis.mjs';
import { popbillTools } from '../../tools/k-labor/groups/popbill.mjs';
import { contractTools } from '../../tools/k-labor/groups/contract.mjs';
import { calcTools } from '../../tools/k-labor/groups/calc.mjs';
import { leaveTools } from '../../tools/k-labor/groups/leave.mjs';
import { taxTools } from '../../tools/k-labor/groups/tax.mjs';
import { dutiesTools } from '../../tools/k-labor/groups/duties.mjs';
import { workRulesTools } from '../../tools/k-labor/groups/work-rules.mjs';
import { nosaTools } from '../../tools/k-labor/groups/nosa.mjs';
import { nosaRecordsTools } from '../../tools/k-labor/groups/nosa-records.mjs';
import { formsTools } from '../../tools/k-labor/groups/forms.mjs';
import { docsTools } from '../../tools/k-labor/groups/docs.mjs';
import { lawTools } from '../../tools/k-labor/groups/law.mjs';

// /howto/* — 도구 안내 정적 페이지(261119). 두 페이지가 공통 디자인(howto.css·howto.js)을 함께 쓴다.
const PAGES = ['gov-login', 'k-labor'];
const read = (slug: string) => readFileSync(join(process.cwd(), 'public/howto', slug, 'index.html'), 'utf8');
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');

describe('도구 안내 페이지', () => {
  it.each(PAGES)('%s — 공통 디자인 파일을 쓴다', (slug) => {
    const html = read(slug);
    expect(html).toContain('href="/howto/howto.css"');
    expect(html).toContain('src="/howto/howto.js"');
    expect(html).toContain(`<link rel="canonical" href="https://yellowenvelope.kr/howto/${slug}">`);
  });

  it.each(PAGES)('%s — 다른 도구 띠가 있고 자기 자신을 표시한다', (slug) => {
    const html = read(slug);
    for (const s of PAGES) expect(html).toContain(`href="/howto/${s}"`);
    expect(html).toContain(`<a href="/howto/${slug}" aria-current="page">`);
  });

  it.each(PAGES)('%s — 사이트 안 링크는 실제 주소다', (slug) => {
    const html = read(slug);
    const hrefs = [...html.matchAll(/href="(\/[^"#?]*)"/g)].map((m) => m[1]).filter((h) => h !== '/' && !h.startsWith('/howto/howto.'));
    for (const h of hrefs) {
      const ok = existsSync(join(process.cwd(), 'src/app', h, 'page.tsx')) || existsSync(join(process.cwd(), 'public', h, 'index.html'));
      expect(ok, h).toBe(true);
    }
  });

  it.each(PAGES)('%s — 목차의 #주소는 페이지 안에 있다', (slug) => {
    const html = read(slug);
    for (const [, id] of html.matchAll(/href="#([\w-]+)"/g)) expect(html, id).toContain(`id="${id}"`);
  });

  it.each(PAGES)('%s — 문구에 금지어가 없다', (slug) => {
    expect(bannedHits(text(read(slug)))).toEqual([]);
  });

  // 묶음별 도구 수는 숫자로 박지 않고 패키지 소스(tools/k-labor)에서 끌어온다.
  // 페이지는 npm 게시판 0.3.2 기준이다(저장소 HEAD 와 같다 — 게시 먼저, 병합 나중). 저장소에만 있고 아직 게시하지 않은 도구가 생기면 여기에 적는다.
  const UNPUBLISHED: Record<string, string[]> = {};
  const SOURCE: Record<string, string[]> = {
    nhis: nhisTools,
    popbill: popbillTools,
    contract: contractTools,
    calc: calcTools,
    leave: leaveTools,
    tax: taxTools,
    duties: dutiesTools,
    'work-rules': workRulesTools,
    nosa: [...nosaTools, ...nosaRecordsTools],
    forms: formsTools,
    docs: docsTools,
    law: lawTools,
  };
  const keys = () =>
    [...read('k-labor').matchAll(/data-g="([\w-]+)" data-n="(\d+)" data-r="(\d+)"/g)].map(([, g, n, r]) => ({ g, n: Number(n), r: Number(r) }));

  // 묶음 목록은 손으로 적지 않고 server.mjs 의 GROUPS 에서 읽는다 — 패키지에 묶음이 늘면 페이지·SOURCE 가 따라오지 않은 것을 잡는다
  const serverGroups = () => {
    const server = readFileSync(join(process.cwd(), 'tools/k-labor/server.mjs'), 'utf8');
    const body = server.slice(server.indexOf('const GROUPS = {'), server.indexOf('\n};', server.indexOf('const GROUPS = {')));
    return [...body.matchAll(/\n\s+'?([\w-]+)'?: \{ register/g)].map((m) => m[1]);
  };

  it('k-labor 묶음 키는 패키지 GROUPS 와 같은 순서·이름이다', () => {
    expect(serverGroups().length).toBeGreaterThan(0);
    expect(keys().map((k) => k.g)).toEqual(serverGroups());
    expect(Object.keys(SOURCE)).toEqual(serverGroups());
  });

  it('미게시 도구는 실제로 저장소 소스에 있는 이름이다', () => {
    for (const [g, names] of Object.entries(UNPUBLISHED)) for (const t of names) expect(SOURCE[g], `${g}/${t}`).toContain(t);
  });

  it.each(Object.keys(SOURCE))('k-labor %s — data-n·data-r·「도구 N개」가 패키지 소스와 맞는다', (g) => {
    const html = read('k-labor');
    const key = keys().find((k) => k.g === g)!;
    const published = SOURCE[g].filter((t) => !(UNPUBLISHED[g] ?? []).includes(t));
    const remote = published.filter((t) => REMOTE_TOOLS.includes(t));
    expect(key.n, 'data-n').toBe(published.length);
    expect(key.r, 'data-r').toBe(remote.length);
    expect(html).toContain(`--groups ${g} · 도구 ${key.n}개</span>`);
  });

  it('k-labor 히어로 숫자가 묶음 합과 같다', () => {
    const html = read('k-labor');
    const n = keys().reduce((s, k) => s + k.n, 0);
    const r = keys().reduce((s, k) => s + k.r, 0);
    expect(html).toContain(`<b>${n}개</b><span>${keys().length}개 묶음`);
    expect(html).toContain(`<b>${r}개</b>`);
    expect(r).toBe(REMOTE_TOOLS.length);
    expect(r).toBe(AI_PACKAGES.find((p) => p.id === 'k-labor')!.remoteTools);
  });

  it('k-labor 원격 도구 수는 본문 어디서나 같다', () => {
    const t = text(read('k-labor'));
    const said = [...t.matchAll(/(?:<dd>|도구 |계산·점검 도구 )(\d+)개(?: —|가 붙|만)/g)].map((m) => Number(m[1]));
    const dd = [...read('k-labor').matchAll(/<dd>(\d+)개 —/g)].map((m) => Number(m[1]));
    expect([...said, ...dd].length).toBeGreaterThanOrEqual(3);
    for (const n of [...said, ...dd]) expect(n).toBe(REMOTE_TOOLS.length);
  });

  it('k-labor 「묶음 이름」 안내에 모든 묶음이 있다', () => {
    const html = read('k-labor');
    const qa = /묶음 이름은 ([\s\S]*?)입니다\./.exec(html)![1];
    for (const g of serverGroups()) expect(qa, g).toContain(`<code>${g}</code>`);
  });

  it('next.config 가 /howto/:slug 를 정적 index.html 로 열고 /howto 는 도구 모음으로 보낸다', () => {
    const cfg = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8');
    expect(cfg).toContain("{ source: '/howto/:slug', destination: '/howto/:slug/index.html' }");
    expect(cfg).toMatch(/\{ source: '\/howto', destination: '\/gov-tools', permanent: false \}/);
  });
});
