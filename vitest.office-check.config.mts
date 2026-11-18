import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

// npm run office:samples — 엔진 산출물 견본을 만들어 tools/office-check 로 검사한다.
// python 이 필요해 기본 `npm test` 에는 넣지 않는다.
const root = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  test: { include: ['tests/office-check/**/*.test.ts'], testTimeout: 600_000 },
  resolve: { alias: { '@': path.resolve(root, 'src') } },
});
