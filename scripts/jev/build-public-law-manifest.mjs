// Only already-published law text is eligible. No database or external requests.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const directory = new URL('../../public/data/laws/', import.meta.url);
const normalize = (text) => text.replace(/\s+/g, ' ').trim();
const records = {};
for (const filename of readdirSync(directory).sort()) {
  if (!/^\d{6}\.json$/.test(filename)) continue;
  const law = JSON.parse(readFileSync(new URL(filename, directory), 'utf8'));
  if (law.lawId !== filename.slice(0, 6) || typeof law.name !== 'string') throw Error('Invalid public law');
  for (const step of law.steps) for (const change of step.changes) {
    if (!/^제[1-9]\d*조(?:의[1-9]\d*)?$/.test(change.article)) continue;
    for (const body of [change.before, change.after]) {
      if (typeof body !== 'string' || !body.trim()) continue;
      const text = JSON.stringify([law.name, change.article, change.title || '', normalize(body)]);
      records[createHash('sha256').update(text).digest('hex')] = law.lawId;
    }
  }
}
const official = JSON.parse(readFileSync(new URL('../../data/public-law-rerank/official-articles.json', import.meta.url), 'utf8'));
for (const article of official.articles) {
  if (!/^\d{6}$/.test(article.lawId) || new URL(article.sourceUrl).hostname !== 'www.law.go.kr') throw Error('Invalid official source');
  const text = JSON.stringify([article.lawName, article.article, article.title, normalize(article.body)]);
  records[createHash('sha256').update(text).digest('hex')] = article.lawId;
}
writeFileSync(new URL('../../src/lib/chat/context/public-law-manifest.json', import.meta.url), JSON.stringify(records, null, 2) + '\n');
console.log(`Public-law manifest: ${Object.keys(records).length} verified text variants`);
