// 퇴고 가벼운 실행 파일 — dist/toego.mjs 로 묶인다(build.mjs).
//   node dist/toego.mjs <인자.json>      → 문체(check_prose) + 공개 규범(check_norms) 결과 JSON 을 stdout 에
// 발송 게이트가 문서마다 부른다. dist/server.mjs 는 모든 묶음의 의존성을 읽어 뜨는 데 2초가 넘어서,
// 퇴고 점검에 필요한 것(lib/prose·common)만 묶어 따로 낸다. 판정 함수는 MCP 도구와 같은 lib/prose/toego.mjs 다.
// 인자 = { text, genre?, detail?, norms?: { checks?, quote?, warnOnly? } }. 응답 글은 MCP 와 같이 주민번호 모양을 가린다.
// 종료 코드: 0 = ok, 1 = ok:false(점검 불완전·주민번호 멈춤·입력 오류), 2 = 인자 파일을 못 읽음.
import fs from 'node:fs';
import { text } from './lib/common.mjs';
import { runToego } from './lib/prose/toego.mjs';

// 판 정보는 옆 build-info.json(toegoSha256)에 있다 — 버전 문자열을 따로 두지 않는다
const file = process.argv[2];
if (!file) {
  console.error('사용: node toego.mjs <인자.json>');
  process.exit(2);
}
let raw;
try {
  raw = fs.readFileSync(file, 'utf8');
} catch (e) {
  console.error(`인자 파일을 읽지 못했습니다: ${file} (${e?.code || 'read error'})`);
  process.exit(2);
}
let args;
try {
  args = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
} catch (e) {
  // 오류문은 파일 내용 조각을 싣는다 — 경로·종류·위치(숫자)만 알린다(server.mjs call 과 같다)
  const pos = /\bposition (\d+)/.exec(e instanceof Error ? e.message : '')?.[1];
  console.error(`인자 파일이 JSON 형식이 아닙니다: ${file} (${e?.name || 'SyntaxError'}${pos ? ` 위치 ${pos}` : ''})`);
  process.exit(2);
}
const r = runToego(args);
process.stdout.write(`${text(r).content[0].text}\n`);
process.exit(r.ok ? 0 : 1);
