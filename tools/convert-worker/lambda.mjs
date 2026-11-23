// Lambda 모드 — Function URL(payload 2.0) 이벤트를 core.handle 로 옮긴다.
// Lambda 응답·요청 크기는 각각 6MB 이고 바이너리는 base64(4/3 배)로 실리므로
// 원본 기준 약 4.4MB 가 실제 상한이다 → 넘으면 INPUT_TOO_LARGE / OUTPUT_TOO_LARGE.
import { handle, loadConfig } from './core.mjs';

const LAMBDA_PAYLOAD_RAW_MAX = 4_400_000;

function lambdaConfig(env = process.env) {
  const c = loadConfig(env);
  const cap = Number.parseInt(env.LAMBDA_MAX_PAYLOAD_BYTES || '', 10) || LAMBDA_PAYLOAD_RAW_MAX;
  c.maxInputBytes = Math.min(c.maxInputBytes, cap);
  c.maxOutputBytes = c.maxOutputBytes ? Math.min(c.maxOutputBytes, cap) : cap;
  c.maxQueue = 0; // Lambda 는 인스턴스 1개 = 요청 1건. 동시성은 Lambda 가 인스턴스로 푼다
  return c;
}

let config;

export async function handler(event) {
  config ??= lambdaConfig();
  const headers = {};
  for (const [k, v] of Object.entries(event?.headers || {})) headers[k.toLowerCase()] = v;
  const raw = event?.body ?? '';
  const body = raw ? Buffer.from(raw, event.isBase64Encoded ? 'base64' : 'utf8') : Buffer.alloc(0);
  const res = await handle(config, {
    method: event?.requestContext?.http?.method || 'GET',
    path: event?.rawPath || '/',
    query: new URLSearchParams(event?.rawQueryString || ''),
    headers,
    body,
  });
  return {
    statusCode: res.status,
    headers: { ...res.headers, 'cache-control': 'no-store' },
    body: res.body.toString('base64'),
    isBase64Encoded: true,
  };
}

export { lambdaConfig };
