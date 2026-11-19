// 261119 — 운영 빌드의 removeConsole 이 console.error·warn 까지 지워 서버 오류가 Vercel 로그에 남지 않았다.
// 오류·경고는 남기고 나머지(log·info·debug)만 지운다.
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it('운영 빌드는 console.error·warn 을 남긴다', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  const { default: config } = await import('../../next.config');
  expect(config.compiler?.removeConsole).toEqual({ exclude: ['error', 'warn'] });
});

it('개발 빌드는 console 을 지우지 않는다', async () => {
  vi.stubEnv('NODE_ENV', 'development');
  const { default: config } = await import('../../next.config');
  expect(config.compiler?.removeConsole).toBe(false);
});
