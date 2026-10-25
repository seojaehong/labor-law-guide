// 저장소에 이미 수집된 공식 변경 원문만 연결한다. 요약·제안 문안을 법령 원문으로 대체하지 않는다.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { RuleSpec } from '../rules-check';
import type { Evidence } from './judge';

export const evidenceKey = (r: Pick<RuleSpec, 'lawId' | 'article' | 'effective'>) => `${r.lawId}/${r.article}/${r.effective}`;
interface LawData { name: string; steps: { date: string; mst: string; changes: { article: string; after: string }[] }[] }
export async function loadEvidence(rules: RuleSpec[]): Promise<Map<string, Evidence>> {
  const out = new Map<string, Evidence>();
  for (const id of new Set(rules.map((r) => r.lawId))) {
    if (!/^\d{6}$/.test(id)) continue;
    try {
      const d: LawData = JSON.parse(await readFile(path.join(process.cwd(), 'public/data/laws', `${id}.json`), 'utf8'));
      for (const r of rules.filter((r) => r.lawId === id)) {
        const step = d.steps.find((s) => s.date === r.effective && (!r.mst || s.mst === r.mst));
        const change = step?.changes.find((c) => c.article === r.article && c.after?.trim());
        if (!step || !change || !/^\d+$/.test(step.mst)) continue;
        out.set(evidenceKey(r), { law: d.name, article: r.article, effective: step.date, text: change.after,
          url: `https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=${step.mst}` });
      }
    } catch { /* 없는 자료·깨진 자료는 근거 없음으로 남긴다 */ }
  }
  return out;
}
