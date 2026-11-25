// 양정 사례는 1차에 우리만 쓴다(261122 결정) — SANCTION_API_TOKEN 이 맞을 때만 연다.
// 토큰은 Authorization: Bearer 또는 URL ?key= 로 받는다(claude.ai 커넥터는 머리줄을 못 넣는다).
import { timingSafeEqual } from 'node:crypto';

const MIN_LEN = 16;

export function sanctionTokenFrom(request: Request): string {
  const h = request.headers.get('authorization') ?? '';
  if (h.toLowerCase().startsWith('bearer ')) return h.slice(7).trim();
  try {
    return new URL(request.url).searchParams.get('key') ?? '';
  } catch {
    return '';
  }
}

export function sanctionAuthorized(request: Request): boolean {
  const want = process.env.SANCTION_API_TOKEN ?? '';
  const got = sanctionTokenFrom(request);
  if (want.length < MIN_LEN || got.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(want));
}
