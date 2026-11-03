// 정밀 점검 서버 간 호출 키 — 일의 무늬 MCP(tools/ilmunui-mcp)가 화면의 자동 확인(turnstile) 대신 쓴다.
// - 서버 env WORK_RULES_PRECISE_MCP_KEY 가 비었거나 너무 짧으면 이 경로는 꺼진다(Bearer 를 무시하고 화면 경로로 본다).
// - 비교는 두 값의 sha256 을 timingSafeEqual 로 — 길이가 늘 같아 길이로도 새지 않는다.
// - 키 원문은 어디에도 남기지 않는다. 한도 카운터 이름에는 키 sha256 앞 32자만 쓴다.
import { createHash, timingSafeEqual } from 'node:crypto';

/** 키가 이보다 짧으면 설정 실수로 보고 경로를 끈다(추측 가능한 짧은 값 방지) */
export const MIN_KEY_LENGTH = 32;

export type McpAuth =
  /** Authorization: Bearer 가 없다 — 화면 경로 그대로 */
  | { kind: 'none' }
  /** 키가 맞다 — 자동 확인을 건너뛰고 키 한도로 센다 */
  | { kind: 'key'; limitKey: string }
  /** Bearer 가 있는데 맞지 않다 */
  | { kind: 'bad' };

const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest();

export function mcpKeyEnabled(configured: string | undefined): boolean {
  return (configured?.trim().length ?? 0) >= MIN_KEY_LENGTH;
}

/** 요청의 Authorization 머리글과 서버에 설정한 키를 맞춰 본다. 키가 꺼져 있으면 Bearer 가 있어도 none 이다. */
export function mcpAuth(header: string | null, configured: string | undefined): McpAuth {
  const m = header?.match(/^\s*Bearer\s+(\S+)\s*$/i);
  if (!m || !mcpKeyEnabled(configured)) return { kind: 'none' };
  const want = digest(configured!.trim());
  if (!timingSafeEqual(digest(m[1]), want)) return { kind: 'bad' };
  return { kind: 'key', limitKey: `wrpk:${want.toString('hex').slice(0, 32)}` };
}
