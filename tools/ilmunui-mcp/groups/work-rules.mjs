// work-rules 묶음 — 노동법 개정 목록 · 법령 조문 원문·판 비교(법제처 Open API) · 취업규칙 기간 점검 · 신고(변경신고) 서류.
// 사이트 /laws 의 자료(public/data/laws: 개정 이벤트·표준취업규칙 2026·매핑)와 점검 엔진(src/lib/laws/standard-check)을 그대로 묶는다.
// 같은 본문·같은 기간·같은 오늘이면 사이트 「취업규칙 점검」 창과 같은 항목이 나온다(묶을 때의 자료 기준).
// 묶은 자료 뒤에 공포된 개정·조문 원문은 법제처 국가법령정보 Open API(DRF, lib/law-drf.mjs)로 그때그때 받는다.
//   OC 는 env LAW_OC(기본값 없음). 없거나 법제처가 막으면 묶은 자료로만 답하고 그 사실을 응답에 적는다.
//   범위는 공인노무사법 시행령 [별표 1] 노동 관계 법령과 그 하위법령(scripts/laws/labor_laws.json·subordinate_laws.json).
// ★ 공개 문구 금지어(src/lib/tool-kit/banned.ts)와 「포괄」은 이 묶음이 쓰는 글(설명·상태·안내·서류)에 쓰지 않는다.
//   법령·개정 자료에서 옮겨 오는 글(법령명·조문 제목·조문 원문·개정 요지·매핑 설명·조문 문안)은 고치지 않고 그대로 싣는다 — 법령 원문 변조 금지.
//   그런 칸 이름은 LAW_TEXT_FIELDS 에 모았다(smoke 가 이 칸을 빼고 금지어를 본다).
// ★ 원격(HTTP)판에 실어도 되는 도구 = workRulesRemoteSafe(읽기 전용, 이 PC 의 파일을 건드리지 않는다).
//   법제처를 부르는 도구는 국내 리전(Vercel icn1)에서만 돈다 — 법제처가 해외 IP 를 막는다.
//   파일을 읽거나(check_work_rules_file) 쓰는(make_work_rules_report_forms) 도구는 로컬 전용.
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { periodCheck, splitArticles, STD_ASOF } from '@/lib/laws/standard-check';
import { ddayLabel, fmtDate, todayKST } from '@/lib/laws/format';
import { compareDocx } from '@/lib/laws/doc-io';
import { comparisonXlsx } from '@/lib/laws/comparison-xlsx';
import { comparisonQuoteLines, comparisonRows, isoDate, reportBlanks, reportDocs, reportErrors, sealsNeeded } from '@/lib/work-rules-report/forms';
import { formHwpx, formPdf } from '@/lib/work-rules-report/render';
import indexJson from '../../../public/data/laws/index.json';
import standardJson from '../../../public/data/laws/standard.json';
import rulesJson from '../../../public/data/laws/rules.json';
import laborLawsJson from '../../../scripts/laws/labor_laws.json';
import subordinateJson from '../../../scripts/laws/subordinate_laws.json';
import { looksLikeRrn, text } from '../lib/common.mjs';
import { readRulesFile } from '../lib/rules-file.mjs';
import {
  DRF_SOURCE, DrfError, articles as lawArticles, compareArticles, fetchLaw, findArticle, articleKey, latestVersion, lawInfo, normName,
  searchAll, versionAt, versionLink,
} from '../lib/law-drf.mjs';

export const workRulesTools = ['list_law_revisions', 'get_law_article', 'compare_law_versions', 'check_work_rules_revisions', 'check_work_rules_file', 'make_work_rules_report_forms'];
/** 원격(HTTP)판에 실어도 되는 도구 — 읽기 전용, 이 PC 의 파일을 건드리지 않는다(법제처 호출은 국내 리전에서만) */
export const workRulesRemoteSafe = ['list_law_revisions', 'get_law_article', 'compare_law_versions', 'check_work_rules_revisions'];
/** 이 PC 의 파일을 읽거나 쓰는 도구 — 원격판에서 뺀다 */
export const workRulesLocalOnly = ['check_work_rules_file', 'make_work_rules_report_forms'];
/** 법령·개정 자료에서 그대로 옮겨 싣는 칸 — 금지어 시험에서 뺀다(법령 원문 변조 금지) */
export const LAW_TEXT_FIELDS = [
  'law', 'short', 'headline', 'summary', 'changes', 'standard', 'topic', 'point', 'proposal', 'basis', 'article', 'before', 'after', 'note', 'label', 'rows',
  'articleTitle', 'articleText', 'candidates', 'laws',
];

const SITE = 'https://yellowenvelope.kr';
/** 읽기 전용이지만 법제처(외부)를 부를 수 있다 */
const READ_ONLY_LIVE = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const PORTAL = 'https://labor.moel.go.kr/minwonApply/minwonApply.do?searchGubun=3';

const IDX = indexJson;
const STD = standardJson.articles;
const ART93 = standardJson.art93 ?? [];
const RULES = rulesJson.rules;

// ── 법령 범위(공인노무사법 시행령 [별표 1] + 하위법령) ─────────────
/** 묶은 자료에 든 판 — `MST|시행일` */
const IN_DATA = new Set(IDX.events.flatMap((e) => (e.promulgations ?? []).map((p) => `${p.mst}|${e.date}`)));
const EVENT_AT = new Map(IDX.events.map((e) => [`${e.lawId}-${e.date}`, e]));
/** 범위 법령 — { name, lawId, short, names(비교용) } */
const SCOPE = (() => {
  const byName = new Map(IDX.laws.map((l) => [normName(l.name), l]));
  const out = [];
  for (const t of laborLawsJson.laws) {
    const hit = byName.get(normName(t.name)) ?? (t.aliases ?? []).map((a) => byName.get(normName(a))).find(Boolean);
    out.push({ name: t.name, lawId: hit?.lawId ?? null, short: hit?.short ?? null, names: [t.name, ...(t.aliases ?? []), hit?.short].filter(Boolean).map(normName) });
  }
  for (const s of subordinateJson.subordinates) {
    const hit = IDX.laws.find((l) => l.lawId === s.lawId);
    out.push({ name: s.name, lawId: s.lawId, short: hit?.short ?? null, names: [s.name, hit?.short].filter(Boolean).map(normName) });
  }
  for (const l of IDX.laws) if (!out.some((x) => x.lawId === l.lawId)) out.push({ name: l.name, lawId: l.lawId, short: l.short, names: [l.name, l.short].map(normName) });
  return out;
})();
const SCOPE_IDS = new Set([...SCOPE.map((s) => s.lawId), ...IDX.events.map((e) => e.lawId), ...subordinateJson.subordinates.map((s) => s.parentId)].filter(Boolean));
const SCOPE_LAW_NAMES = new Set(laborLawsJson.laws.flatMap((t) => [t.name, ...(t.aliases ?? [])]).map(normName));
/** 법제처 판이 범위 안인가 — 법령ID, 또는 별표 1 법률 이름 */
const inScope = (r) => SCOPE_IDS.has(r.lawId) || (r.kind === '법률' && SCOPE_LAW_NAMES.has(normName(r.law)));
/** 이름(정식·약칭·옛 이름) → 범위 법령 */
const scopeByName = (s) => SCOPE.find((x) => x.names.includes(normName(s))) ?? null;

