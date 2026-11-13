import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // testTimeout — 조합 전수 시험(계약서 작성기·연차수당·SafeClaw 원본 단언 등)이 전체 실행 부하에서 기본 5초를 넘긴다.
  // 261113 실측: 실행마다 다른 시험 1~4건이 시간 초과, 단독 실행은 전부 통과. 시험마다 늘리지 않고 여기서 한 번에 둔다.
  test: { include: ['tests/unit/**/*.test.ts', 'src/lib/search/__tests__/source-contracts.test.ts'], testTimeout: 30_000 },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
});
