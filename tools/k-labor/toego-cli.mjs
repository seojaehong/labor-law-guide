// 퇴고 가벼운 실행 파일 — dist/toego.mjs 로 묶인다(build.mjs).
//   node dist/toego.mjs <인자.json>      → 문체(check_prose) + 공개 규범(check_norms) (+ 키를 주면 의미범주(check_semantic)·AI 수사(check_rhetoric)) 결과 JSON 을 stdout 에
//   node dist/toego.mjs -                → 인자를 표준 입력에서 읽는다(문서 글이 파일로 남지 않게 — 발송 게이트는 이것을 쓴다)
// 발송 게이트가 문서마다 부른다. dist/server.mjs 는 모든 묶음의 의존성을 읽어 뜨는 데 2초가 넘어서,
// 퇴고 점검에 필요한 것(lib/prose·common)만 묶어 따로 낸다. 판정 함수는 MCP 도구와 같은 lib/prose/toego.mjs 다.
// 종료 코드 1 은 「점검 불완전」이다 — 발송 게이트는 rc 가 아니라 응답의 검사별 ok·incomplete 로 판정한다.
// 인자 = { text, genre?, detail?, norms?: { checks?, quote?, warnOnly? }, semantic?: { genre?, text? }, rhetoric?: { track?, allA? } }(모르는 키는 받지 않는다).
// 응답 글은 MCP 와 같이 주민번호 모양을 가린다. 의미범주·AI 수사는 키를 줄 때만 돌고, 비공개 팩(PROSE_PACK_DIR)이 없으면 불완전 → 종료 코드 1.
// 발송 게이트는 두 키를 늘 주고 rhetoric.allA 로 A 를 상한 없이 받는다.
// 인자는 UTF-8 이어야 한다 — 깨진 바이트를 U+FFFD 로 바꿔 점검하면 원고가 깨진 채 통과하므로 고치지 않고 멈춘다.
// 종료 코드: 0 = ok, 1 = ok:false(점검 불완전·주민번호 멈춤·입력 오류), 2 = 인자를 못 읽음(없음·UTF-8 아님·JSON 아님).
// 끝낼 때 process.exit 를 부르지 않는다 — 표준 출력이 파이프면 쓰기가 끝나기 전에 끊길 수 있다(exitCode 만 정한다).
import fs from 'node:fs';
import { text } from './lib/common.mjs';
import { runToego } from './lib/prose/toego.mjs';

const fail = (msg) => {
  console.error(msg);
  process.exitCode = 2;
};

async function readInput(file) {
  if (file !== '-') return fs.readFileSync(file);
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks);
}

async function main() {
  // 판 정보는 옆 build-info.json(toegoSha256)에 있다 — 버전 문자열을 따로 두지 않는다
  const file = process.argv[2];
  if (!file) return fail('사용: node toego.mjs <인자.json | ->   (- = 표준 입력)');
  const where = file === '-' ? '표준 입력' : file;
  let buf;
  try {
    buf = await readInput(file);
  } catch (e) {
    return fail(`인자를 읽지 못했습니다: ${where} (${e?.code || 'read error'})`);
  }
  let raw;
  try {
    raw = new TextDecoder('utf-8', { fatal: true }).decode(buf); // 앞의 BOM 은 떼어 낸다
  } catch {
    return fail(`인자가 UTF-8 이 아닙니다: ${where} — 고치지 않고 멈춥니다`);
  }
  let args;
  try {
    args = JSON.parse(raw);
  } catch (e) {
    // 오류문은 파일 내용 조각을 싣는다 — 경로·종류·위치(숫자)만 알린다(server.mjs call 과 같다)
    const pos = /\bposition (\d+)/.exec(e instanceof Error ? e.message : '')?.[1];
    return fail(`인자가 JSON 형식이 아닙니다: ${where} (${e?.name || 'SyntaxError'}${pos ? ` 위치 ${pos}` : ''})`);
  }
  const r = runToego(args);
  process.stdout.write(`${text(r).content[0].text}\n`);
  process.exitCode = r.ok ? 0 : 1;
}

main().catch((e) => {
  // 글 조각이 실리지 않게 오류 종류와 「at」 줄만
  console.error('[toego]', e instanceof Error ? `${e.name}\n${String(e.stack ?? '').split('\n').filter((l) => /^\s+at /.test(l)).join('\n')}` : 'unknown');
  process.exitCode = 2;
});