/** 사이트 RulesCheck.FLOOR_NOTE 와 같은 글(smoke 가 사이트 소스와 같은지 본다) */
export const FLOOR_NOTE =
  '[확인] 이 문안은 법이 정한 최저 기준입니다. 회사 규정이 이미 이보다 유리하면 그대로 두십시오. '
  + '낮추면 근로기준법 제94조제1항 단서의 불이익 변경이 되어 과반수의 동의가 필요합니다.';
const DISCLAIMER =
  '1차 자동 대조 결과입니다. 낱말을 맞춰 본 것이라 법률 판단이 아닙니다. 기준은 고용노동부 표준취업규칙 2026(2026. 2. 배포) 일반 근로자용과 국가법령정보센터(법제처) 원문이며, 표준 조문과 법령의 연결은 자동 추출본이라 빠진 연결이 있을 수 있습니다.';
const PROCEDURE = '개정안 작성 → 근로자 과반수 의견 청취(불리한 변경은 동의) → 관할 지방고용노동관서에 변경신고 순서로 진행합니다. 신고 서류는 make_work_rules_report_forms 로 만들 수 있습니다.';

// 계약서 묶음과 같은 PDF 글꼴(나눔고딕 전체, OFL). 묶은 뒤에는 dist/server.mjs 하나라 here = dist/ 다.
const here = path.dirname(fileURLToPath(import.meta.url));
const PDF_FONT = 'NanumGothic-Regular.ttf';
const fontPath = () => (process.env.LLG_ROOT ? path.join(process.env.LLG_ROOT, 'public/fonts', PDF_FONT) : path.join(here, 'assets', PDF_FONT));

/** 오늘(KST, YYYYMMDD). 시험용으로 LLG_TODAY 를 주면 그날로 본다 */
function today() {
  const t = isoDate(process.env.LLG_TODAY);
  return t ? t.replace(/-/g, '') : todayKST();
}
const ymd = (s) => isoDate(s)?.replace(/-/g, '') ?? null;
const isoOf = (d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
const fail = (error, extra = {}) => text({ ok: false, error, ...extra });
const shiftYears = (d, n) => `${Number(d.slice(0, 4)) + n}${d.slice(4)}`;
function addDays(d, n) {
  const t = new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8)) + n * 86_400_000);
  return t.toISOString().slice(0, 10).replace(/-/g, '');
}
const isoOr = (d) => (d && /^\d{8}$/.test(d) ? isoOf(d) : d ?? null);
const nowKst = () => `${new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ')} KST`;
const whenOf = (d, t) => (d > t ? `시행 예정(${ddayLabel(d, t)})` : '시행');
/** 법제처 오류 → 사용자 글. DrfError 가 아닌 오류의 원문은 싣지 않는다(요청 주소에 OC 가 들어 있을 수 있다) */
const drfError = (e) => (e instanceof DrfError ? e.message : `법제처 조회 중 오류가 났습니다(${e instanceof Error ? e.name : 'error'}).`);

// ── 법제처 실시간(DRF) ─────────────────────────────────

/** 묶은 자료 생성일 7일 전부터 오늘까지 공포된 판 — 공포일 범위로 한 번에 받아 범위 법령만 남긴다 */
async function recentRows() {
  const t = today();
  const gen = IDX.generated.replace(/-/g, '');
  const start = [addDays(gen, -7), t].sort()[0];
  const r = await searchAll({ ancYd: `${start}~${t}` }, { maxPages: 15 });
  return { rows: r.rows.filter(inScope), window: `${isoOf(start)} ~ ${isoOf(t)} 공포분`, complete: r.complete };
}

/** 이름 → 찾을 법령. 범위 안이면 정식 이름·법령ID 로, 아니면 넣은 이름 그대로 */
function lawTarget(input) {
  const hit = scopeByName(input);
  return hit ? { name: hit.name, lawId: hit.lawId } : { name: String(input ?? '').trim(), lawId: null };
}

/** 법령 하나의 판 목록 — 이름으로 찾아(법제처 목록은 시행령·시행규칙이 섞인다) 그 법령 줄만 남긴다 */
async function lawRows(target, stopBefore) {
  const r = await searchAll({ query: target.name }, { stopBefore, maxPages: 5 });
  const want = normName(target.name);
  const rows = r.rows.filter((x) => (target.lawId ? x.lawId === target.lawId : normName(x.law) === want || (x.short && normName(x.short) === want)));
  return { rows, all: r.rows };
}

const verOut = (v) => ({
  mst: v.mst, effective: isoOr(v.effective), promulgated: isoOr(v.promulgated), promulgationNo: v.promulgationNo, revision: v.revision, status: v.status, link: versionLink(v.mst, v.effective),
});

/** 법령명·조문·날짜 → 그날 시행 중인 판의 조문 원문 */
async function articleAt(lawIn, articleIn, date) {
  const target = lawTarget(lawIn);
  if (!target.name) return { ok: false, error: '법령명(law)을 넣어 주세요.' };
  const { rows, all } = await lawRows(target, shiftYears(date, -3));
  if (!rows.length) {
    return { ok: false, error: '그 이름의 법령을 법제처에서 찾지 못했습니다. 아래 이름 중 하나를 그대로 넣어 주세요.', candidates: [...new Set(all.map((r) => r.law))].slice(0, 10) };
  }
  const v = versionAt(rows, date);
  if (!v) return { ok: false, error: `${isoOf(date)}에 시행 중인 판을 찾지 못했습니다.`, law: rows[0].law };
  const law = await fetchLaw(v.mst, v.effective);
  const info = lawInfo(law);
  const art = findArticle(lawArticles(law), articleIn);
  if (!art) return { ok: false, error: `이 판(${isoOf(v.effective)} 시행)에 ${articleKey(articleIn)}이(가) 없습니다.`, law: info.law || v.law, version: verOut(v) };
  return {
    ok: true,
    law: info.law || v.law,
    lawId: v.lawId,
    kind: v.kind,
    article: art.article,
    articleTitle: art.title,
    articleText: art.text,
    asOf: isoOf(date),
    version: verOut(v),
    source: `${DRF_SOURCE} — ${nowKst()} 조회. 글자는 법제처 응답 그대로입니다.`,
  };
}

// ── 개정 목록 ─────────────────────────────────────────

