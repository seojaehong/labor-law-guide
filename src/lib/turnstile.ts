// Cloudflare Turnstile — 봇/스크래퍼 차단. env 미설정 시 자동 패스 (dev/베타초기).

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type TurnstileResult =
  | { skipped: true }
  | { skipped: false; success: true }
  | { skipped: false; success: false; reason: string };

export async function verifyTurnstile(token: string | null, ip: string): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { skipped: true };
  if (!token) return { skipped: false, success: false, reason: 'token_missing' };

  // 평가/측정 스크립트 우회: TURNSTILE_BYPASS_TOKEN과 일치하면 skip (timing-safe 비교)
  const bypass = process.env.TURNSTILE_BYPASS_TOKEN;
  if (bypass && token.length === bypass.length) {
    let diff = 0;
    for (let i = 0; i < bypass.length; i++) {
      diff |= bypass.charCodeAt(i) ^ token.charCodeAt(i);
    }
    if (diff === 0) return { skipped: true };
  }

  try {
    const body = new URLSearchParams();
    body.set('secret', secret);
    body.set('response', token);
    if (ip && ip !== 'unknown') body.set('remoteip', ip);

    const resp = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return { skipped: false, success: false, reason: `siteverify_${resp.status}` };
    const j = (await resp.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (j.success) return { skipped: false, success: true };
    return {
      skipped: false,
      success: false,
      reason: (j['error-codes'] || ['unknown']).join(','),
    };
  } catch (err) {
    return {
      skipped: false,
      success: false,
      reason: `exception:${err instanceof Error ? err.message : 'unknown'}`,
    };
  }
}

export function isTurnstileEnabled(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY;
}
