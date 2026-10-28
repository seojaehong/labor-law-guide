import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // 상시 근로자 수: 화면은 엔진 입력을 직접 만들지 않는다. 입구는 headcount-plan 의 toInput 하나다.
  {
    files: ["src/app/**"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{ name: "@/lib/headcount", message: "화면은 @/lib/headcount-plan 만 씁니다." }],
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
