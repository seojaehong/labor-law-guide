import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/lib/observations/service-completion', () => ({ startServiceObservation: () => ({ finish: () => {} }) }));

// 261124 도구 전수 검수(오푸스·페이블·아스트라 합의) P0 — 실제 직원 파일은 법률·개인정보 검토 전까지 닫는다(합성 시연만).
// 운영에 열려 있던 것: /tools/leave 「엑셀 파일 열기」·명부 「기억하기」(localStorage), 계약서 점검 파일 업로드(→ Anthropic).
// 열려면 NEXT_PUBLIC_REAL_FILE_INPUT=1 로 다시 배포한다(빌드 시점 값).
const src = (p: string) => readFileSync(resolve(p), 'utf8');

/** needle 이 나오는 모든 자리 바로 앞(span 글자 안)에 게이트 이름이 있는가 */
function gated(text: string, needle: string, span = 700) {
  const at: number[] = [];
  for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + 1)) at.push(i);
  expect(at.length).toBeGreaterThan(0);
  return at.every((i) => text.slice(Math.max(0, i - span), i).includes('REAL_FILE_INPUT'));
}

describe('real employee files stay closed by default', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('the gate is off unless NEXT_PUBLIC_REAL_FILE_INPUT=1', async () => {
    vi.stubEnv('NEXT_PUBLIC_REAL_FILE_INPUT', '');
    vi.resetModules();
    expect((await import('@/lib/real-file-gate')).REAL_FILE_INPUT).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_REAL_FILE_INPUT', '1');
    vi.resetModules();
    expect((await import('@/lib/real-file-gate')).REAL_FILE_INPUT).toBe(true);
  });

  it('/tools/leave — file input and 「대장을 그대로 올리셔도」 only behind the gate', () => {
    const leave = src('src/components/leave/LeaveInput.tsx');
    expect(gated(leave, 'type="file"')).toBe(true);
    expect(gated(leave, '쓰시던 대장을 그대로')).toBe(true);
  });

  it('/tools/leave — 「명부를 기억하기」(localStorage) only behind the gate', () => {
    expect(gated(src('src/components/leave/WorkspaceBar.tsx'), '명부를 기억하기')).toBe(true);
  });

  it('leave pages and the registry stop inviting real ledgers', () => {
    expect(src('src/app/tools/leave/page.tsx')).not.toMatch(/파일 열기|명단을 그대로/);
    expect(src('src/components/leave/SettlementInput.tsx')).not.toContain('엑셀을 한 번');
    const reg = src('src/content/tools-registry.ts');
    expect(reg.slice(reg.indexOf("href: '/tools/leave'"), reg.indexOf("href: '/tools/leave'") + 300)).not.toContain('엑셀');
  });

  it('contract-check — the upload card and its file banner only behind the gate', () => {
    const cc = src('src/app/tools/contract-check/ContractCheckClient.tsx');
    expect(gated(cc, '<PhotoUploadCard')).toBe(true);
    expect(gated(cc, '파일은 통째로 전송되므로')).toBe(true);
  });

  it('contract-check extract API refuses while the gate is off, even with an API key', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'synthetic-key');
    vi.stubEnv('NEXT_PUBLIC_REAL_FILE_INPUT', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.resetModules();
    const { POST } = await import('@/app/api/tools/contract-check/extract/route');
    const form = new FormData();
    form.append('images', new File([new Uint8Array(10)], 'p.jpg', { type: 'image/jpeg' }));
    const res = await POST(new Request('http://localhost/api/tools/contract-check/extract', { method: 'POST', body: form }));
    expect(res.status).toBe(501);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('/ai tells people what is kept before they type', () => {
  it('shows the stored items and the retention period next to the question box', () => {
    const ai = src('src/app/ai/SourceFinder.tsx');
    const form = ai.indexOf('<form onSubmit={handleSubmit}');
    const near = ai.slice(form, form + 3000);
    expect(near).toMatch(/질문 앞부분 500자/);
    expect(near).toMatch(/IP 해시/);
    expect(near).toContain('chatLogRetention');
    expect(near).toMatch(/개인정보 처리방침/);
  });
});
