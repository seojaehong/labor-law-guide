// 퇴고 — 문서 문체 점검(결정론). 규칙은 코드가 아니라 「팩」(JSON)에 있다.
//   · 범용 팩 = 이 폴더 generic-pack.json(im-not-ai lexicon 유래, MIT — THIRD_PARTY_NOTICES)
//   · 그 밖의 팩 = env PROSE_PACK_DIR 의 *.json(비공개 팩은 저장소에 두지 않는다). 없으면 범용 팩만 돈다.
// ★ 출력 정책(증류 방지) — detail 'brief'(기본)는 줄·칸·길이·등급·짧은 사유·참조 해시만 낸다.
//   정규식·대안·기준값·규칙 id·팩 이름은 'full'(로컬)에서만 싣는다.
// ★ 판정 규칙은 기존 로컬 문체 검사기와 같게 옮겼다(인용 줄 건너뛰기, 표 칸 「」·“ ” 가리기와 B 건너뛰기,
//   legal 장르 전용 규칙·밀도·제목·문장 검사, 빈도 = 문서 전체 비겹침 횟수 > max(3, 평균×2)).
// ★ 모델을 부르지 않는다. 문서 글은 이 함수 밖으로 나가지 않는다.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import GENERIC from './generic-pack.json';

export const GENERIC_PACK = GENERIC;
export const GENRES = ['legal', 'consulting', 'lecture', 'general'];

// 파이썬 str.isspace 와 같은 공백(JS \s 와 달리 BOM 을 넣지 않는다)
const WS = '\\t\\n\\v\\f\\r \\x1c-\\x1f\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const WS_RUN = new RegExp(`[${WS}]+`, 'gu');
const LEAD = new RegExp(`^[${WS}]+`, 'u');
const TRAIL = new RegExp(`[${WS}]+$`, 'u');
const strip = (s) => s.replace(LEAD, '').replace(TRAIL, '');
const lstrip = (s) => s.replace(LEAD, '');
const cpLen = (s) => [...s].length;
const cpSlice = (s, a, b) => [...s].slice(a, b).join('');

/** 파이썬 % 서식(%s %d %.Nf %%)만 */
function pyfmt(f, args) {
  let i = 0;
  return f.replace(/%(%|s|d|\.(\d)f)/g, (m, k, p) => {
    if (k === '%') return '%';
    const v = args[i++];
    if (k === 's') return String(v);
    if (k === 'd') return String(Math.trunc(v));
    return Number(v).toFixed(Number(p));
  });
}

function compile(pack) {
  const re = (src, flags, id) => {
    try {
      return new RegExp(src, flags);
    } catch (e) {
      throw new Error(`팩 ${pack.pack ?? '?'} 규칙 ${id}: 정규식을 읽지 못했습니다(${e.message})`);
    }
  };
  return {
    ...pack,
    rules: (pack.rules ?? []).map((r) => ({
      ...r,
      rx: re(r.re, `${r.once ? '' : 'g'}u${(r.flags ?? '').replace(/[gu]/g, '')}`, r.id),
      ex: r.exclude ? re(r.exclude, 'u', r.id) : null,
    })),
    density: (pack.density ?? []).map((d) => ({ ...d, rx: re(d.re, 'gmu', d.id) })),
    headsRx: pack.checks?.heads ? re(pack.checks.heads.re, 'u', 'checks.heads') : null,
  };
}

/** 팩 읽기 — 범용 팩 + dir(기본 env PROSE_PACK_DIR)의 *.json(이름순) */
export function loadPacks({ dir = process.env.PROSE_PACK_DIR } = {}) {
  const packs = [GENERIC_PACK];
  if (dir && fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
      packs.push(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
    }
  }
  return packs;
}

const inGenre = (x, genre) => !x.genres || x.genres.includes(genre);
const ref = (pack, id) => crypto.createHash('sha256').update(`${pack}|${id}`).digest('hex').slice(0, 8);

