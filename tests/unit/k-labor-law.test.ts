// law 묶음(법제처 Open API 조회) — 파서는 고정 응답(tests/fixtures/laws/drf-open, 실응답을 줄이고 OC 를 합성값으로 바꾼 것)으로,
// 도구는 등록 함수를 가짜 서버에 걸고 fetch 를 고정 응답으로 바꿔 부른다(네트워크 없음). 실제 법제처 호출은 smoke 가 LAW_OC 있을 때만.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  annexLabel, clean, isoDay, joCode, joLabel, LAW_OPEN_TEXT_FIELDS,
  parseAnnexSearch, parseArticleHistory, parseInterp, parseInterpSearch, parseLawSearch, parsePrec, parsePrecSearch,
} from '../../tools/k-labor/lib/law-open.mjs';
import { registerLaw, lawTools } from '../../tools/k-labor/groups/law.mjs';
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
import { docsTools } from '../../tools/k-labor/groups/docs.mjs';
import { REMOTE_TOOLS } from '../../tools/k-labor/remote.mjs';
import { bannedHits, RESULT_BANNED, SERVICE_BANNED } from '@/lib/tool-kit/banned';

const FIX = path.join(process.cwd(), 'tests/fixtures/laws/drf-open');
const fix = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
const SYN_OC = 'synthetic-smoke-oc';

describe('law 파서 — 고정 응답', () => {
  it('글자 다듬기: <br/> 줄바꿈, 영문 태그만 지우고 한글 꺾쇠 원문은 둔다', () => {
    expect(clean('가<br/>나<b>다</b> <신  설> <개정 2020. 1. 1.>&lt;')).toBe('가\n나다 <신  설> <개정 2020. 1. 1.><');
    expect(isoDay('2025.08.14')).toBe('2025-08-14');
    expect(isoDay('20150713')).toBe('2015-07-13');
  });

  it('조문 코드 6자리 왕복', () => {
    expect(joCode('제60조')).toBe('006000');
    expect(joCode('제76조의2')).toBe('007602');
    expect(joCode('별표 1')).toBeNull();
    expect(joLabel('004400')).toBe('제44조');
    expect(joLabel('007602')).toBe('제76조의2');
  });

  it('법령 검색 — 법령ID·판 번호, 상세링크(OC) 안 옮김', () => {
    const r = parseLawSearch(fix('law-search.json'));
    expect(r.rows[0]).toMatchObject({ lawId: '001872', mst: '285279', law: '근로기준법', kind: '법률', effective: '20261008' });
    expect(JSON.stringify(r)).not.toMatch(/OC=|lawService/);
  });

  it('판례 검색·본문', () => {
    const s = parsePrecSearch(fix('prec-search.json'));
    expect(s.rows.length).toBe(2);
    expect(s.rows[0]).toMatchObject({ id: '608505', caseNo: '2023다216777', court: '대법원', date: '2025-08-14' });
    expect(JSON.stringify(s)).not.toMatch(/OC=|lawService/);
    const p = parsePrec(fix('prec-608505.json'))!;
    expect(p.caseNo).toBe('2023다216777');
    expect(p.holdings.startsWith('[1] 통상임금의 개념')).toBe(true);
    expect(p.summary).toContain('근로기준법 시행령 제6조 제1항');
    expect(p.fullText.length).toBeGreaterThan(100);
    expect(p.holdings).not.toMatch(/<br/);
    expect(parsePrec(fix('not-found.json'))).toBeNull();
  });

  it('법령해석 — 고용노동부(moel)·법제처(moleg) 칸 이름이 달라도 같은 모양', () => {
    const m = parseInterpSearch(fix('moel-search.json'), 'moel');
    expect(m.total).toBeGreaterThan(0);
    expect(m.rows[0]).toMatchObject({ id: '15234', caseNo: '근로기준정책과-3084', agency: '고용노동부', date: '2015-07-13' });
    const e = parseInterpSearch(fix('expc-search.json'), 'moleg');
    expect(e.rows[0]).toMatchObject({ id: '325381', caseNo: '07-0039', agency: '법제처', asker: '노동부', date: '2007-04-06' });
    expect(JSON.stringify([m, e])).not.toMatch(/OC=|lawService/);
    const md = parseInterp(fix('moel-15234.json'), 'moel')!;
    expect(md.answer).toContain('「근로기준법」 제61조');
    expect(md.date).toBe('2015-07-13');
    const ed = parseInterp(fix('expc-325381.json'), 'moleg')!;
    expect(ed.reason.startsWith('○ 「근로기준법」 제59조 제1항')).toBe(true);
    expect(parseInterp(fix('not-found.json'), 'moel')).toBeNull();
  });

  it('별표·서식 — 별지 표기와 OC 없는 파일 주소', () => {
    expect(annexLabel('000800', '서식')).toBe('별지 제8호서식');
    expect(annexLabel('001002', '별표')).toBe('별표 10의2');
    expect(annexLabel('000300', '부칙서식')).toBe('부칙 별지 제3호서식');
    const r = parseAnnexSearch(fix('licbyl-search.json'));
    expect(r.rows[0]).toMatchObject({ law: '근로기준법 시행규칙', kind: '서식', label: '별지 제8호서식', promulgated: '2025-02-21' });
    expect(r.rows.every((x) => x.file?.startsWith('https://www.law.go.kr/LSW/flDownload.do?flSeq=') && x.pdf?.startsWith('https://www.law.go.kr/LSW/flDownload.do?flSeq='))).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/OC=|lawService/);
  });

  it('조문 연혁 — 오래된 판부터, 조문링크(OC) 대신 판 화면 주소', () => {
    const h = parseArticleHistory(fix('johst-001872-006000.json'));
    expect(h.law).toBe('근로기준법');
    expect(h.rows[0]).toMatchObject({ article: '제60조', changeReason: '제정', effective: '1997-03-13' });
    expect(h.rows.map((x) => x.effective)).toEqual([...h.rows.map((x) => x.effective)].sort());
    expect(h.rows.every((x) => x.link?.startsWith('https://www.law.go.kr/lsInfoP.do?lsiSeq='))).toBe(true);
    expect(JSON.stringify(h)).not.toMatch(/OC=|lawService/);
  });

  it('원문 칸 목록에 이 묶음이 쓰는 안내 칸은 없다', () => {
    for (const k of ['notice', 'error', 'source', 'from', 'truncated', 'incomplete', 'fileNote', 'sourceName']) expect(LAW_OPEN_TEXT_FIELDS).not.toContain(k);
  });
});

