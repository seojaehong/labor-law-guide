// 퇴직금 정본 엔진(src/lib/calc/severance.ts)을 public/tools/severance.html 첫 <script> 안 표시 사이에 넣는다.
// 실행: node scripts/build-severance-engine.mjs   (엔진을 고치면 반드시 다시 돌린다 — tests/unit/severance-engine-sync.test.ts 가 어긋남을 잡는다)
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(fileURLToPath(import.meta.url), '../..');
export const ENGINE = resolve(root, 'src/lib/calc/severance.ts');
export const HTML = resolve(root, 'public/tools/severance.html');
export const START = '/* @@severance-engine:start — scripts/build-severance-engine.mjs 가 만든다. 손으로 고치지 않는다 */';
export const END = '/* @@severance-engine:end */';

export function buildEngineBlock() {
  const src = readFileSync(ENGINE, 'utf8').replace(/\r\n/g, '\n');
  const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.ESNext, removeComments: false } }).outputText
    .replace(/^export (function|const|let) /gm, '$1 ')
    .replace(/^export \{\};?\n?/gm, '')
    .trimEnd();
  const body = js.split('\n').map((l) => (l ? `    ${l}` : l)).join('\n');
  return `${START}\nconst SeveranceEngine = (() => {\n${body}\n    return { calcSeverance, periodSegments, oneYearDate };\n})();\n${END}`;
}

/** html 안 표시 사이 블록 */
export function currentBlock(html) {
  const a = html.indexOf(START);
  const b = html.indexOf(END);
  if (a < 0 || b < a) return null;
  return html.slice(a, b + END.length).replace(/\r\n/g, '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raw = readFileSync(HTML, 'utf8');
  const crlf = raw.includes('\r\n');
  const html = raw.replace(/\r\n/g, '\n');
  const block = buildEngineBlock();
  const a = html.indexOf(START);
  const b = html.indexOf(END);
  if (a < 0 || b < a) throw new Error(`표시가 없습니다: ${START}`);
  const out = html.slice(0, a) + block + html.slice(b + END.length);
  writeFileSync(HTML, crlf ? out.replace(/\n/g, '\r\n') : out);
  console.log('severance.html 엔진 블록 갱신');
}
