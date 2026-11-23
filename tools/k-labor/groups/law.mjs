/*! law 묶음 — 법제처 국가법령정보 Open API(DRF) 조회 도구 7개 + 판례 인용 대조 1개.
 * 도구 구성(법령 검색·별표서식·조문 연혁·판례·법령해석례)은 korean-law-mcp v2.1.6 을 참고해 노무 실무에 쓰는 것만 골랐다.
 *   korean-law-mcp — MIT License, Copyright (c) 2025 Chris — https://github.com/chrisryugj/korean-law-mcp
 *   (전문은 tools/k-labor/THIRD_PARTY_NOTICES.md)
 */
//   search_laws            법령 검색                      lawSearch.do  target=law
//   list_law_forms         별표·서식 목록과 파일 주소       lawSearch.do  target=licbyl
//   get_article_history    조문 하나의 개정 연혁           lawService.do target=lsJoHstInf
//   search_precedents      판례 검색                      lawSearch.do  target=prec
//   get_precedent          판례 본문                      lawService.do target=prec
//   search_interpretations 법령해석 검색(고용노동부·법제처) lawSearch.do  target=moelCgmExpc · expc
//   get_interpretation     법령해석 본문                   lawService.do target=moelCgmExpc · expc
//   check_citations        판례 인용 대조(글자 대조)       lib/cite-check.mjs — 법제처에는 사건번호만 보낸다(261123)
// 조문 원문·두 시점 비교는 work-rules 묶음의 get_law_article·compare_law_versions 가 맡는다(여기서 다시 만들지 않는다 — 법제처 신구조문대비 oldAndNew 도 그래서 뺐다).
// ★ OC 는 env LAW_OC 로만 받는다(lib/law-drf.mjs lawOc). 도구 인자로 받지 않는다.
// ★ 원격판(remote.mjs)에 싣지 않는다 — 법제처는 등록한 IP 만 받고 OC 가 이용자마다 달라, 원격판은 서버 OC 관리 방식을 정한 뒤에 연다.
// ★ 공개 문구 금지어(src/lib/tool-kit/banned.ts)와 포괄·대신·대행·대리는 이 묶음이 쓰는 글(설명·안내)에 쓰지 않는다.
//   판례·해석·법령 원문은 고치지 않고 그대로 싣는다 — 그런 칸은 LAW_OPEN_TEXT_FIELDS(smoke 가 금지어 시험에서 뺀다).
import { z } from 'zod';
import { argsLookLikeRrn, text } from '../lib/common.mjs';
import { articleKey, DrfError, normName, versionLink } from '../lib/law-drf.mjs';
import {
  OPEN_SOURCE, INTERP, joCode, precLink,
  searchLaws, searchPrecedents, fetchPrecedent, searchInterps, fetchInterp, searchAnnexes, fetchArticleHistory,
} from '../lib/law-open.mjs';
import { checkCitations, drfFetchBody, NOT_FOUND_NOTE, parseCitationBlocks, VERDICT } from '../lib/cite-check.mjs';

export const lawTools = [
  'search_laws', 'list_law_forms', 'get_article_history',
  'search_precedents', 'get_precedent', 'search_interpretations', 'get_interpretation',
  'check_citations',
];

const READ_ONLY_LIVE = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const fail = (error, extra = {}) => text({ ok: false, error, ...extra });
const RRN_STOP = '입력에 주민등록번호 모양의 숫자가 있어 멈췄습니다. 법제처에 보내지 않았습니다.';
const nowKst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16);
const src = () => `${OPEN_SOURCE} — ${nowKst()} KST 조회`;
const errMsg = (e) => (e instanceof DrfError ? e.message : `법제처 조회 중 오류: ${e instanceof Error ? e.name : 'error'}`);
const N = (max) => z.number().int().min(1).max(max);

/** 법령명 → 현행 법령 한 줄. 정확히 같은 이름(가운뎃점·공백 무시)이 없으면 후보 목록과 함께 null */
async function resolveLaw(name) {
  const r = await searchLaws({ query: name, display: 50 });
  const want = normName(name);
  const hit = r.rows.find((x) => normName(x.law) === want) ?? r.rows.find((x) => x.short && normName(x.short) === want);
  return { hit: hit ?? null, candidates: [...new Set(r.rows.map((x) => x.law))].slice(0, 10) };
}
const NOT_FOUND_LAW = '그 이름의 현행 법령을 법제처에서 찾지 못했습니다. 아래 이름 중 하나를 그대로 넣어 주세요.';

