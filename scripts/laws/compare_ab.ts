// A(표준 조문 뼈대) 와 B(문서 전체 키워드, checkRules) 를 같은 취업규칙에 돌려 판정이 어긋난 매핑만 낸다 — 확인용, 화면에는 안 낸다.
//   npx jiti scripts/laws/compare_ab.ts <규칙.txt> <최종개정일 YYYYMMDD> [기준일] [--json out.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkRules } from '../../src/lib/laws/rules-check';
import { periodCheck, type StdArticle, type StdRule } from '../../src/lib/laws/standard-check';
import type { LawIndex } from '../../src/lib/laws/format';

const [file, from, toArg] = process.argv.slice(2);
const to = toArg && /^\d{8}$/.test(toArg) ? toArg : new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
const dir = join(process.cwd(), 'public', 'data', 'laws');
const read = <T>(f: string): T => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const std = read<{ articles: StdArticle[] }>('standard.json').articles;
const idx = read<LawIndex>('index.json');
const rules = read<{ rules: StdRule[] }>('rules.json').rules.filter((r) => r.effective > from && r.effective <= to);
const text = readFileSync(file, 'utf8');

const a = periodCheck({ text, std, events: idx.events, rules, from, to });
type AV = { v: (typeof a.items)[number]['verdicts'][number]; std: string };
const aBy = new Map<string, AV>(a.items.flatMap((it) => it.verdicts.map((v): [string, AV] => [`${v.rule.lawId}|${v.rule.article}|${v.rule.topic}`, { v, std: it.std.id }])));
const b = checkRules(text, rules);
const rows = b.map((vb) => {
  const key = `${vb.rule.lawId}|${vb.rule.article}|${vb.rule.topic}`;
  const va = aBy.get(key);
  return { key, topic: vb.rule.topic, required: vb.rule.required, A: va?.v.status ?? '(A 미연결)', Awhere: va?.v.where ?? null, std: va?.std ?? null, B: vb.status, Bwhere: vb.where };
});
const diff = rows.filter((r) => r.A !== r.B);
console.log(`기간 ${from}~${to} · 매핑 ${rows.length} · A/B 일치 ${rows.length - diff.length} · 불일치 ${diff.length}`);
for (const d of diff) console.log(`  ≠ ${d.topic} — A ${d.A}(${d.Awhere ?? '-'} @${d.std}) / B ${d.B}(${d.Bwhere ?? '-'})`);
const i = process.argv.indexOf('--json');
if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify({ from, to, rows, diff, missingRequired: a.missingRequired.map((s) => s.id) }, null, 1));