const promLine = (p) => `${p.kind ?? ''} 제${p.no}호(${p.date ? fmtDate(p.date) : '공포일 미상'} 공포)`.trim();
const LIVE_EVENT_SOURCE = '법제처 실시간 — 묶은 자료 뒤 공포분이라 개정 요지·취업규칙 연결이 아직 없습니다. 바뀐 조문은 compare_law_versions 로 봅니다.';

function eventOut(e, t, detail, livePromulgations) {
  return {
    id: e.id,
    date: isoOf(e.date),
    when: whenOf(e.date, t),
    law: e.law,
    level: e.level,
    kinds: e.kinds,
    headline: e.headline,
    counts: e.counts,
    workRules: e.rules.map((r) => ({ topic: r.topic, lawArticle: r.article, required: r.required, art93: r.art93 || null })),
    ...(detail ? { summary: e.summary, changes: e.changes.map((c) => `${c.article}${c.title ? `(${c.title})` : ''} ${c.kind}`) } : {}),
    ...(e.live ? { source: LIVE_EVENT_SOURCE, promulgations: e.promulgations.map(promLine) } : {}),
    ...(livePromulgations?.length ? { addedPromulgations: livePromulgations.map(promLine), addedNotice: '같은 시행일에 묶은 자료 뒤 공포된 판이 더 있습니다(법제처 실시간). 바뀐 조문은 compare_law_versions 로 봅니다.' } : {}),
    link: e.live ? versionLink(e.mst, e.date) : `${SITE}/laws#${encodeURIComponent(e.id)}`,
  };
}

/** 법제처 판 → 묶은 자료에 없는 것만, 시행일별로 묶어 새 개정(added)과 기존 개정에 붙을 공포(merged)로 나눈다 */
function liveMerge(rows) {
  const groups = new Map();
  for (const r of rows) {
    if (IN_DATA.has(`${r.mst}|${r.effective}`)) continue;
    const k = `${r.lawId}-${r.effective}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const added = [];
  const merged = new Map();
  for (const [k, g] of groups) {
    g.sort((x, y) => (y.promulgated ?? '').localeCompare(x.promulgated ?? ''));
    const proms = g.map((r) => ({ date: r.promulgated, no: r.promulgationNo, kind: r.revision, mst: r.mst }));
    if (EVENT_AT.has(k)) {
      merged.set(k, proms);
      continue;
    }
    added.push({
      id: k, lawId: g[0].lawId, law: g[0].law, short: g[0].short || g[0].law, level: g[0].kind, date: g[0].effective, mst: g[0].mst,
      kinds: [...new Set(g.map((r) => r.revision).filter(Boolean))], headline: null, summary: null, counts: null, changes: [], rules: [], promulgations: proms, live: true,
    });
  }
  return { added, merged };
}

// ── 기간 점검(사이트 /laws 「취업규칙 점검」 창과 같은 계산) ─────────────

const mine = (it) => it.user.map((u) => u.text).join('\n');
/** 근거 한 줄씩 — RulesCheck.basis 와 같다 */
function basisLines(it) {
  const lines = it.events.map(({ event: e, articles }) => `${e.short} ${articles.join('·')} (${fmtDate(e.date)} 시행)`);
  for (const v of it.verdicts) {
    const l = `${v.rule.law} ${v.rule.article} (${fmtDate(v.rule.effective)} 시행)`;
    if (!lines.some((x) => x.startsWith(`${v.rule.law} ${v.rule.article}`))) lines.push(l);
  }
  return lines;
}

/** 본문·기간 → 결과 객체(성공) 또는 { error } */
function periodResult({ body, lastRevised, asOf, includeOk }) {
  const from = ymd(lastRevised);
  const t = today();
  const to = asOf ? ymd(asOf) : t;
  if (!from) return { error: 'lastRevised(내 취업규칙 최종 개정일)는 YYYY-MM-DD 날짜입니다.' };
  if (!to) return { error: 'asOf(기준일)는 YYYY-MM-DD 날짜입니다.' };
  if (from >= to) return { error: '최종 개정일은 기준일보다 빨라야 합니다.' };
  const textIn = body ?? '';
  const user = splitArticles(textIn);
  const hasText = user.length > 0;
  if (textIn.trim() && !hasText) return { error: '조문을 인식하지 못했습니다. 제1조(제목)처럼 조문 번호가 줄 처음에 오도록 입력하세요. 이 본문은 점검하지 않았습니다.' };

  const result = periodCheck({ text: textIn, std: STD, events: IDX.events, rules: RULES, art93: ART93, from, to, today: t });
  const open = result.items.filter((i) => i.status !== '반영됨');
  const ok = result.items.filter((i) => i.status === '반영됨');
  const fixN = open.filter((i) => i.status === '고칠 것' || i.status === '조문 추가').length;
  const soonN = open.filter((i) => i.status === '시행 예정').length;
  const shown = (it) => (hasText ? (it.status === '반영됨' ? '문구 일치' : it.status) : it.verdicts.length ? '바꿀 문안' : '법령 확인');
  const item = (it) => ({
    status: shown(it),
    standard: `${it.std.no}(${it.std.title})`,
    standardKind: it.std.kind,
    events: it.events.map(({ event: e, articles }) => ({
      law: e.short,
      lawArticles: articles,
      date: isoOf(e.date),
      when: e.date > t ? `시행 예정(${ddayLabel(e.date, t)})` : '시행',
      link: `${SITE}/laws#${encodeURIComponent(e.id)}`,
    })),
    ...(hasText
      ? {
          current: it.user.length
            ? it.user.map((u) => u.no + (u.title ? `(${u.title})` : '')).join(', ')
            : it.verdicts.some((v) => v.where)
              ? `${[...new Set(it.verdicts.map((v) => v.where).filter(Boolean))].join(', ')} 안(조문 제목이 표준과 다름)`
              : '해당 조문 없음',
        }
      : {}),
    ...(it.status !== '반영됨'
      ? {
          rules: it.verdicts
            .filter((v) => v.status !== '반영됨')
            .map((v) => ({ topic: v.rule.topic, result: v.status, required: v.rule.required, effective: isoOf(v.rule.effective), oldWordsLeft: v.stale, point: v.rule.point })),
          proposal: it.proposal,
          proposalSource: it.proposal ? (it.proposalFrom === '매핑' ? '바뀐 조문 원문 대조 문안' : `표준취업규칙 2026 문안(${fmtDate(STD_ASOF)} 이전 시행분 반영)`) : '자동 문안이 없습니다. 바뀐 조문의 전후 비교(link)를 보고 반영 여부를 정하세요.',
        }
      : {}),
    basis: basisLines(it),
  });
  const reportChanges = open
    .filter((it) => it.proposal)
    .map((it) => ({
      article: it.user.length ? it.user.map((u) => u.no + (u.title ? `(${u.title})` : '')).join(', ') : `신설 — 표준취업규칙 ${it.std.no}(${it.std.title}) 관련`,
      before: hasText ? mine(it) : '',
      after: it.proposal,
      note: basisLines(it).join('\n'),
    }));
  return {
    ok: true,
    period: `${fmtDate(from)} 다음 날 ~ ${fmtDate(to)} 시행분`,
    today: isoOf(t),
    articlesRead: user.length,
    counts: hasText
      ? { '고칠 것': fixN, '시행 예정': soonN, '확인·선택': open.length - fixN - soonN, '문구 일치': ok.length }
      : { '바꿀 조문': fixN, '시행 예정': soonN, '확인·선택': open.length - fixN - soonN },
    ...(hasText ? {} : { notice: '취업규칙 본문 없이 기간만으로 모은 문안 묶음입니다.' }),
    ...(from < IDX.since ? { periodWarning: `${fmtDate(IDX.since)} 이전 개정은 아직 모으지 않았습니다. 그보다 오래된 취업규칙은 표준취업규칙 전체와 대조하는 것을 권합니다.` } : {}),
    items: [...open, ...(includeOk ? ok : [])].map(item),
    ...(ok.length && !includeOk ? { okHidden: `문구가 일치한 ${ok.length}건은 뺐습니다(includeOk: true 로 볼 수 있습니다).` } : {}),
    earlier: result.earlier.map(({ std: s, verdict: v }) => ({
      topic: v.rule.topic, law: `${v.rule.law} ${v.rule.article}`, effective: isoOf(v.rule.effective), current: v.where ?? s.title, oldWordsLeft: v.stale,
    })),
    ...(result.earlier.length ? { earlierNotice: '최종 개정일 이전에 시행됐는데 옛 문구가 남아 있는 개정입니다. 지난 개정 때 함께 고쳤어야 할 조문입니다.' } : {}),
    missing93: result.missing93.map((i) => ({ no: `제${i.no}호`, label: i.label })),
    ...(result.missing93.length ? { missing93Notice: '근로기준법 제93조 필수 기재 사항 중 관련 낱말이 안 보이는 호입니다. 상시 10명 이상 사업장은 이 사항을 취업규칙에 적어 신고해야 합니다. 낱말로만 찾은 1차 점검이라 다른 표현으로 적혀 있으면 무시하세요.' } : {}),
    missingRequired: result.missingRequired.map((s) => ({ standard: `${s.no}(${s.title})`, law: s.laws.slice(0, 3).map((l) => `${l.law} ${l.article}`).join(', ') })),
    ...(result.missingRequired.length ? { missingRequiredNotice: '표준취업규칙 [필수] 조문 중 짝을 못 찾은 것입니다(기간과 무관한 전체 점검). 조문 제목이 달라 못 찾았을 수도 있으니 같은 내용이 다른 조문에 있으면 무시하세요.' } : {}),
    proposalNotice: FLOOR_NOTE,
    reportChanges,
    reportChangesNotice: '신고 서류(make_work_rules_report_forms)의 changes 로 넘길 수 있는 모양입니다. 자동 문안은 「제○조」처럼 번호가 비어 있으니 회사 조문 번호·내용에 맞게 고친 뒤 쓰고, 근로자에게 불리한 변경이면 disadvantage: true 를 표시하세요.',
    disclaimer: DISCLAIMER,
    procedure: PROCEDURE,
    data: { generated: IDX.generated, since: isoOf(IDX.since) },
    site: `${SITE}/laws`,
  };
}