/** 본문이 길면 자른다 */
function cut(s, max) {
  if (!s || s.length <= max) return { text: s, cut: false };
  return { text: s.slice(0, max), cut: true };
}

export function registerLaw(server) {
  // ── 1. 법령 검색 ──
  server.registerTool(
    'search_laws',
    {
      title: '법령 검색(법제처 실시간)',
      description:
        '법령 이름(또는 본문 낱말)으로 현행 법령·시행령·시행규칙을 법제처 국가법령정보 Open API 에서 찾는다(env LAW_OC 필요). ' +
        '법령ID·판 번호(MST)·공포일·시행일·소관 부처를 준다. 조문 원문은 get_law_article(work-rules 묶음), 조문 연혁은 get_article_history, 별표·서식은 list_law_forms 로 이어 본다.',
      inputSchema: {
        query: z.string().min(1).max(100).describe('법령 이름 낱말(예: 근로기준법, 최저임금, 산업안전보건법 시행규칙)'),
        inText: z.boolean().optional().describe('true 면 법령 본문에서 찾는다(기본 false = 법령 이름)'),
        display: N(100).optional().describe('한 쪽에 실을 수(기본 20, 최대 100)'),
        page: N(1000).optional().describe('쪽 번호(기본 1)'),
      },
      annotations: READ_ONLY_LIVE,
    },
    async (a) => {
      if (argsLookLikeRrn(a)) return fail(RRN_STOP);
      try {
        const r = await searchLaws({ query: a.query, inText: a.inText, display: a.display ?? 20, pageNo: a.page ?? 1 });
        return text({
          ok: true,
          total: r.total,
          laws: r.rows.map((x) => ({ ...x, promulgated: x.promulgated, effective: x.effective, link: x.mst && x.effective ? versionLink(x.mst, x.effective) : null })),
          ...(r.total ? {} : { notice: '찾은 법령이 없습니다. 낱말을 줄이거나 inText: true 로 본문에서 찾아 보세요.' }),
          source: src(),
        });
      } catch (e) {
        return fail(errMsg(e));
      }
    },
  );

  // ── 2. 별표·서식 목록 ──
  server.registerTool(
    'list_law_forms',
    {
      title: '법령 별표·서식 목록(법제처 실시간)',
      description:
        '법령 하나에 딸린 별표·별지 서식 목록을 법제처 Open API 에서 받는다(env LAW_OC 필요). 항목마다 「별표 2」「별지 제8호서식」 표기, 제목, 공포일과 내려받을 파일 주소(한글 file·PDF pdf, 법제처 주소)를 준다. ' +
        '서식은 대개 시행규칙에 있으니 「근로기준법 시행규칙」처럼 넣는다. title 로 제목 낱말을 걸러 볼 수 있다.',
      inputSchema: {
        law: z.string().min(1).max(100).describe('법령 이름(예: 근로기준법 시행규칙, 고용보험법 시행규칙)'),
        kind: z.enum(['별표', '서식', '전체']).optional().describe('별표만·서식만·전체(기본 전체)'),
        title: z.string().max(50).optional().describe('제목에 이 낱말이 든 것만(예: 출산, 연장근로)'),
        limit: N(100).optional().describe('실을 수(기본 50)'),
      },
      annotations: READ_ONLY_LIVE,
    },
    async (a) => {
      if (argsLookLikeRrn(a)) return fail(RRN_STOP);
      const knd = a.kind === '별표' ? 1 : a.kind === '서식' ? 2 : undefined;
      try {
        const r = await searchAnnexes(a.law.trim(), knd);
        const want = normName(a.law);
        const own = r.rows.filter((x) => normName(x.law) === want);
        let rows = own.length ? own : r.rows;
        if (a.title) rows = rows.filter((x) => normName(x.title).includes(normName(a.title)));
        const limit = a.limit ?? 50;
        if (!r.rows.length) return text({ ok: true, total: 0, forms: [], notice: '찾은 별표·서식이 없습니다. 법령 이름을 정식 이름 그대로(시행령·시행규칙 포함) 넣어 주세요. search_laws 로 이름을 먼저 찾을 수 있습니다.', source: src() });
        return text({
          ok: true,
          total: rows.length,
          forms: rows.slice(0, limit),
          ...(own.length ? {} : { notice: `「${a.law}」와 이름이 똑같은 법령의 별표·서식은 없어, 법제처가 비슷하다고 준 목록을 그대로 실었습니다. law 칸을 확인해 주세요.` }),
          ...(rows.length > limit ? { truncated: `${rows.length}개 중 앞의 ${limit}개만 실었습니다. title 로 좁히거나 limit 을 늘리세요.` } : {}),
          ...(r.complete ? {} : { incomplete: `법제처 목록 ${r.total}개 중 ${r.rows.length}개까지만 받았습니다. kind 나 title 로 좁혀 주세요.` }),
          fileNote: '파일 주소는 법제처 국가법령정보센터의 내려받기 주소입니다. 서식은 받은 뒤 최신 판인지 공포일을 함께 확인합니다.',
          source: src(),
        });
      } catch (e) {
        return fail(errMsg(e));
      }
    },
  );

  // ── 3. 조문 연혁 ──
  server.registerTool(
    'get_article_history',
    {
      title: '조문 개정 연혁(법제처 실시간)',
      description:
        '법령의 조문 하나가 언제 어떤 개정으로 바뀌었는지(제정·조문변경 등) 판마다 공포일·시행일·판 번호를 법제처 Open API 에서 받는다(env LAW_OC 필요). 오래된 판부터 늘어놓는다. ' +
        '두 판 사이에 글자가 어떻게 바뀌었는지는 compare_law_versions(work-rules 묶음)에 그 시행일을 넣어 본다. 시행 예정 판도 함께 나온다.',
      inputSchema: {
        law: z.string().min(1).max(100).describe('법령 이름(예: 근로기준법)'),
        article: z.string().max(20).describe('조문 — 예: 제60조, 제76조의2, 60조'),
      },
      annotations: READ_ONLY_LIVE,
    },
    async (a) => {
      if (argsLookLikeRrn(a)) return fail(RRN_STOP);
      const key = articleKey(a.article);
      const jo = joCode(key);
      if (!jo) return fail('article 은 「제60조」「제76조의2」처럼 적어 주세요(별표는 연혁을 받지 못합니다).');
      try {
        const { hit, candidates } = await resolveLaw(a.law.trim());
        if (!hit) return text({ ok: false, error: NOT_FOUND_LAW, candidates });
        const h = await fetchArticleHistory(hit.lawId, jo);
        if (!h.rows.length) return text({ ok: true, law: hit.law, lawId: hit.lawId, article: key, history: [], notice: '법제처에 이 조문의 연혁이 없습니다. 조문 번호를 확인해 주세요.', source: src() });
        return text({ ok: true, law: h.law || hit.law, lawId: hit.lawId, article: key, count: h.rows.length, history: h.rows, source: src() });
      } catch (e) {
        return fail(errMsg(e));
      }
    },
  );

  // ── 4. 판례 검색 ──
  server.registerTool(
    'search_precedents',
    {
      title: '판례 검색(법제처 실시간)',
      description:
        '낱말·법원·사건번호로 판례를 법제처 국가법령정보 Open API 에서 찾는다(env LAW_OC 필요). 낱말은 기본으로 판례 본문에서 찾는다. 사건번호·사건명·법원·선고일·판례 번호(id)를 준다. 본문은 get_precedent 에 id 를 넣어 본다. ' +
        '법제처에 실린 판례만 나온다(대법원 판례가 중심이고 하급심 판결은 일부만 실린다. 노동위원회 결정은 이 도구로 찾지 않는다).',
      inputSchema: {
        query: z.string().max(100).optional().describe('찾을 낱말(예: 통상임금 재직조건, 부당해고 경영상 이유)'),
        caseNo: z.string().max(40).optional().describe('사건번호(예: 2023다216777)'),
        court: z.string().max(30).optional().describe('법원 이름(예: 대법원)'),
        nameOnly: z.boolean().optional().describe('true 면 사건명에서만 찾는다(기본 false = 본문)'),
        sort: z.enum(['date_desc', 'date_asc']).optional().describe('선고일 순서(기본 법제처 순서)'),
        display: N(100).optional().describe('한 쪽에 실을 수(기본 20)'),
        page: N(1000).optional().describe('쪽 번호(기본 1)'),
      },
      annotations: READ_ONLY_LIVE,
    },
    async (a) => {
      if (argsLookLikeRrn(a)) return fail(RRN_STOP);
      if (!a.query && !a.caseNo) return fail('query 나 caseNo 중 하나를 주세요.');
      try {
        const r = await searchPrecedents({
          query: a.query, caseNo: a.caseNo, court: a.court, nameOnly: a.nameOnly, display: a.display ?? 20, pageNo: a.page ?? 1,
          sort: a.sort === 'date_desc' ? 'ddes' : a.sort === 'date_asc' ? 'dasc' : undefined,
        });
        return text({
          ok: true,
          total: r.total,
          precedents: r.rows.map((x) => ({ ...x, link: x.id ? precLink(x.id) : null })),
          ...(r.total ? {} : { notice: '찾은 판례가 없습니다. 낱말을 줄이거나 바꿔 보세요.' }),
          source: src(),
        });
      } catch (e) {
        return fail(errMsg(e));
      }
    },
  );

  // ── 5. 판례 본문 ──
  server.registerTool(
    'get_precedent',
    {
      title: '판례 본문(법제처 실시간)',
      description:
        'search_precedents 의 판례 번호(id)로 판시사항·판결요지·참조조문·참조판례·전문을 법제처 Open API 에서 받는다(env LAW_OC 필요). 글자는 법제처 응답 그대로이고 줄바꿈 표시만 바꾼다. ' +
        '전문이 길면 maxChars 에서 자르고 truncated 로 알린다. 문서에 인용할 때는 link 의 법제처 화면과 대조한다.',
      inputSchema: {
        id: z.string().regex(/^\d{1,12}$/).describe('판례 번호(search_precedents 의 id)'),
        fullText: z.boolean().optional().describe('전문까지 싣기(기본 true)'),
        maxChars: z.number().int().min(1000).max(200_000).optional().describe('전문을 이 글자 수에서 자른다(기본 30000)'),
      },
      annotations: READ_ONLY_LIVE,
    },
    async (a) => {
      try {
        const p = await fetchPrecedent(a.id);
        if (!p) return fail('법제처가 이 번호의 판례 본문을 주지 않았습니다. id 를 확인해 주세요.');
        const max = a.maxChars ?? 30_000;
        const ft = a.fullText === false ? { text: undefined, cut: false } : cut(p.fullText, max);
        return text({
          ok: true,
          ...p,
          id: p.id ?? a.id,
          fullText: ft.text,
          link: precLink(a.id),
          ...(ft.cut ? { truncated: `전문 ${p.fullText.length}자 중 앞의 ${max}자만 실었습니다. maxChars 를 늘리거나 link 에서 봅니다.` } : {}),
          ...(p.fullText ? {} : a.fullText === false ? {} : { notice: '법제처 응답에 전문이 없습니다. link 의 화면이나 법원 사이트에서 확인해 주세요.' }),
          source: src(),
        });
      } catch (e) {
        return fail(errMsg(e));
      }
    },
  );

  const SOURCE_DESC = 'moel = 고용노동부 법령해석(행정해석, 기본) · moleg = 법제처 법령해석례';

  // ── 6. 법령해석 검색 ──
  server.registerTool(
    'search_interpretations',
    {
      title: '법령해석 검색 — 고용노동부·법제처(법제처 실시간)',
      description:
        '낱말로 법령해석을 법제처 국가법령정보 Open API 에서 찾는다(env LAW_OC 필요). source = moel 이면 고용노동부가 낸 법령해석(행정해석, 기본), moleg 이면 법제처 법령해석례. ' +
        '낱말은 기본으로 해석 본문에서 찾는다. 안건번호·안건명·해석 기관·해석일·번호(id)를 준다. 본문은 get_interpretation 에 같은 source 와 id 를 넣어 본다.',
      inputSchema: {
        query: z.string().min(1).max(100).describe('찾을 낱말(예: 연차 사용촉진, 휴게시간)'),
        source: z.enum(['moel', 'moleg']).optional().describe(SOURCE_DESC),
        nameOnly: z.boolean().optional().describe('true 면 안건명에서만 찾는다(기본 false = 본문)'),
        sort: z.enum(['date_desc', 'date_asc']).optional().describe('해석일 순서(기본 법제처 순서)'),
        display: N(100).optional().describe('한 쪽에 실을 수(기본 20)'),
        page: N(1000).optional().describe('쪽 번호(기본 1)'),
      },
      annotations: READ_ONLY_LIVE,
    },
    async (a) => {
      if (argsLookLikeRrn(a)) return fail(RRN_STOP);
      const source = a.source ?? 'moel';
      try {
        const r = await searchInterps(source, { query: a.query, nameOnly: a.nameOnly, display: a.display ?? 20, pageNo: a.page ?? 1, sort: a.sort === 'date_desc' ? 'ddes' : a.sort === 'date_asc' ? 'dasc' : undefined });
        return text({
          ok: true,
          source,
          sourceName: INTERP[source].label,
          total: r.total,
          interpretations: r.rows,
          ...(r.total ? {} : { notice: '찾은 해석이 없습니다. 낱말을 줄이거나 source 를 바꿔 보세요.' }),
          from: src(),
        });
      } catch (e) {
        return fail(errMsg(e));
      }
    },
  );

  // ── 7. 법령해석 본문 ──
  server.registerTool(
    'get_interpretation',
    {
      title: '법령해석 본문 — 고용노동부·법제처(법제처 실시간)',
      description:
        'search_interpretations 의 번호(id)로 질의요지·회답·이유를 법제처 Open API 에서 받는다(env LAW_OC 필요). source 는 검색할 때와 같게 준다. 글자는 법제처 응답 그대로다. ' +
        '해석은 그 뒤 법령 개정·판례로 달라질 수 있어 해석일을 함께 본다.',
      inputSchema: {
        id: z.string().regex(/^\d{1,12}$/).describe('해석 번호(search_interpretations 의 id)'),
        source: z.enum(['moel', 'moleg']).optional().describe(SOURCE_DESC),
      },
      annotations: READ_ONLY_LIVE,
    },
    async (a) => {
      const source = a.source ?? 'moel';
      try {
        const e = await fetchInterp(source, a.id);
        if (!e) return fail('법제처가 이 번호의 해석 본문을 주지 않았습니다. id 와 source 를 확인해 주세요.');
        return text({ ok: true, source, sourceName: INTERP[source].label, ...e, id: e.id ?? a.id, from: src() });
      } catch (err) {
        return fail(errMsg(err));
      }
    },
  );

  // ── 8. 판례 인용 대조 ──
  server.registerTool(
    'check_citations',
    {
      title: '판례 인용 대조(법제처 전문·붙여 넣은 전문)',
      description:
        '문서의 「[관련 판결] 법원 선고일 사건번호 판결」 블록마다 인용 조각이 그 판결 전문에 글자 그대로 있는지 대조한다. 공백·따옴표·문장부호 차이는 무시하고, 「(중략)」·「…」로 끊긴 조각은 따로 본다. ' +
        '전문은 bodies(사건번호 → 붙여 넣은 전문)를 먼저 쓰고, 없으면 법제처 Open API 에서 받는다(env LAW_OC 필요, 대법원 판결은 대부분 있고 하급심은 대부분 없다). 법제처에는 사건번호만 보낸다. ' +
        '결과 = 일치 · 근사(유사도 0.85 이상) · 불일치 · 전문 못 찾음 · 같은 사건번호의 다른 법원 판결만 있음 · 요약(대조 제외). 모델을 부르지 않는 글자 대조다.',
      inputSchema: {
        text: z.string().min(1).max(400_000).describe('대조할 문서 글(md 또는 평문). [관련 판결] 머리줄과 그 아래 인용 줄이 있어야 한다'),
        bodies: z.record(z.string().max(40), z.string().max(400_000)).optional().describe('붙여 넣은 판결 전문 — 사건번호(예: 2023구합12345) → 전문'),
      },
      annotations: READ_ONLY_LIVE,
    },
    async (a) => {
      if (argsLookLikeRrn(a)) return fail(RRN_STOP);
      try {
        if (!parseCitationBlocks(a.text).length) return fail('「[관련 판결] 법원 선고일 사건번호 판결」 머리줄을 찾지 못했습니다. 머리줄 아래에 인용 줄을 두어 주세요.');
        const r = await checkCitations(a.text, { bodies: a.bodies ?? {}, fetchBody: drfFetchBody });
        return text({
          ok: true,
          counts: r.counts,
          rows: r.rows,
          ...(r.counts[VERDICT.NOT_FOUND] ? { notice: NOT_FOUND_NOTE } : {}),
          source: src(),
        });
      } catch (err) {
        return fail(errMsg(err));
      }
    },
  );
}
