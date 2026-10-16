import {afterEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {middleware} from '@/middleware';
afterEach(()=>vi.unstubAllEnvs());
it('production workspace gate precedes markdown negotiation and returns real 404',()=>{
  vi.stubEnv('NODE_ENV','production');vi.stubEnv('AI_WORKSPACE_DEMO','true');
  for(const path of ['/ai/workspace','/ai/workspace/subpath']) {
    const r=middleware(new NextRequest('https://yellowenvelope.kr'+path,{headers:{accept:'text/markdown'}}));
    expect(r.status).toBe(404);expect(r.headers.get('x-middleware-rewrite')).toBeNull();
  }
});
it('local enabled harness passes and existing public route stays unchanged',()=>{
  vi.stubEnv('NODE_ENV','development');vi.stubEnv('AI_WORKSPACE_DEMO','true');
  expect(middleware(new NextRequest('http://localhost/ai/workspace')).status).toBe(200);
  vi.stubEnv('NODE_ENV','production');
  expect(middleware(new NextRequest('https://yellowenvelope.kr/guide')).status).toBe(200);
});
