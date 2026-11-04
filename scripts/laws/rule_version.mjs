// 관리자 검토기록(work_rule_observations_v1)의 rule_version 상수를 공개 데이터에 맞춘다.
//
// rule_version = sha256(JSON.stringify([standard.json, index.json, rules.json])) — public/data/laws 세 파일.
// 브라우저(src/app/laws/RulesCheck.tsx loadData)가 받은 파일로 같은 식을 셈해 보내고, 서버(observation-contract.ts)는
// 상수 RULE_VERSION(src/lib/laws/observation-version.ts)과 같을 때만 받는다. 세 파일을 다시 만들고 상수를 안 바꾸면
// 저장 요청이 전부 400(invalid_metadata)이다 — 2026-10-19(#37)~10-25(#92), 10-30(#96)~11-03(#148) 두 번 그랬다.
//
// 상수로 두는 이유: 기록 행의 규칙 세트 표지는 사람이 본 PR 안에서 바뀌어야 한다(빌드 때 셈하면 시험이 동어반복이 되고,
// 검토 안 된 데이터 변경이 조용히 새 표지를 단다). 그래서 build_site_data.py 끝과 매일 수집(daily_update.sh)이 이 스크립트를 부른다.
// Python json.dumps 는 JSON.stringify 와 글자가 달라(공백·유니코드 이스케이프) 반드시 node 로 셈한다.
//
//   node scripts/laws/rule_version.mjs          # 맞는지 본다(다르면 종료코드 1)
//   node scripts/laws/rule_version.mjs --write  # 상수를 공개 데이터에 맞춘다
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA = join(ROOT, 'public', 'data', 'laws');
const VERSION_FILE = join(ROOT, 'src', 'lib', 'laws', 'observation-version.ts');
const LINE = /export const RULE_VERSION = "([0-9a-f]{64})";/;

/** 공개 데이터 세 파일의 규칙 버전 — RulesCheck.tsx·tests/unit/work-rule-observations.test.ts 와 같은 식 */
export function ruleVersion(dir = DATA) {
  const read = (name) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
  return createHash('sha256')
    .update(JSON.stringify([read('standard.json'), read('index.json'), read('rules.json')]))
    .digest('hex');
}

function main(args) {
  const source = readFileSync(VERSION_FILE, 'utf8');
  const pinned = LINE.exec(source)?.[1];
  if (!pinned) {
    console.error(`✗ RULE_VERSION 줄을 찾지 못했다: ${VERSION_FILE}`);
    return 2;
  }
  const now = ruleVersion();
  if (pinned === now) {
    console.log(`RULE_VERSION 그대로 ${now}`);
    return 0;
  }
  if (!args.includes('--write')) {
    console.error(`✗ RULE_VERSION ${pinned} ≠ 공개 데이터 ${now} — node scripts/laws/rule_version.mjs --write`);
    return 1;
  }
  writeFileSync(VERSION_FILE, source.replace(LINE, `export const RULE_VERSION = "${now}";`));
  console.log(`RULE_VERSION ${pinned} → ${now}`);
  return 0;
}

// 직접 실행일 때만 — 경로 표기가 달라(심볼릭 링크 등) 조용히 아무것도 안 하고 0 으로 끝나지 않게 실경로로 비교한다
const real = (p) => {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
};
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) process.exitCode = main(process.argv.slice(2));
