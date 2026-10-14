import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: { include: ['tests/unit/**/*.test.ts', 'src/lib/search/__tests__/source-contracts.test.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
});
