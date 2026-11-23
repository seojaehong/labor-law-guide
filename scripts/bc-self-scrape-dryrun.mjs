// 법원 판례(bc_) 「우리 사이트를 긁은 원천 행」 정리 dry-run — 읽기만 한다(SELECT 만 보낸다).
//
//   SUPABASE_ACCESS_TOKEN=<PAT> node scripts/bc-self-scrape-dryrun.mjs [project_ref] [v1_sample_rows]
//   (Node 24 — .ts 모듈을 타입만 걷어 바로 읽는다)
//
// 1) supabase/cleanup/20261123_bc_self_scrape.sql 의 술어로 지울 행 수
// 2) 그 행 전부가 화면 거름(isOwnSiteUrl)에도 걸리는지 — SQL 술어와 TS 규칙이 같은지
// 3) 음성 표본: local-verified-v1 전부 + recollect-v1 앞 N행에 screenSourceRow 를 돌려 바뀐 행이 0 인지
// 4) 표본 4건(보고 3건 + 바깥 원문으로 내려가는 1건)의 화면 선택 전/후(상세 페이지와 같은 선택 규칙)
import { isOwnSiteUrl, screenSourceRow } from '../src/lib/source-self-scrape.ts';

const REF = process.argv[2] || 'mewqgevgdgghhatqtuos';
const V1_SAMPLE = Number(process.argv[3] || 2000);
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) throw new Error('SUPABASE_ACCESS_TOKEN 이 없다');

const OWN_PREDICATE = `(source_url like 'http%://노란봉투법.com/%' or source_url like 'http%://www.노란봉투법.com/%'
  or source_url ilike 'http%://xn--o80bk8isxeinax68f.com/%' or source_url ilike 'http%://www.xn--o80bk8isxeinax68f.com/%'
  or source_url ilike 'http%://yellowenvelope.kr/%' or source_url ilike 'http%://www.yellowenvelope.kr/%')`;

async function select(sql) {
  if (!/^\s*(select|with)\b/i.test(sql)) throw new Error('읽기 전용 스크립트 — SELECT 만 보낸다');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql, read_only: true }),
    });
    if (res.ok) return res.json();
    if (attempt === 2) throw new Error(`${res.status} ${await res.text()}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  return [];
}
const pause = () => new Promise((r) => setTimeout(r, 1000));

const COLS = 'id, internal_decision_id, source_url, parse_version, completeness_flag, coverage_ratio, full_text_clean, full_text_raw, body_sections';

// --- 상세 페이지(src/app/decisions/[id]/page.tsx)와 같은 선택 규칙 ---
const PAYWALL = ['콘텐츠 이용량이 많아', '서비스 접속이 원활하지 않', '친구초대 30,000P', 'MY빅케이스', 'Law&Company Co., Ltd', '(C) Law', '슈퍼로이어', '로톡뉴스'];
const bad = (t) => PAYWALL.some((s) => t.includes(s)) || (t.includes("'item':") && t.includes("'content':"));
const verified = (r) => r.parse_version === 'local-verified-v1' && r.completeness_flag === 'full';
const isList = (v) => Array.isArray(v) && v.some((s) => s && typeof s.text === 'string' && s.text.trim() && !bad(s.text));
function pick(rows) {
  const sorted = [...rows].sort((a, b) => (+verified(b) - +verified(a)) || (+isList(b.body_sections) - +isList(a.body_sections)) || ((b.coverage_ratio ?? 0) - (a.coverage_ratio ?? 0)));
  for (const r of sorted) {
    const c = (r.full_text_clean ?? '').trim();
    if (c.length >= (verified(r) ? 1 : 1000) && !bad(c)) return { row: r, text: c };
  }
  for (const r of sorted) {
    const raw = (r.full_text_raw ?? '').trim();
    if (raw.length >= 1000 && !bad(raw)) return { row: r, text: raw };
  }
  return null;
}
const host = (u) => { try { return u ? new URL(u).hostname : '(없음)'; } catch { return '(주소 아님)'; } };
const show = (p) => p ? `[${p.row.parse_version} · ${host(p.row.source_url)} · ${p.text.length}자] ${p.text.slice(0, 160).replace(/\s+/g, ' ')}` : '(수집 본문 없음 → AI 정리/정리본 표시)';

async function main() {
  // 1) 지울 행 수
  const byVersion = await select(
    `select parse_version, completeness_flag, count(*)::int n from decision_source_documents where ${OWN_PREDICATE} group by 1,2 order by 1,2`);
  const total = byVersion.reduce((s, r) => s + r.n, 0);
  console.log(`1) 삭제 대상(정리 SQL 술어): ${total}행`, JSON.stringify(byVersion));

  // 2) SQL 술어 행이 전부 TS 규칙에도 걸리는가 + TS 규칙에만 걸리는 행은 없는가(주소만 읽는다)
  let after = 0; let sqlOnly = 0; let tsOnly = 0; let seen = 0;
  for (;;) {
    const rows = await select(
      `select id, source_url, ${OWN_PREDICATE} as own from decision_source_documents where internal_decision_id like 'bc\\_%' and id > ${after} order by id limit 5000`);
    if (!rows.length) break;
    for (const r of rows) {
      const ts = isOwnSiteUrl(r.source_url);
      if (r.own && !ts) sqlOnly += 1;
      if (!r.own && ts) tsOnly += 1;
    }
    seen += rows.length; after = rows[rows.length - 1].id; await pause();
  }
  console.log(`2) bc_ 원천 ${seen}행 대조 — SQL 만 걸림 ${sqlOnly} · TS 만 걸림 ${tsOnly}`);

  // 3) 음성 표본
  const negatives = [['local-verified-v1', "parse_version = 'local-verified-v1'", 100000], ['recollect-v1', "parse_version = 'recollect-v1'", V1_SAMPLE]];
  for (const [label, where, cap] of negatives) {
    let changed = 0; let dropped = 0; let n = 0; let last = 0;
    while (n < cap) {
      const rows = await select(`select ${COLS} from decision_source_documents where ${where} and id > ${last} order by id limit ${Math.min(500, cap - n)}`);
      if (!rows.length) break;
      for (const r of rows) {
        const s = screenSourceRow(r);
        if (s === null) dropped += 1; else if (s !== r) changed += 1;
      }
      n += rows.length; last = rows[rows.length - 1].id; await pause();
    }
    console.log(`3) 음성 표본 ${label} ${n}행 — 버림 ${dropped} · 글자 바뀜 ${changed}`);
  }

  // 4) 표본 화면 선택 전/후
  for (const id of ['bc_da125932', 'bc_dad2572b', 'bc_2e6419d5', 'bc_c1caaf6f']) {
    const rows = await select(`select ${COLS} from decision_source_documents where internal_decision_id = '${id}' and (source_provider = 'bigcase' or (parse_version = 'local-verified-v1' and completeness_flag = 'full'))`);
    const before = pick(rows);
    const afterPick = pick(rows.map(screenSourceRow).filter((r) => r !== null));
    console.log(`4) ${id}\n   전: ${show(before)}\n   후: ${show(afterPick)}`);
    await pause();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
