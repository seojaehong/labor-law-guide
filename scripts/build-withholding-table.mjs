// 근로소득 간이세액표 CSV(data/tax) → 화면이 읽는 TS 표(src/lib/calc).
// 실행(저장소 루트): node scripts/build-withholding-table.mjs
// 표가 바뀌면 새 CSV 를 넣고 아래 두 이름을 바꾼 뒤 돌린다. 생성 파일은 손으로 고치지 않는다.
import { readFileSync, writeFileSync } from 'node:fs';

const CSV = 'data/tax/kr-wage-withholding-2026-02-27.csv';
const OUT = 'src/lib/calc/wage-withholding-2026-02-27.ts';

const lines = readFileSync(CSV, 'utf8').replace(/\r\n/g, '\n').trimEnd().split('\n');
const rows = lines.slice(1).map((l) => l.split(',').map(Number));
if (rows.some((r) => r.length !== 13 || !r.every(Number.isInteger))) throw new Error('CSV 행 모양이 다릅니다');

const body = rows.map((r) => `  [${r.join(', ')}],`).join('\n');
writeFileSync(
  OUT,
  `// 생성 파일 — ${CSV} 에서 scripts/build-withholding-table.mjs 로 만든다. 손으로 고치지 않는다.
// 소득세법 시행령 [별표2] 근로소득 간이세액표 <개정 2026. 2. 27.> 제6호.
// 행 = [월급여액 이상(원), 미만(원), 공제대상가족 1명 … 11명 세액(원)]. 마지막 행은 정확히 10,000천원(이상 = 미만).
// 시험(tests/unit/calc-take-home-pay.test.ts)이 CSV 해시와 전 행·전 칸을 대조한다.

export const WITHHOLDING_REVISION = '소득세법 시행령 [별표2] <개정 2026. 2. 27.>';

export const WITHHOLDING_ROWS: readonly (readonly number[])[] = [
${body}
];
`,
);
console.log(`${OUT}: ${rows.length}행`);