// ── 도구(가짜 서버 + fetch 고정 응답) ──
type Handler = (a: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
type Reg = { name: string; cfg: { title?: string; description?: string; inputSchema?: Record<string, { description?: string }>; annotations?: Record<string, boolean> }; handler: Handler };
function fakeServer() {
  const tools: Reg[] = [];
  return { tools, registerTool(name: string, cfg: Reg['cfg'], handler: Handler) { tools.push({ name, cfg, handler }); }, tool(name: string) { throw new Error(`server.tool() 금지: ${name}`); } };
}

const calls: Record<string, string>[] = [];
function routeFixture(u: URL): unknown {
  const p = Object.fromEntries(u.searchParams);
  calls.push(p);
  if (p.OC !== SYN_OC) return fix('../drf/auth-fail.json');
  const svc = u.pathname.endsWith('lawService.do');
  switch (p.target) {
    case 'law': return fix('law-search.json');
    case 'licbyl': return fix('licbyl-search.json');
    case 'lsJoHstInf': return fix('johst-001872-006000.json');
    case 'prec': return svc ? (p.ID === '608505' ? fix('prec-608505.json') : fix('not-found.json')) : fix('prec-search.json');
    case 'moelCgmExpc': return svc ? fix('moel-15234.json') : fix('moel-search.json');
    case 'expc': return svc ? fix('expc-325381.json') : fix('expc-search.json');
    default: return { LawSearch: { totalCnt: '0' } };
  }
}

describe('law 도구', () => {
  const env = { ...process.env };
  let tmp = '';
  beforeEach(() => {
    calls.length = 0;
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'k-labor-law-'));
    process.env.LAW_OC = SYN_OC;
    process.env.LLG_DRF_BASE = 'http://drf.invalid/DRF';
    vi.stubGlobal('fetch', async (input: string | URL) => {
      const body = JSON.stringify(routeFixture(new URL(String(input))));
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    process.env = { ...env };
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const reg = () => { const s = fakeServer(); registerLaw(s); return s.tools; };
  const run = async (name: string, a: Record<string, unknown>) => {
    const t = reg().find((x) => x.name === name)!;
    const out = (await t.handler(a)).content[0].text;
    expect(out).not.toContain(SYN_OC);
    expect(out).not.toMatch(/[?&]OC=|drf\.invalid/);
    return JSON.parse(out);
  };

  it('등록 이름 = lawTools 7개, 전부 읽기 전용·외부 조회 표시, 원격판에 없음', () => {
    const t = reg();
    expect(t.map((x) => x.name)).toEqual(lawTools);
    expect(lawTools.length).toBe(7);
    for (const x of t) expect(x.cfg.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: true });
    for (const n of lawTools) expect(REMOTE_TOOLS).not.toContain(n);
  });

  it('도구 이름이 다른 묶음과 겹치지 않는다(전 묶음을 한 서버에 켠다)', () => {
    const all = [...nhisTools, ...popbillTools, ...contractTools, ...calcTools, ...leaveTools, ...taxTools, ...dutiesTools, ...workRulesTools, ...nosaTools, ...nosaRecordsTools, ...docsTools, ...lawTools];
    expect(all.length).toBe(new Set(all).size);
  });

  it('설명·제목·입력 설명에 금지어가 없다', () => {
    const words = [...SERVICE_BANNED, ...RESULT_BANNED, '포괄'];
    for (const x of reg()) {
      const s = [x.cfg.title, x.cfg.description, ...Object.values(x.cfg.inputSchema ?? {}).map((v) => v?.description ?? '')].join('\n');
      expect(bannedHits(s, words), x.name).toEqual([]);
      expect(s, x.name).not.toMatch(/대신|대행|대리/);
    }
  });

  it('search_laws — 판 화면 주소를 붙인다', async () => {
    const r = await run('search_laws', { query: '근로기준법' });
    expect(r.ok).toBe(true);
    expect(r.laws[0].link).toBe('https://www.law.go.kr/lsInfoP.do?lsiSeq=285279&efYd=20261008');
    expect(calls[0]).toMatchObject({ target: 'law', type: 'JSON', search: '1' });
  });

  it('list_law_forms — 이름이 같은 법령만, 제목 거르기', async () => {
    const r = await run('list_law_forms', { law: '근로기준법 시행규칙', kind: '서식', title: '인가' });
    expect(r.ok).toBe(true);
    expect(r.forms.length).toBe(2);
    expect(r.forms.every((x: { title: string }) => x.title.includes('인가'))).toBe(true);
    expect(calls[0]).toMatchObject({ target: 'licbyl', knd: '2', search: '2' });
  });

  it('get_article_history — 법령명으로 ID 를 찾아 6자리 조문 코드로 부른다', async () => {
    const r = await run('get_article_history', { law: '근로기준법', article: '60조' });
    expect(r).toMatchObject({ ok: true, lawId: '001872', article: '제60조' });
    expect(r.history.length).toBe(4);
    expect(calls.map((c) => c.target)).toEqual(['law', 'lsJoHstInf']);
    expect(calls[1]).toMatchObject({ ID: '001872', JO: '006000' });
    const bad = await run('get_article_history', { law: '근로기준법', article: '별표 1' });
    expect(bad.ok).toBe(false);
    const none = await run('get_article_history', { law: '가상법', article: '제1조' });
    expect(none.ok).toBe(false);
    expect(Array.isArray(none.candidates)).toBe(true);
  });

  it('list_law_forms — 한 쪽 100개를 넘으면 쪽을 넘겨 모으고, 5쪽에서 멈추면 incomplete 로 알린다', async () => {
    const row = (i: number) => ({ 관련법령명: '가상법 시행규칙', 별표종류: '서식', 별표번호: String(i).padStart(4, '0') + '00', 별표명: `가상 서식 ${i}`, 별표서식파일링크: `/LSW/flDownload.do?flSeq=${i}` });
    const pageOf = (total: number) => (u: URL) => {
      const p = Number(u.searchParams.get('page'));
      const start = (p - 1) * 100;
      const n = Math.max(0, Math.min(100, total - start));
      return { licBylSearch: { totalCnt: String(total), licbyl: Array.from({ length: n }, (_, k) => row(start + k + 1)) } };
    };
    for (const [total, pages, complete] of [[150, 2, true], [700, 5, false]] as const) {
      calls.length = 0;
      const page = pageOf(total);
      vi.stubGlobal('fetch', async (input: string | URL) => {
        const u = new URL(String(input));
        calls.push(Object.fromEntries(u.searchParams));
        return new Response(JSON.stringify(page(u)), { status: 200 });
      });
      const r = await run('list_law_forms', { law: '가상법 시행규칙', limit: 100 });
      expect(calls.map((c) => c.page)).toEqual(Array.from({ length: pages }, (_, k) => String(k + 1)));
      expect(r.total).toBe(Math.min(total, pages * 100));
      expect(Boolean(r.incomplete)).toBe(!complete);
    }
  });

  it('search_precedents·get_precedent — 법제처 화면 주소, 없는 번호는 오류, 전문 자르기', async () => {
    const s = await run('search_precedents', { query: '통상임금', sort: 'date_desc' });
    expect(s.precedents[0].link).toBe('https://www.law.go.kr/LSW/precInfoP.do?precSeq=608505');
    expect(calls[0]).toMatchObject({ target: 'prec', sort: 'ddes', search: '2' });
    await run('search_precedents', { query: '통상임금', nameOnly: true });
    expect(calls[1]).toMatchObject({ target: 'prec', search: '1' });
    calls.length = 0;
    const p = await run('get_precedent', { id: '608505', maxChars: 1000 });
    expect(p.ok).toBe(true);
    expect(p.fullText.length).toBe(1000);
    expect(p.truncated).toMatch(/1000자/);
    const no = await run('get_precedent', { id: '1' });
    expect(no.ok).toBe(false);
    expect(no.error).toMatch(/일치하는 판례가 없습니다/);
    const neither = await run('search_precedents', {});
    expect(neither.ok).toBe(false);
  });

  it('search_interpretations·get_interpretation — 기본은 고용노동부, moleg 는 법제처', async () => {
    const m = await run('search_interpretations', { query: '연차' });
    expect(m).toMatchObject({ ok: true, source: 'moel', sourceName: '고용노동부 법령해석' });
    expect(calls[0]).toMatchObject({ target: 'moelCgmExpc', search: '2' });
    const e = await run('search_interpretations', { query: '연차', source: 'moleg' });
    expect(e.interpretations[0].id).toBe('325381');
    expect(calls[1].target).toBe('expc');
    const d = await run('get_interpretation', { id: '15234' });
    expect(d.answer).toContain('제61조');
  });

  it('주민번호 모양 입력은 법제처에 보내지 않는다', async () => {
    const r = await run('search_precedents', { query: '900101-1234568 해고' });
    expect(r.ok).toBe(false);
    expect(calls.length).toBe(0);
  });

  it('OC 가 없으면 LAW_OC 를 알려 주고 부르지 않는다', async () => {
    delete process.env.LAW_OC;
    vi.spyOn(os, 'homedir').mockReturnValue(tmp); // ~/.claude/.env 도 읽지 않게
    const r = await run('search_laws', { query: '근로기준법' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/LAW_OC/);
    expect(calls.length).toBe(0);
  });

  it('법제처가 OC 를 거절하면 그 문구를 오류로', async () => {
    process.env.LAW_OC = 'other-synthetic-oc';
    const t = reg().find((x) => x.name === 'search_laws')!;
    const out = JSON.parse((await t.handler({ query: '근로기준법' })).content[0].text);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/사용자 정보 검증에 실패/);
  });
});
