// 스캔 쪽 읽기 통행증 — 자동 확인(turnstile)을 묶음당 한 번만 받는다.
// 쪽마다 새 토큰을 받으면 수십 쪽 묶음 중간에 토큰이 끊긴다(운영 실측 3회 11·0·3쪽에서 끊김).
// 확인을 통과하면 10분짜리 서명 통행증(만료.IP 해시.서명)을 주고, 그 안에서는 통행증으로 확인을 대신한다. 쪽 단위 하루 한도는 그대로 센다.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const PASS_TTL_MS = 10 * 60_000;

const sign = (body: string, key: string) => createHmac('sha256', key).update(body).digest('base64url');

export function issuePass(ipHash: string, key: string, now = Date.now()): string {
  const body = `${now + PASS_TTL_MS}.${ipHash}`;
  return `${body}.${sign(body, key)}`;
}

export function checkPass(pass: unknown, ipHash: string, key: string, now = Date.now()): boolean {
  if (typeof pass !== 'string') return false;
  const cut = pass.lastIndexOf('.');
  if (cut < 0) return false;
  const body = pass.slice(0, cut);
  const got = Buffer.from(pass.slice(cut + 1));
  const want = Buffer.from(sign(body, key));
  if (got.length !== want.length || !timingSafeEqual(got, want)) return false;
  const dot = body.indexOf('.');
  return Number(body.slice(0, dot)) > now && body.slice(dot + 1) === ipHash;
}
