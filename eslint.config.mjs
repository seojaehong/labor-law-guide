import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // 상시 근로자 수: 화면은 엔진 입력을 직접 만들지 않는다. 입구는 headcount-plan 의 toInput 하나다.
  // 퇴사 자료 대조 엔진 사본: 화면은 사본을 직접 가져오지 않는다. 입구는 @/lib/exit-check-demo 다.
  //   paths 는 이름이 똑같을 때만 걸려 하위 경로를 못 막으므로 patterns 로 둔다. 이 규칙은 동적 import()·상대 경로를
  //   보지 않는다 — 경계의 본체는 tests/unit/exit-check-boundary.test.ts 다. 이 규칙은 import type 도 막는다(화면은 타입도
  //   입구 쪽에서 받는다. 단위 시험은 src/lib 의 화면 모델을 위해 import type 을 허용한다). 같은 규칙을 다른 블록에 또 두면
  //   겹치는 파일에서 앞 블록의 옵션(headcount)이 통째로 바뀌므로 이 옵션 객체 안에만 둔다.
  {
    files: ["src/app/**"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{ name: "@/lib/headcount", message: "화면은 @/lib/headcount-plan 만 씁니다." }],
        patterns: [{
          group: ["@/lib/exit-check", "@/lib/exit-check/**"],
          message: "화면은 엔진 사본을 직접 가져오지 않습니다. @/lib/exit-check-demo 를 씁니다.",
        }],
      }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