const PERIOD_INPUT = {
  lastRevised: z.string().describe('내 취업규칙 최종 개정일 YYYY-MM-DD — 이 날 다음 날부터 기준일까지 시행되는 개정을 본다'),
  asOf: z.string().optional().describe('기준일 YYYY-MM-DD(기본 오늘). 시행 예정분까지 보려면 그 날짜로'),
  includeOk: z.boolean().optional().describe('문구가 일치한 항목도 함께 보기(기본 false)'),
  refresh: z.boolean().optional().describe('묶은 자료 뒤에 공포된 개정을 법제처에서 다시 확인해 liveAdditions 로 함께 싣기(기본 false, LAW_OC 필요)'),
};

/** 기간 점검 결과에 법제처 실시간 확인을 붙인다 — 묶은 자료 뒤 공포분 중 (최종 개정일, 기준일] 에 시행되는 판 */
async function withLive(r, a) {
  if (!a.refresh) return r;
  const from = ymd(a.lastRevised);
  const to = a.asOf ? ymd(a.asOf) : today();
  const t = today();
  try {
    const live = await recentRows();
    const rows = live.rows
      .filter((x) => x.effective > from && x.effective <= to && !IN_DATA.has(`${x.mst}|${x.effective}`))
      .sort((x, y) => x.effective.localeCompare(y.effective) || x.law.localeCompare(y.law, 'ko'));
    return {
      ...r,
      liveAdditions: rows.map((x) => ({
        law: x.law, lawId: x.lawId, kind: x.kind, revision: x.revision, promulgated: isoOr(x.promulgated), promulgationNo: x.promulgationNo,
        effective: isoOf(x.effective), when: whenOf(x.effective, t), link: versionLink(x.mst, x.effective),
        compare: { law: x.law, dateA: isoOf(addDays(x.effective, -1)), dateB: isoOf(x.effective) },
      })),
      liveNotice: `${nowKst()} 법제처 실시간 확인(${live.window}). 위 자동 대조는 묶은 자료(${IDX.generated} 생성) 기준이라 liveAdditions 의 개정은 들어가지 않았습니다. 바뀐 조문은 compare 의 값으로 compare_law_versions 를 불러 보고, 내 취업규칙에 걸리는지 정하세요.${live.complete ? '' : ' 공포분이 많아 앞쪽만 확인했습니다.'}`,
    };
  } catch (e) {
    return { ...r, liveError: `${drfError(e)} 묶은 자료(${IDX.generated} 생성) 기준 결과만 실었습니다.` };
  }
}

// ── 신고 서류 ─────────────────────────────────────────

const FORM_FORMATS = ['pdf', 'hwpx', 'docx', 'xlsx'];
const safeName = (s) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');