const HEAD_RE = /^(?:#{2,4}\s+|\*\*)(?:[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]\.|\d+\.|\([0-9]+\)|[가-하]\.)\s*(.+?)(?:\*\*)?\s*$/u;
const UTTER_RE = /「[^」\n]{1,120}」\s?(?:라고|이라고|고\s|라는|이라는|며\s|하며)/gu;
const CURLY_RE = /[“‘][^”’\n]{1,120}[”’]/gu;
const QUOTE_MASK = /[「“][^」”]*[」”]/gu;
const count = (s, rx) => (s.match(rx) ?? []).length;

/**
 * @param {string} text
 * @param {{ packs?: any[], genre?: string, detail?: 'brief'|'full' }} [o]
 */
export function checkProse(text, { packs = loadPacks(), genre = 'legal', detail = 'brief' } = {}) {
  const full = detail === 'full';
  const P = packs.map(compile);
  const lines = String(text ?? '').split(/\r\n|\r|\n/);
  const txt = lines.join('\n');
  const hits = [];
  const push = (p, r, n, m, t) => {
    const col = cpLen(m.input.slice(0, m.index)) + 1;
    const h = { line: n, col, len: cpLen(m[0]), grade: r.grade, reason: r.reason };
    if (full) Object.assign(h, { word: cpSlice(m[0], 0, 24), fix: r.fix ?? '', rule: r.id, pack: p.pack, ctx: cpSlice(t, 0, 58) });
    else h.ref = ref(p.pack, r.id);
    hits.push(h);
  };

  lines.forEach((line, i) => {
    const n = i + 1;
    const t = strip(line);
    if (t.startsWith('>') || t.startsWith('[관련 판결]')) {
      for (const p of P) for (const r of p.rules) {
        if (r.scope !== 'quote' || !inGenre(r, genre)) continue;
        const s = r.target === 'trim' ? t : line;
        if (r.once) {
          const m = r.rx.exec(s);
          if (m) push(p, r, n, m, t);
        } else for (const m of s.matchAll(r.rx)) push(p, r, n, m, t);
      }
      return;
    }
    const inTable = t.startsWith('|');
    const probe = inTable ? line.replace(QUOTE_MASK, (m) => '·'.repeat(m.length)) : line;
    for (const p of P) for (const r of p.rules) {
      if (r.scope === 'quote' || !inGenre(r, genre)) continue;
      if (inTable && r.grade === 'B') continue;
      if (r.ex && r.ex.test(probe)) continue;
      for (const m of probe.matchAll(r.rx)) push(p, r, n, m, t);
    }
  });

  // ── 알림(빈도·밀도·발언 인용·제목·문장)
  const notes = [];
  const note = (kind, fullText, brief, extra = {}) => notes.push({ kind, text: full ? fullText : brief, ...extra });
  const legal = genre === 'legal';
  for (const p of P) {
    if (p.freq?.items?.length) {
      const over = p.freq.items.map((x) => ({ ...x, c: txt.split(x.word).length - 1 })).filter((x) => x.c > Math.max(3, x.avg * 2));
      for (const x of over) note('freq', pyfmt(p.freq.msg, [x.word, x.c, x.avg]), p.freq.brief);
    }
    const body = txt.split('\n').filter((l) => !(lstrip(l).startsWith('>') || lstrip(l).startsWith('[관련'))).join('\n');
    const nch = cpLen(body.replace(WS_RUN, '')) || 1;
    for (const d of legal ? p.density : []) {
      if (!inGenre(d, genre)) continue;
      const c = count(body, d.rx);
      const v = (c / nch) * 1e4;
      if (v > d.limit && c >= (d.min ?? 4)) note('density', `${d.reason} ${c}회(만자당 ${v.toFixed(1)} · 문턱 ${d.limit.toFixed(1)})`, `${d.reason} ${c}회`);
    }
    const ck = p.checks ?? {};
    if (ck.utterQuotes) {
      const u = count(body, UTTER_RE);
      const c = count(body, CURLY_RE);
      if (u >= ck.utterQuotes.min && c < u) note('utterQuotes', pyfmt(ck.utterQuotes.msg, [u, c]), `${ck.utterQuotes.brief} ${u}회`);
    }
    if (!legal) continue;
    if (ck.heads && inGenre(ck.heads, genre)) {
      const heads = [];
      for (const l of txt.split('\n')) {
        const m = HEAD_RE.exec(strip(l));
        if (!m) continue;
        const h = m[1];
        if (h.split(new RegExp(`[${WS}]+`, 'u')).filter(Boolean).length > ck.heads.maxWords || p.headsRx.test(h)) heads.push(cpSlice(h, 0, 30));
      }
      if (heads.length) note('heads', pyfmt(ck.heads.msg, [heads.length, heads.slice(0, 4).join(' / ')]), `${ck.heads.brief} ${heads.length}개`);
    }
    if (ck.sentences && inGenre(ck.sentences, genre)) {
      const S = ck.sentences;
      const flat = body.split('\n').filter((l) => !(lstrip(l).startsWith('|') || lstrip(l).startsWith('#'))).join('\n').replace(WS_RUN, ' ');
      const sents = [...flat.matchAll(/[^.]*?니다\./gu)].map((m) => strip(m[0])).filter((s) => cpLen(s) > 5);
      if (sents.length >= S.minSents) {
        const lens = sents.map((s) => cpLen(s.replace(new RegExp(`[${WS}]`, 'gu'), '')));
        const over = lens.filter((x) => x > S.maxLen).length;
        if (over / sents.length > S.ratio) note('sentences.long', pyfmt(S.msgLong, [over, sents.length, (over / sents.length) * 100]), `${S.briefLong} ${over}/${sents.length}`);
        const ends = sents.map((s) => { const a = [...s]; return a.slice(Math.max(0, a.length - 6), a.length - 1).join(''); });
        let run = 1;
        let runs = 0;
        for (let k = 1; k < ends.length; k++) {
          run = ends[k] === ends[k - 1] ? run + 1 : 1;
          if (run === S.run) runs++;
        }
        if (runs) note('sentences.run', pyfmt(S.msgRun, [runs]), `${S.briefRun} ${runs}곳`);
      }
    }
  }

  const counts = { A: hits.filter((h) => h.grade === 'A').length, B: hits.filter((h) => h.grade === 'B').length };
  return { counts, hits, notes, ...(full ? { packs: P.map((p) => `${p.pack}@${p.version ?? ''}`) } : {}) };
}
