// 클라이언트 IP 판정 — 레이트리밋 키의 단일 출처.
//
// 왜 별도 모듈인가: 같은 로직이 rate-limit.ts와 contract-check/extract/route.ts에 각각
// 복사돼 있었고, 한쪽만 고치면 다른 쪽이 조용히 틀린 키로 카운트한다. 실제로 그렇게 됐다.
// supabase를 import하지 않는 순수 모듈이라 어디서든 안전하게 가져다 쓸 수 있다.

import crypto from 'crypto';

/**
 * 이 사이트는 **Cloudflare → Vercel** 2단이다.
 * Vercel이 보는 `x-forwarded-for`의 첫 항목은 Cloudflare 엣지 IP이고, PoP·커넥션마다
 * 달라질 수 있다. 그 값을 레이트리밋 키로 쓰면 카운터가 매번 새 행에 쌓여 **제한이 영원히
 * 걸리지 않는다** — 에러도 로그도 없이 조용히 무제한이 된다(2026-08-01 실측).
 *
 * 진짜 클라이언트 IP는 Cloudflare가 `cf-connecting-ip`에 넣어 준다. 이걸 최우선으로 본다.
 */
export function extractIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const first = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  return first || req.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** IP는 원문으로 저장하지 않는다. salt를 섞어 해시한 앞 32자만 키로 쓴다. */
export function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT || 'yh-bok-default-salt';
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}
