// 실제 기관 규정 묶음으로 돌려 보는 실측 — 규정 파일은 저장소에 넣지 않는다.
// RR_DIR=<규정 폴더> RR_OUT=<결과 폴더> npx vitest run tests/unit/rules-review-real.test.ts
import { it } from 'vitest';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { ingest } from '@/lib/rules-review/ingest';
import { KIND_LABEL, runChecks, type Finding } from '@/lib/rules-review/checks';
import { applyLine, applyToSources, bundleDocx } from '@/lib/rules-review/outputs';
import { newWorkspace } from '@/lib/rules-review/workspace';
import { HwpEditDoc } from '@/lib/hwp/hwp-doc';
import { toLines } from '@/lib/hwp/apply';

const DIR = process.env.RR_DIR ?? '';
const OUT = process.env.RR_OUT ?? '';
const wasm = readFileSync(join(dirname(createRequire(import.meta.url).resolve('@rhwp/core/package.json')), 'rhwp_bg.wasm'));

const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));

it.skipIf(!DIR || !OUT)('실제 규정 묶음 실측', async () => {
  // RR_FLAT=1 이면 브라우저 파일 고르기처럼 폴더 없이 파일 이름만 쓴다
  const inputs = walk(DIR).map((p) => ({ path: process.env.RR_FLAT ? relative(DIR, p).split(/[\\/]/).pop()! : relative(DIR, p).replace(/\\/g, '/'), bytes: new Uint8Array(readFileSync(p)) }));
  const t0 = Date.now();
  const { regs, report, sources } = await ingest(inputs, { wasm });
  const t1 = Date.now();
  const findings = runChecks(regs);
  const t2 = Date.now();
  const byKind: Record<string, number> = {};
  for (const f of findings) byKind[KIND_LABEL[f.kind]] = (byKind[KIND_LABEL[f.kind]] ?? 0) + 1;
  const summary = {
    ms: { ingest: t1 - t0, checks: t2 - t1 },
    regs: regs.map((r) => ({ name: r.name, file: r.fileName, lines: r.lines.length, articles: r.articles.length, annexes: r.annexes.length, supp: r.suppStart, meta: r.meta })),
    report,
    byKind,
    total: findings.length,
  };
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
  writeFileSync(join(OUT, 'findings.json'), JSON.stringify(findings.map((f) => {
    const r = regs.find((x) => x.name === f.reg)!;
    return { ...f, context: f.spans[0] && f.spans[0].line >= 0 ? r.lines[f.spans[0].line]?.text : '' };
  }), null, 1));
  // 결재 묶음 실측 — 고칠 문안이 있는 항목을 모두 반영으로 두고 대비표·반영본을 만든다
  const ws = newWorkspace(regs, findings, report, '실측');
  ws.effective = '2026-03-01';
  for (const f of findings) if (f.after !== null) ws.states[f.id] = { decision: '반영', note: '' };
  writeFileSync(join(OUT, '신구조문대비표.docx'), Buffer.from(await (await bundleDocx(ws)).arrayBuffer()));
  const applied = await applyToSources(ws, sources, wasm);
  const check: { reg: string; applied: number; manual: number; error?: string; missing: string[] }[] = [];
  for (const a of applied) {
    const missing: string[] = [];
    if (a.bytes) {
      writeFileSync(join(OUT, a.fileName), a.bytes);
      // 다시 열어 바꾼 글자가 들어 있는지 — 줄 단위로 기대 글자를 만들어 대조한다
      const doc = await HwpEditDoc.open(a.bytes, wasm);
      const lines = toLines(doc.paragraphs()).map((l) => l.text);
      doc.free();
      const r = regs.find((x) => x.name === a.reg)!;
      const taken = findings.filter((f) => f.reg === a.reg && f.after !== null);
      const byLine = new Map<number, { at: number; length: number; to: string; f: Finding }[]>();
      for (const f of taken) for (const sp of f.spans) if (sp.length && !r.lines[sp.line].controls) byLine.set(sp.line, [...(byLine.get(sp.line) ?? []), { at: sp.at, length: sp.length, to: sp.to ?? f.after!, f }]);
      for (const [line, edits] of byLine) {
        const want = applyLine(r.lines[line].text, edits).text;
        if (!lines.includes(want)) missing.push(want.slice(0, 80));
      }
    }
    check.push({ reg: a.reg, applied: a.applied, manual: a.manual.length, error: a.error, missing });
  }
  writeFileSync(join(OUT, 'applied.json'), JSON.stringify(check, null, 1));
}, 600_000);
