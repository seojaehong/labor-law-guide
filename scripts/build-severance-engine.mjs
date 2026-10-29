// 정본 엔진을 public/tools/severance.html 첫 <script> 안 표시 사이에 넣는다. 블록마다 엔진 파일 하나, 전역 이름 하나.
//   severance-engine      — 퇴직금(src/lib/calc/severance.ts)           → SeveranceEngine
//   retirement-tax-engine — 퇴직소득세(src/lib/calc/retirement-tax.ts) → RetirementTaxEngine
// 실행: node scripts/build-severance-engine.mjs   (엔진을 고치면 반드시 다시 돌린다 — tests/unit/severance-engine-sync.test.ts 가 어긋남을 잡는다)
// 엔진 파일은 import 없이 홀로 서야 한다. 주입한 코드에 import/export 가 남으면 html 스크립트 전체가 구문 오류로 멈추므로 여기서 막는다.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(fileURLToPath(import.meta.url), '../..');
export const HTML = resolve(root, 'public/tools/severance.html');

/** 주입 블록 — html 안에서 이 순서로 놓인다. exports = 전역 객체가 내놓는 이름 */
export const BLOCKS = [
  { id: 'severance-engine', engine: resolve(root, 'src/lib/calc/severance.ts'), name: 'SeveranceEngine', exports: ['calcSeverance', 'periodSegments', 'oneYearDate'] },
  {
    id: 'retirement-tax-engine',
    engine: resolve(root, 'src/lib/calc/retirement-tax.ts'),
    name: 'RetirementTaxEngine',
    exports: ['calcRetirementTax', 'serviceYears', 'serviceMonths', 'RETIREMENT_TAX_FROM', 'BASIC_TAX_RATES'],
  },
];

const blockOf = (id) => {
  const b = BLOCKS.find((x) => x.id === id);
  if (!b) throw new Error(`없는 블록: ${id}`);
  return b;
};

export const startMark = (id) => `/* @@${id}:start — scripts/build-severance-engine.mjs 가 만든다. 손으로 고치지 않는다 */`;
export const endMark = (id) => `/* @@${id}:end */`;

/** 엔진 파일을 html 에 넣을 블록 글자로 */
export function buildBlock(id) {
  const b = blockOf(id);
  const src = readFileSync(b.engine, 'utf8').replace(/\r\n/g, '\n');
  const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.ESNext, removeComments: false } }).outputText
    .replace(/^export (function|const|let) /gm, '$1 ')
    .replace(/^export \{\};?\n?/gm, '')
    .trimEnd();
  const left = /^\s*(import|export)\b.*$/m.exec(js);
  if (left) throw new Error(`${b.engine} 에 html 로 옮길 수 없는 줄이 있습니다: ${left[0].trim()}`);
  const body = js.split('\n').map((l) => (l ? `    ${l}` : l)).join('\n');
  return `${startMark(id)}\nconst ${b.name} = (() => {\n${body}\n    return { ${b.exports.join(', ')} };\n})();\n${endMark(id)}`;
}

/** html 안 표시 사이 블록 */
export function currentBlockOf(html, id) {
  const a = html.indexOf(startMark(id));
  const e = html.indexOf(endMark(id));
  if (a < 0 || e < a) return null;
  return html.slice(a, e + endMark(id).length).replace(/\r\n/g, '\n');
}

// 예전 이름(퇴직금 블록 하나였을 때) — 기존 시험이 쓴다
export const ENGINE = blockOf('severance-engine').engine;
export const START = startMark('severance-engine');
export const END = endMark('severance-engine');
export const buildEngineBlock = () => buildBlock('severance-engine');
export const currentBlock = (html) => currentBlockOf(html, 'severance-engine');

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raw = readFileSync(HTML, 'utf8');
  const crlf = raw.includes('\r\n');
  let html = raw.replace(/\r\n/g, '\n');
  for (const { id } of BLOCKS) {
    const a = html.indexOf(startMark(id));
    const e = html.indexOf(endMark(id));
    if (a < 0 || e < a) throw new Error(`표시가 없습니다: ${startMark(id)}`);
    html = html.slice(0, a) + buildBlock(id) + html.slice(e + endMark(id).length);
  }
  writeFileSync(HTML, crlf ? html.replace(/\n/g, '\r\n') : html);
  console.log(`severance.html 엔진 블록 갱신: ${BLOCKS.map((b) => b.id).join(', ')}`);
}
