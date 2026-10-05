// A(브라우저 표준 뼈대 판정) 와 C(/취업규칙검토 변경지시 JSON) 를 같은 취업규칙에서 조문 번호 단위로 맞춰 본다 — 런칭 판단용.
//   npx jiti scripts/laws/compare_ac.ts <규칙.txt> <최종개정일> <C 변경지시.json> [기준일] [--md out.md]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { periodCheck, type StdArticle, type StdRule } from '../../src/lib/laws/standard-check';
import type { LawIndex } from '../../src/lib/laws/format';

interface Directive {
  id: string;
  priority: string;
  review_type: string;
  target_article: string;
  related_law?: string;
  reason: string;
}

const [file, from, cFile, toArg] = process.argv.slice(2);
const to = toArg && /^\d{8}$/.test(toArg) ? toArg : new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
const dir = join(process.cwd(), 'public', 'data', 'laws');
const read = <T>(f: string): T => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const std = read<{ articles: StdArticle[] }>('standard.json').articles;
const idx = read<LawIndex>('index.json');
const rules = read<{ rules: StdRule[] }>('rules.json').rules;
const text = readFileSync(file, 'utf8');
const raw = JSON.parse(readFileSync(cFile, 'utf8'));
const C: Directive[] = Array.isArray(raw) ? raw : raw.changes ?? raw.items ?? raw.directives ?? [];

const artNo = (s: string | null | undefined) => s?.replace(/\s/g, '').match(/제\d+조(?:의\d+)?/)?.[0] ?? null;

// A — 고칠 것·조문 추가만(확인·선택은 「판정」이 아니라 안내라 비교에서 뺀다)


const aMap = new Map<string, string[]>();
const art93 = read<{ art93?: { no: string; label: string; keywords: string[] }[] }>('standard.json').art93 ?? [];
const a2 = periodCheck({ text, std, events: idx.events, rules, from, to, art93 });
for (const it of a2.items.filter((i) => i.status === '고칠 것' || i.status === '조문 추가')) {
  // where 는 「제18조(휴직명령), 제39조(…)」처럼 여러 조문일 수 있다(명칭 변경형)
  const fromWhere = it.verdicts.filter((v) => v.status !== '반영됨').flatMap((v) => (v.where ?? '').split(',').map((w) => artNo(w)));
  const nos = [...new Set([...it.user.map((u) => u.no), ...fromWhere].filter(Boolean) as string[])];
  const keys = nos.length ? nos : [`신설:${it.std.title}`];
  for (const k of keys) aMap.set(k, [...(aMap.get(k) ?? []), `${it.std.id}(${it.std.title}) ${it.verdicts.filter((v) => v.status !== '반영됨').map((v) => v.rule.topic).join(' / ') || it.status}`]);
}
for (const s of a2.missingRequired) aMap.set(`누락:${s.title}`, [`[필수] ${s.id}(${s.title}) 짝 없음`]);
for (const i of a2.missing93) aMap.set(`제93조${i.no}호`, [`제93조 제${i.no}호 ${i.label} — 낱말 없음`]);

// C — 법령 관련 판정(개정 미반영·위반·필수기재 누락). 개선권고·표현은 A 의 범위 밖이라 따로 센다
const LAWISH = new Set(['법령개정미반영', '법령위반', '필수기재누락']);
const cLaw = C.filter((d) => LAWISH.has(d.review_type));
const cOther = C.filter((d) => !LAWISH.has(d.review_type));
const cMap = new Map<string, Directive[]>();
for (const d of cLaw) {
  const h = d.review_type === '필수기재누락' ? (d.related_law ?? '').replace(/\s/g, '').match(/제93조제(\d+호(?:의\d+)?)/) : null;
  let k = h ? `제93조${h[1].replace(/호(의\d+)$/, '$1호')}` : artNo(d.target_article) ?? d.target_article;
  // 「제17조의2」 신설 지시는 바탕 조문(제17조)을 A 가 잡았으면 같은 건이다(번호만 다름)
  const base = k.match(/^(제\d+조)의\d+$/)?.[1];
  if (base && !aMap.has(k) && aMap.has(base)) k = base;
  cMap.set(k, [...(cMap.get(k) ?? []), d]);
}

const both = [...aMap.keys()].filter((k) => cMap.has(k));
const aOnly = [...aMap.keys()].filter((k) => !cMap.has(k));
const cOnly = [...cMap.keys()].filter((k) => !aMap.has(k));
const lines = [
  `### ${file.split(/[\\/]/).pop()} · 최종 개정 ${from} → 기준 ${to}`,
  '',
  `| | 건수 |`,
  `|---|---|`,
  `| A 판정(고칠 것·조문 추가·필수 누락) 조문 | ${aMap.size} |`,
  `| C 법령 관련 변경지시 조문 (지시 ${cLaw.length}건) | ${cMap.size} |`,
  `| **둘 다 잡음** | **${both.length}** |`,
  `| A 만 | ${aOnly.length} |`,
  `| C 만 | ${cOnly.length} |`,
  `| C 개선권고·표현(A 범위 밖) | ${cOther.length} |`,
  `| 조문 일치율(둘 다 / 합집합) | ${Math.round((both.length / Math.max(1, new Set([...aMap.keys(), ...cMap.keys()]).size)) * 100)}% |`,
  '',
  '**둘 다**',
  ...both.map((k) => `- ${k} — A: ${aMap.get(k)!.join('; ')} · C: ${cMap.get(k)!.map((d) => `${d.priority} ${d.related_law ?? ''}`).join('; ')}`),
  '',
  '**A 만**',
  ...aOnly.map((k) => `- ${k} — ${aMap.get(k)!.join('; ')}`),
  '',
  '**C 만**',
  ...cOnly.map((k) => `- ${k} — ${cMap.get(k)!.map((d) => `${d.priority} ${d.review_type} ${d.related_law ?? ''}: ${d.reason.slice(0, 110)}`).join(' | ')}`),
  '',
];
console.log(lines.join('\n'));
const i = process.argv.indexOf('--md');
if (i > 0) writeFileSync(process.argv[i + 1], lines.join('\n'));
