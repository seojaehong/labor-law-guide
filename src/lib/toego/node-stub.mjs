// 브라우저 묶음에서 node:fs·node:path·node:url·node:crypto 자리를 채운다(scripts/build-toego-browser.mjs 의 vite 묶음 단계).
// Next(turbopack) 별칭으로는 못 채운다 — Next 가 node:url·node:crypto 를 자체 대체 모듈로 먼저 바꿔 넣는다(261124 실측).
// 퇴고 체험(/tools/toego)은 엔진(tools/k-labor/lib/prose)의 checkProse(범용 팩을 직접 넘김)·checkNorms 와 common.mjs 의 rrnLines 만 부른다.
// 이 셋은 파일·암호 기능을 쓰지 않는다 — 엔진 모듈 머리의 import 만 남아 있어 그 자리를 채운다.
// common.mjs 는 모듈을 읽을 때 path.dirname(fileURLToPath(import.meta.url)) 을 한 번 부르므로(자산 경로) 그 둘만 빈 값을 낸다.
// 나머지는 불리면 던진다 — 브라우저에서 파일·암호 기능에 닿으면 조용히 다른 값을 내지 않고 드러나게.
// 묶음 밖(서버·시험의 entry.mjs 직접 호출)은 진짜 node 모듈을 쓴다. tests/unit/toego-browser-nonode.test.ts 는 이 스텁을 vi.mock 으로 끼워 같은 조건을 만든다.
const refuse = (what) => () => {
  throw new Error(`브라우저에서는 ${what} 를 쓰지 않습니다`);
};

const stub = {
  dirname: () => '',
  join: refuse('path.join'),
  isAbsolute: refuse('path.isAbsolute'),
  readFileSync: refuse('fs.readFileSync'),
  writeFileSync: refuse('fs.writeFileSync'),
  existsSync: refuse('fs.existsSync'),
  readdirSync: refuse('fs.readdirSync'),
  randomBytes: refuse('crypto.randomBytes'),
  createHash: refuse('crypto.createHash'),
};

export default stub;
export const fileURLToPath = () => '';