export function registerWorkRules(server) {
  // ── 1. 노동법 개정 목록(읽기 전용) ──
  server.registerTool(
    'list_law_revisions',
    {
      title: '노동법 개정·시행 예정 목록',
      description:
        '기간(from~to, 양 끝 포함) 안에 시행되는 노동 관계 법령(법률 38개와 그 시행령·시행규칙 등) 개정을 시행일 순으로 돌려준다(사이트 /laws 개정 알림판과 같은 자료, 국가법령정보센터 원문 기준). ' +
        '기본으로 법제처 Open API 에서 묶은 자료 뒤에 공포된 판까지 다시 확인해 넣는다(live, env LAW_OC 필요 — 없거나 법제처가 막으면 묶은 자료로만 답하고 live.error 에 적는다). law 를 주면 그 법령의 판 목록을, 안 주면 최근 공포분을 본다. ' +
        '오늘보다 뒤면 「시행 예정(D-n)」. 각 개정에 취업규칙에 걸리는 주제(workRules)가 있으면 함께 싣는다(법제처 실시간으로 더한 개정에는 아직 없다). workRulesOnly: true 면 그런 개정만. ' +
        'detail: true 면 개정 요지(summary)와 바뀐 조문 목록(changes)도 싣는다. 법령명·요지는 원문을 고치지 않고 옮긴다.',
      inputSchema: {
        from: z.string().describe('시작일 YYYY-MM-DD'),
        to: z.string().optional().describe('끝일 YYYY-MM-DD(기본 오늘)'),
        law: z.string().optional().describe('법령명 일부(예: 근로기준법, 남녀고용평등법) — 시행령·시행규칙도 함께 걸린다'),
        workRulesOnly: z.boolean().optional().describe('취업규칙에 걸리는 개정만(기본 false)'),
        detail: z.boolean().optional().describe('개정 요지·바뀐 조문 목록까지(기본 false)'),
        live: z.boolean().optional().describe('법제처 실시간 확인(기본 true). false 면 묶은 자료만'),
        limit: z.number().int().positive().optional().describe('최대 건수(기본 100)'),
      },
      annotations: READ_ONLY_LIVE,
    },
    async (a) => {
      const from = ymd(a.from);
      const t = today();
      const to = a.to ? ymd(a.to) : t;
      if (!from || !to) return fail('from·to 는 YYYY-MM-DD 날짜입니다.');
      if (from > to) return fail('from 이 to 보다 늦습니다.');
      const q = normName(a.law);
      const hitLaw = (name) => !q || normName(name).includes(q);

      // 법제처 실시간 — 법령을 좁혔으면 그 법령들의 판 목록(6개까지), 아니면 묶은 자료 뒤 공포분
      let live = { ok: false, error: '법제처 실시간 확인을 끄고(live: false) 묶은 자료만 봤습니다.' };
      let added = [];
      let merged = new Map();
      if (a.live !== false) {
        try {
          const targets = q ? SCOPE.filter((s) => s.names.some((n) => n.includes(q))) : [];
          let rows = [];
          let how;
          if (targets.length && targets.length <= 6) {
            for (const tg of targets) rows.push(...(await lawRows(tg, shiftYears(from, -3))).rows);
            how = { mode: '법령별 판 목록', laws: targets.map((x) => x.name) };
          } else {
            const r = await recentRows();
            rows = r.rows.filter((x) => hitLaw(x.law) || hitLaw(x.short));
            how = { mode: '묶은 자료 뒤 공포분', window: r.window, ...(r.complete ? {} : { incomplete: '공포분이 많아 앞쪽만 확인했습니다. law 로 좁혀 다시 부르세요.' }) };
          }
          ({ added, merged } = liveMerge(rows.filter((x) => x.effective >= from && x.effective <= to)));
          live = { ok: true, checkedAt: nowKst(), ...how, added: added.length, addedToExisting: merged.size };
        } catch (e) {
          live = { ok: false, error: `${drfError(e)} 묶은 자료(${IDX.generated} 생성)로만 답했습니다.` };
        }
      }

      const all = [...IDX.events.filter((e) => e.date >= from && e.date <= to).filter((e) => hitLaw(e.law) || hitLaw(e.short)), ...added]
        .filter((e) => !a.workRulesOnly || e.rules.length > 0)
        .sort((x, y) => x.date.localeCompare(y.date) || x.law.localeCompare(y.law, 'ko'));
      const limit = a.limit ?? 100;
      return text({
        ok: true,
        period: `${fmtDate(from)} ~ ${fmtDate(to)} 시행분`,
        today: isoOf(t),
        count: all.length,
        upcoming: all.filter((e) => e.date > t).length,
        ...(all.length > limit ? { truncated: `${all.length}건 중 앞의 ${limit}건만 실었습니다. 기간을 좁히거나 law·workRulesOnly 로 거르세요.` } : {}),
        ...(from < IDX.since ? { periodWarning: `${fmtDate(IDX.since)} 이전 개정은 아직 모으지 않았습니다.` } : {}),
        events: all.slice(0, limit).map((e) => eventOut(e, t, a.detail, merged.get(e.id))),
        source: live.ok ? '묶은 자료 + 법제처 실시간 확인' : '묶은 자료',
        live,
        ...(live.ok && a.workRulesOnly && added.length ? { liveNotice: '법제처 실시간으로 더한 개정은 취업규칙 연결이 아직 없어 workRulesOnly 에서 빠졌습니다.' } : {}),
        data: { generated: IDX.generated, since: isoOf(IDX.since), source: '국가법령정보센터(법제처) 원문 — 법령 검수 전 참고 자료' },
        site: `${SITE}/laws`,
      });
    },
  );

  // ── 1-1. 법령 조문 원문(법제처 실시간, 읽기 전용) ──
  server.registerTool(
    'get_law_article',
    {
      title: '법령 조문 원문(법제처 실시간)',
      description:
        '법령명과 조문 번호로, 그날 시행 중인 판의 조문 원문을 법제처 국가법령정보 Open API 에서 받아 그대로 돌려준다(env LAW_OC 필요). ' +
        'date 를 시행 예정일로 주면 시행 예정 판의 문안을 본다. 법령명은 정식 이름이나 사이트 약칭(예: 남녀고용평등법)으로 넣고, 못 찾으면 비슷한 이름 목록(candidates)을 돌려준다. ' +
        '취업규칙 신·구 조문 대비표에 법령 조문을 인용할 때 쓰는 원문이다.',
      inputSchema: {
        law: z.string().describe('법령명(예: 근로기준법, 근로기준법 시행령)'),
        article: z.string().describe('조문 — 예: 제60조, 제76조의2, 60조, 별표 1'),
        date: z.string().optional().describe('이 날 시행 중인 판 YYYY-MM-DD(기본 오늘)'),
      },
      annotations: READ_ONLY_LIVE,
    },
    async (a) => {
      const date = a.date ? ymd(a.date) : today();
      if (!date) return fail('date 는 YYYY-MM-DD 날짜입니다.');
      if (!articleKey(a.article)) return fail('article 은 「제60조」「제76조의2」「별표 1」처럼 적어 주세요.');
      try {
        return text(await articleAt(a.law, a.article, date));
      } catch (e) {
        return fail(drfError(e));
      }
    },
  );

  // ── 1-2. 법령 두 판 비교(법제처 실시간, 읽기 전용) ──
  server.registerTool(
    'compare_law_versions',
    {
      title: '법령 두 시점 조문 비교(법제처 실시간)',
      description:
        '법령 하나의 두 시점(dateA·dateB)에 시행 중인 판 전문을 법제처 Open API 에서 받아 조문 단위로 글자를 비교한다(env LAW_OC 필요). 바뀐 조문마다 신설·개정·삭제와 개정 전·후 원문을 준다. ' +
        '법제처 본문의 「조문변경여부」 표시는 새로 생긴 조문을 놓쳐서 쓰지 않고 전문을 직접 비교한다. 별표도 비교한다. dateB 를 비우면 가장 늦은 시행일 판(시행 예정 포함)과 비교한다. ' +
        'list_law_revisions·check_work_rules_revisions 가 법제처 실시간으로 더한 개정의 바뀐 조문을 볼 때 쓴다.',
      inputSchema: {
        law: z.string().describe('법령명(예: 근로기준법)'),
        dateA: z.string().describe('앞 시점 YYYY-MM-DD — 이 날 시행 중인 판이 비교 기준'),
        dateB: z.string().optional().describe('뒤 시점 YYYY-MM-DD(기본: 가장 늦은 시행일 판, 시행 예정 포함)'),
        article: z.string().optional().describe('이 조문만 보기(예: 제60조)'),
        limit: z.number().int().positive().optional().describe('실을 조문 수(기본 30)'),
      },
      annotations: READ_ONLY_LIVE,
    },
    async (a) => {
      const A = ymd(a.dateA);
      const B = a.dateB ? ymd(a.dateB) : null;
      if (!A || (a.dateB && !B)) return fail('dateA·dateB 는 YYYY-MM-DD 날짜입니다.');
      if (B && B <= A) return fail('dateB 는 dateA 보다 늦어야 합니다.');
      if (a.article && !articleKey(a.article)) return fail('article 은 「제60조」「제76조의2」「별표 1」처럼 적어 주세요.');
      try {
        const target = lawTarget(a.law);
        const { rows, all } = await lawRows(target, shiftYears(A, -3));
        if (!rows.length) return text({ ok: false, error: '그 이름의 법령을 법제처에서 찾지 못했습니다. 아래 이름 중 하나를 그대로 넣어 주세요.', candidates: [...new Set(all.map((r) => r.law))].slice(0, 10) });
        const vA = versionAt(rows, A);
        const vB = B ? versionAt(rows, B) : latestVersion(rows);
        if (!vA) return fail(`${isoOf(A)}에 시행 중인 판을 찾지 못했습니다.`);
        const between = rows
          .filter((r) => r.effective > vA.effective && r.effective <= vB.effective)
          .sort((x, y) => x.effective.localeCompare(y.effective) || (x.promulgated ?? '').localeCompare(y.promulgated ?? ''))
          .map(verOut);
        const head = { ok: true, law: vA.law, lawId: vA.lawId, from: verOut(vA), to: verOut(vB), between };
        if (vA.mst === vB.mst && vA.effective === vB.effective) return text({ ...head, counts: { 신설: 0, 개정: 0, 삭제: 0 }, changes: [], notice: '두 날짜에 시행 중인 판이 같습니다.' });
        const [la, lb] = [await fetchLaw(vA.mst, vA.effective), await fetchLaw(vB.mst, vB.effective)];
        let changes = compareArticles(lawArticles(la), lawArticles(lb));
        if (a.article) changes = changes.filter((c) => c.article === articleKey(a.article));
        const limit = a.limit ?? 30;
        return text({
          ...head,
          counts: Object.fromEntries(['신설', '개정', '삭제'].map((k) => [k, changes.filter((c) => c.kind === k).length])),
          changes: changes.slice(0, limit).map(({ article, articleTitle, kind, before, after }) => ({ article, articleTitle, kind, before, after })),
          ...(changes.length > limit ? { truncated: `바뀐 조문 ${changes.length}개 중 앞의 ${limit}개만 실었습니다. article 로 좁히거나 limit 을 늘리세요.` } : {}),
          method: '두 판의 전문을 조문키 단위로 글자 비교했습니다. 조문 번호가 옮겨진 경우는 삭제·신설로 나옵니다. 글자는 법제처 응답 그대로입니다.',
          source: `${DRF_SOURCE} — ${nowKst()} 조회`,
        });
      } catch (e) {
        return fail(drfError(e));
      }
    },
  );

  // ── 2. 취업규칙 기간 점검 — 본문 글자(읽기 전용, 원격 가능) ──
  server.registerTool(
    'check_work_rules_revisions',
    {
      title: '취업규칙 개정 법령 반영 점검',
      description:
        '취업규칙 본문(글자)과 최종 개정일·기준일을 받아, 그 사이 시행되는 노동법 개정이 내 조문에 반영됐는지 표준취업규칙 2026 조문에 짝지어 대조한다(사이트 /laws 「취업규칙 점검」 창과 같은 엔진·자료). ' +
        '항목 상태: 고칠 것(이미 시행됐는데 반영 안 됨) · 조문 추가(해당 조문 없음) · 시행 예정(시행일 전) · 선택 · 법령 확인 · 문구 일치. 각 항목에 근거 법령·시행일, 남은 옛 문구, 바꿀 문안(최저 기준), 제93조 필수 기재 낱말 확인, 신고 서류용 신·구 대조(reportChanges)를 함께 준다. ' +
        '본문을 비우면 기간 안 개정의 바꿀 문안만 모은다. 대조는 묶은 자료 기준이고, refresh: true 면 그 뒤에 공포된 개정을 법제처 Open API 에서 다시 확인해 liveAdditions 로 따로 싣는다(env LAW_OC 필요, 날짜로만 묻고 본문은 보내지 않는다). ' +
        '본문은 이 PC 밖으로 나가지 않는다. 파일이면 check_work_rules_file.',
      inputSchema: {
        text: z.string().optional().describe('취업규칙 본문. 「제N조(제목)」이 줄 처음에 오게(한글·워드에서 복사). 비우면 문안 묶음만'),
        ...PERIOD_INPUT,
      },
      annotations: READ_ONLY_LIVE,
    },
    async (a) => {
      if (looksLikeRrn(a.text ?? '')) return fail('본문에 주민등록번호 모양의 숫자가 있어 점검하지 않았습니다. 지우고 다시 넣어 주세요.');
      const r = periodResult({ body: a.text, lastRevised: a.lastRevised, asOf: a.asOf, includeOk: a.includeOk });
      return r.error ? fail(r.error) : text(await withLive(r, a));
    },
  );

  // ── 2-1. 취업규칙 기간 점검 — 파일(읽기 전용, 로컬 전용) ──
  server.registerTool(
    'check_work_rules_file',
    {
      title: '취업규칙 파일 개정 법령 반영 점검(로컬 전용)',
      description:
        '이 PC 의 취업규칙 파일(hwp·hwpx·docx·pdf·txt)을 읽어 check_work_rules_revisions 와 같은 대조를 한다. 사이트 화면과 같은 추출기(hwp = rhwp, pdf = pdf.js)를 쓴다. ' +
        '스캔(그림뿐인) pdf 쪽은 읽지 않고 알린다. refresh 도 같다(날짜로만 법제처를 부른다). 파일은 이 PC 밖으로 나가지 않는다.',
      inputSchema: {
        filePath: z.string().describe('취업규칙 파일 경로(10MB 이하)'),
        ...PERIOD_INPUT,
      },
      annotations: READ_ONLY_LIVE,
    },
    async (a) => {
      let f;
      try {
        f = await readRulesFile(a.filePath);
      } catch (e) {
        return fail(`파일을 읽지 못했습니다: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (looksLikeRrn(f.text)) return fail('본문에 주민등록번호 모양의 숫자가 있어 점검하지 않았습니다.');
      const r = periodResult({ body: f.text, lastRevised: a.lastRevised, asOf: a.asOf, includeOk: a.includeOk });
      if (r.error) return fail(r.error);
      return text({ ...(await withLive(r, a)), file: { kind: f.kind, bytes: f.bytes, chars: f.text.length }, ...(f.kind === 'pdf' ? { pdfNotice: 'PDF 에서 읽은 본문은 글자 순서가 섞여 대조가 틀릴 수 있습니다. 한글·워드 원본을 권합니다.' } : {}) });
    },
  );

  // ── 3. 신고(변경신고) 서류 만들기(쓰기, 로컬 전용) ──
  const changeShape = z.object({
    article: z.string().describe('조문 — 예: 제40조(배우자 출산휴가)'),
    before: z.string().optional().describe('현행 문안(비면 신설)'),
    after: z.string().optional().describe('개정안 문안(비면 삭제)'),
    note: z.string().optional().describe('비고 — 개정 사유·근거 법령'),
    disadvantage: z.boolean().optional().describe('근로자에게 불리한 변경이면 true(동의서를 함께 만든다)'),
    lawRef: z.object({
      law: z.string().describe('법령명(예: 근로기준법)'),
      article: z.string().describe('조문(예: 제60조)'),
      date: z.string().optional().describe('이 날 시행 중인 판 YYYY-MM-DD(기본 작성일)'),
    }).optional().describe('대비표 아래에 근거 법령 조문 원문을 싣는다 — 법제처 Open API 에서 받은 글자 그대로(env LAW_OC 필요)'),
  });
  server.registerTool(
    'make_work_rules_report_forms',
    {
      title: '취업규칙 신고 서류 만들기(로컬 전용)',
      description:
        '취업규칙 신고·변경신고에 내는 서류를 outDir 에 PDF·한글(hwpx)로 만든다: ① 신고서(근로기준법 시행규칙 별지 제15호서식) ② 신·구 조문 대비표(변경신고만, docx·xlsx 도) ③ 의견청취서(근로기준법 제94조 제1항) ④ 불리한 변경 동의서(changes 에 disadvantage 가 있을 때만, 같은 항 단서). ' +
        '과반수 노동조합(majorityUnion)이 있으면 노동조합 의견서·동의서로, 없으면 근로자 서명 명단(빈 줄)으로 만든다. 사업장명·사업의 종류·대표자·사업자등록번호·소재지·전화·근로자수(남·여)·노동조합원수·의견청취일·제출 관서가 비면 만들지 않고 빈 칸 목록을 돌려준다. ' +
        '작성일은 기본 오늘. 서명·날인 칸은 비워 둔다. 이미 있는 파일은 덮어쓰지 않는다. 제출은 사용자가 고용노동부 노동포털이나 관할 지방고용노동관서에 한다. 주민등록번호는 받지 않는다. ' +
        'changes 에 lawRef 를 주면 그 법령 조문 원문을 법제처 Open API 에서 받아 대비표 아래 「근거 법령 원문」에 글자 그대로 싣고 비고에서 가리킨다(받지 못하면 싣지 않고 warnings 에 적는다).',
      inputSchema: {
        kind: z.enum(['new', 'change']).describe('new = 최초 신고 · change = 변경신고'),
        workplace: z.object({
          name: z.string().optional().describe('사업장명'),
          businessType: z.string().optional().describe('사업의 종류(예: 소프트웨어 개발업)'),
          ownerName: z.string().optional().describe('대표자 성명'),
          bizNo: z.string().optional().describe('사업자등록번호 10자리'),
          address: z.string().optional().describe('소재지'),
          tel: z.string().optional().describe('전화번호'),
          workers: z.number().int().optional().describe('근로자수(상시)'),
          male: z.number().int().optional().describe('남성 근로자 수'),
          female: z.number().int().optional().describe('여성 근로자 수'),
          unionMembers: z.number().int().optional().describe('노동조합원수(노동조합이 없으면 0)'),
        }).describe('신고 내용'),
        opinionDate: z.string().optional().describe('의견청취일 또는 동의일 YYYY-MM-DD'),
        office: z.string().optional().describe('제출할 지방고용노동관서 — 예: 서울지방고용노동청 서울강남지청'),
        writtenDate: z.string().optional().describe('신고서 작성일 YYYY-MM-DD(기본 오늘)'),
        agent: z.string().optional().describe('대리인(선택)'),
        majorityUnion: z.string().optional().describe('근로자 과반수로 조직된 노동조합 이름(있을 때만)'),
        changes: z.array(changeShape).optional().describe('변경 조문(변경신고면 1건 이상). check_work_rules_revisions 결과의 reportChanges 를 고쳐 넘겨도 된다'),
        effectiveDate: z.string().optional().describe('시행 예정일 YYYY-MM-DD(선택)'),
        outDir: z.string().describe('저장할 폴더(없으면 만든다)'),
        fileBase: z.string().optional().describe('파일 이름 앞부분(기본 「취업규칙_신고」 또는 「취업규칙_변경신고」 + 작성일)'),
        formats: z.array(z.enum(FORM_FORMATS)).optional().describe('만들 형식(기본 pdf·hwpx). docx·xlsx 는 신·구 조문 대비표에만 만든다'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (a) => {
      if (looksLikeRrn(JSON.stringify(a))) return fail('입력에 주민등록번호 모양의 숫자가 있어 만들지 않았습니다. 이 도구는 주민등록번호를 받지 않습니다.');
      const written = a.writtenDate ? isoDate(a.writtenDate) : isoOf(today());
      const input = {
        kind: a.kind, workplace: a.workplace ?? {}, opinionDate: a.opinionDate, office: a.office, writtenDate: written ?? a.writtenDate,
        agent: a.agent, majorityUnion: a.majorityUnion, changes: (a.changes ?? []).map((c) => ({ article: c.article, before: c.before, after: c.after, note: c.note, disadvantage: c.disadvantage })), effectiveDate: a.effectiveDate,
      };
      const badRef = (a.changes ?? []).filter((c) => c.lawRef && (!articleKey(c.lawRef.article) || (c.lawRef.date && !ymd(c.lawRef.date))));
      if (badRef.length) return fail('lawRef 의 article 은 「제60조」처럼, date 는 YYYY-MM-DD 로 적어 주세요.', { articles: badRef.map((c) => c.article) });
      const blanks = reportBlanks(input);
      const errors = reportErrors(input);
      if (blanks.length || errors.length) {
        return text({ ok: false, ...(blanks.length ? { blanks } : {}), ...(errors.length ? { errors } : {}), error: '빈 칸이나 맞지 않는 칸이 있어 서류를 만들지 않았습니다. 채워서 다시 부르세요.' });
      }
      // 근거 조문 원문 — 법제처에서 받은 글자 그대로 대비표 아래에 싣는다. 못 받으면 싣지 않고 알린다
      const quoted = [];
      const refWarnings = [];
      if (a.kind === 'change') {
        for (const [i, c] of (a.changes ?? []).entries()) {
          if (!c.lawRef) continue;
          try {
            const got = await articleAt(c.lawRef.law, c.lawRef.article, c.lawRef.date ? ymd(c.lawRef.date) : written.replace(/-/g, ''));
            if (!got.ok) {
              refWarnings.push(`${i + 1}번째 변경 조문: 근거 조문 원문을 붙이지 못했습니다 — ${got.error}`);
              continue;
            }
            const eff = got.version.effective.replace(/-/g, '');
            input.changes[i].lawQuote = { heading: `${got.law} ${got.article} — ${fmtDate(eff)} 시행 판 (관련 조문: ${c.article})`, text: got.articleText };
            quoted.push({ change: i + 1, law: got.law, article: got.article, effective: got.version.effective });
          } catch (e) {
            refWarnings.push(`${i + 1}번째 변경 조문: 근거 조문 원문을 붙이지 못했습니다 — ${drfError(e)}`);
          }
        }
      }
      const docs = reportDocs(input);
      const want = new Set(a.formats?.length ? a.formats : ['pdf', 'hwpx']);
      const base = safeName((a.fileBase ?? '').trim() || `취업규칙_${a.kind === 'change' ? '변경신고' : '신고'}_${written.replace(/-/g, '')}`);
      const plan = [
        ['1_신고서', docs.report, ['pdf', 'hwpx']],
        ...(docs.comparison ? [['2_신구조문대비표', docs.comparison, ['pdf', 'hwpx', 'docx', 'xlsx']]] : []),
        ['3_의견청취서', docs.opinion, ['pdf', 'hwpx']],
        ...(docs.consent ? [['4_동의서', docs.consent, ['pdf', 'hwpx']]] : []),
      ];
      const targets = plan.flatMap(([name, , fmts]) => fmts.filter((f) => want.has(f)).map((f) => ({ name, f, path: path.join(a.outDir, `${base}_${name}.${f}`) })));
      if (!targets.length) return fail('만들 형식이 없습니다. formats 에 pdf 나 hwpx 를 넣어 주세요.');
      const exists = targets.filter((x) => fs.existsSync(x.path)).map((x) => x.path);
      if (exists.length) return fail('이미 있는 파일은 덮어쓰지 않습니다. fileBase 나 outDir 를 바꿔 주세요.', { exists });

      fs.mkdirSync(a.outDir, { recursive: true });
      const font = want.has('pdf') ? new Uint8Array(fs.readFileSync(fontPath())) : null;
      const rows = docs.comparison ? comparisonRows(input) : [];
      const files = [];
      const skipped = [];
      for (const [name, doc] of plan) {
        for (const t of targets.filter((x) => x.name === name)) {
          try {
            let bytes;
            if (t.f === 'pdf') bytes = await formPdf([doc], font);
            else if (t.f === 'hwpx') bytes = await formHwpx([doc]);
            else {
              const sheet = { title: '취업규칙 신·구 조문 대비표', intro: [`사업장명: ${input.workplace.name} · 작성일: ${written}`], head: ['조문', '현행', '개정안', '비고'], rows, foot: quoted.length ? ['근거 법령 원문(법제처 국가법령정보에서 받은 글자 그대로)', ...comparisonQuoteLines(input).flatMap((s) => s.split('\n'))] : [] };
              const blob = t.f === 'docx' ? await compareDocx({ ...sheet, widths: [2200, 5600, 5600, 2200] }) : await comparisonXlsx({ ...sheet, widths: [18, 55, 55, 22] });
              bytes = new Uint8Array(await blob.arrayBuffer());
            }
            fs.writeFileSync(t.path, bytes);
            files.push({ document: doc.title, format: t.f, path: t.path, bytes: bytes.length });
          } catch (e) {
            skipped.push({ document: doc.title, format: t.f, error: e instanceof Error ? e.message : String(e) });
          }
        }
      }
      const w = input.workplace;
      const warnings = [
        ...(w.workers < 10 ? ['상시 10명 미만 사업장은 취업규칙 작성·신고 의무가 없습니다(근로기준법 제93조). 의무가 아니어도 서류는 만들었습니다.'] : []),
        ...(!input.majorityUnion && w.workers > 1000 ? [`서명 명단은 ${1000}줄까지만 만들었습니다. 줄이 더 필요하면 한글 파일에서 늘려 주세요.`] : []),
        ...(!input.majorityUnion && w.unionMembers * 2 > w.workers ? ['노동조합원수가 근로자수의 절반을 넘습니다. 근로자 과반수로 조직된 노동조합이면 majorityUnion 에 이름을 넣어 노동조합 의견서로 만드세요.'] : []),
        ...refWarnings,
      ];
      return text({
        ok: files.length > 0,
        files,
        ...(skipped.length ? { skipped } : {}),
        ...(quoted.length ? { quoted, quotedNotice: `대비표 아래 「근거 법령 원문」에 법령 조문을 받은 글자 그대로 실었습니다(${DRF_SOURCE}, ${nowKst()} 조회).` } : {}),
        sealRequired: sealsNeeded(input, docs).map((s) => `날인 필요 — ${s}`),
        attach: [
          `첨부 1 — 취업규칙 본문 1부(사용자가 준비)${docs.comparison ? ' + 신·구 조문 대비표' : ''}`,
          '첨부 2 — 의견청취서(근로자 과반수 또는 과반수 노동조합의 의견을 들었음을 증명하는 자료)',
          ...(docs.consent ? ['첨부 3 — 동의서(근로자에게 불리하게 변경하는 경우)'] : []),
        ],
        submit: {
          online: '고용노동부 노동포털 › 민원신청 › 취업규칙·퇴직연금 › 「취업규칙(신고서, 변경신고서)」',
          url: PORTAL,
          paper: '관할 지방고용노동관서의 장에게 제출(근로기준법 시행규칙 제15조)',
        },
        ...(warnings.length ? { warnings } : {}),
        check: '제출 전에 파일을 열어 사업장 정보·조문·날짜를 확인하고, 서명·날인을 받은 뒤 냅니다.',
      });
    },
  );
}
