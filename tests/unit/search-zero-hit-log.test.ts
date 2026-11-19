// 261119 — /decisions 에서 결과 0건인 검색어를 서버 로그(Vercel)에 한 줄 남긴다. 검색 개선의 정답 세트 재료.
// DB 에 쓰지 않는다(공용 DB 디스크 I/O 한도). 주민번호·전화번호 모양은 가린다.
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: mocks }));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
import { runSearch, zeroHitLogLine } from '@/lib/decisions-data';

beforeEach(() => vi.restoreAllMocks());

it('결과 0건인 1쪽 검색만 한 줄 남긴다', async () => {
  // 운영 빌드는 removeConsole 로 console.* 를 지운다(next.config) → 표준출력에 직접 쓴다
  const info = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
  await runSearch('없는 검색어', 'admin', 1);
  expect(info).toHaveBeenCalledTimes(1);
  expect(info.mock.calls[0][0]).toBe('[zero-hit] type=admin q=없는 검색어\n');

  info.mockClear();
  mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
  await runSearch('없는 검색어', 'admin', 2);           // 뒷페이지가 빈 것은 결과 끝이다
  mocks.rpc.mockResolvedValueOnce({ data: [{ id: 'x', title: 't' }], error: null });
  await runSearch('있는 검색어', 'admin', 1);
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'timeout' } });
  await runSearch('오류 난 검색어', 'admin', 1);         // 오류는 0건이 아니다
  expect(info).not.toHaveBeenCalled();
});

it('주민번호·전화번호 모양은 가리고 사건번호는 그대로 둔다', () => {
  expect(zeroHitLogLine('홍길동 900101-1234567 해고', 'court')).toBe('[zero-hit] type=court q=홍길동 [가림] 해고');
  expect(zeroHitLogLine('010-1234-5678 연락', 'nlrc')).toBe('[zero-hit] type=nlrc q=[가림] 연락');
  expect(zeroHitLogLine('2013누8181', 'court')).toBe('[zero-hit] type=court q=2013누8181');
  expect(zeroHitLogLine('가'.repeat(120), 'admin')).toBe('[zero-hit] type=admin q=' + '가'.repeat(80));
});
