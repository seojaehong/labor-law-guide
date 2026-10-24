import { startServiceObservation, type Stage, type ErrorCode } from '@/lib/observations/service-completion';
// 규정 정비 점검 — 글자층이 없는(스캔) pdf 쪽 하나를 이미지로 받아 글자로 돌려준다.
// - 담당자가 화면에서 「이 N쪽을 서버로 보내 읽기」에 동의한 쪽만 온다. 나머지 규정 파일은 브라우저 밖으로 나가지 않는다.
// - 이미지·읽은 글자는 저장하지 않는다. 로그에도 본문을 남기지 않는다(상태·모델·에러 종류만).
// - 먼저 하이쿠로 읽고, 덜 읽었으면(잘림·판독 불가·거의 빈 쪽·거절) 그 쪽만 소넷으로 다시 읽는다.
// - 키는 RULES_OCR_ANTHROPIC_API_KEY → WORK_RULES_PRECISE_ANTHROPIC_API_KEY → ANTHROPIC_API_KEY 순. 셋 다 없으면 501 로 닫힌다.
import Anthropic from '@anthropic-ai/sdk';
import { isTurnstileEnabled, verifyTurnstile } from '@/lib/turnstile';
import { extractIp, hashIp, incrRateLimit } from '@/lib/rate-limit';
import { readPage, type OcrModel } from '@/lib/rules-review/ocr-call';
import { checkPass, issuePass } from '@/lib/rules-review/ocr-pass';

export const runtime = 'nodejs';
// 요청 진입부터 52초 안에 끝낸다 — 하이쿠 최대 20초(재시도 없음), 소넷은 남은 시간만(재시도 없음).
// 60초를 넘기면 플랫폼 504 를 앞단(Cloudflare)이 제 화면으로 바꿔 본문·통행증이 사라지고 두 호출 비용만 나간다
export const maxDuration = 60;
const BUDGET_MS = 52_000;
const HAIKU_TIMEOUT_MS = 20_000;
// 남은 시간이 이보다 적으면 소넷을 부르지 않는다 — 읽다 끊길 호출에 비용을 쓰지 않게
const MIN_SONNET_MS = 10_000;

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
// 비용 폭주 1차 방어선 — 쪽 단위로 센다. 기관 규정 묶음 하나의 스캔 쪽이 수십~수백 쪽이다
const IP_DAILY_PAGES = parseInt(process.env.RULES_OCR_IP_DAILY_PAGES || '300', 10);
const GLOBAL_DAILY_PAGES = parseInt(process.env.RULES_OCR_GLOBAL_DAILY_PAGES || '3000', 10);

type Obj = Record<string, unknown>;
/** 상위 API 가 돌려준 상태 코드(시간 초과·연결 실패면 null) — 키·본문은 남기지 않는다 */
const upstreamStatus = (err: unknown) => (typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : null);
const json = (status: number, body: Obj) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

type UploadFile = { size: number; type: string; arrayBuffer: () => Promise<ArrayBuffer> };
const isFile = (v: FormDataEntryValue | null): v is FormDataEntryValue & UploadFile =>
  !!v && typeof v === 'object' && typeof (v as UploadFile).size === 'number' && typeof (v as UploadFile).arrayBuffer === 'function';

export async function POST(req: Request): Promise<Response> {
  const started = Date.now();
  let stage: Stage = 'validation';
  const observation = startServiceObservation('rules_review_ocr', req.signal, () => stage);
  const codes: Record<string, ErrorCode> = { not_configured: 'not_configured', bot_check_failed: 'blocked', rate_limited: 'rate_limited', ocr_failed: 'upstream_failed', unreadable: 'parse_failed', limit_unavailable: 'internal_error' };
  const respond = (status: number, body: Obj) => {
    observation.finish({ stage: status === 200 ? 'completed' : stage, outcome: status === 200 ? 'success' : 'failure',
      error_code: status === 200 ? 'none' : codes[String(body.error)] ?? 'invalid_request', result_count: status === 200 ? 1 : null });
    return json(status, body);
  };

  // 기본 키(ANTHROPIC_API_KEY)는 작업공간 미지정 키라 400 이 난다 — 운영에서 도는 정밀 점검 키를 먼저 쓴다
  const apiKey = process.env.RULES_OCR_ANTHROPIC_API_KEY || process.env.WORK_RULES_PRECISE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return respond(501, { error: 'not_configured', message: '스캔 쪽 읽기를 준비 중입니다. 같은 규정의 한글 원본을 올려 주세요.' });

  let form: FormData;
  try { form = await req.formData(); } catch { return respond(400, { error: 'bad_request', message: '쪽 이미지를 보내 주세요.' }); }
  const image = form.get('image');
  if (!isFile(image) || !TYPES.includes(image.type)) return respond(400, { error: 'bad_request', message: '쪽 이미지(JPG·PNG·WEBP)를 보내 주세요.' });
  if (image.size > MAX_IMAGE_BYTES) return respond(413, { error: 'too_large', message: '쪽 이미지가 4MB 를 넘습니다.' });

  const ip = extractIp(req);
  // 자동 확인은 묶음당 한 번 — 통과하면 통행증을 주고, 이 요청의 응답(성공·실패 모두)에 싣는다
  let pass: string | null = null;
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (isTurnstileEnabled() && secret && !checkPass(form.get('pass'), hashIp(ip), secret)) {
    const token = form.get('turnstileToken');
    const ts = await verifyTurnstile(typeof token === 'string' ? token : null, ip);
    if (!ts.skipped && !ts.success) return respond(403, { error: 'bot_check_failed', message: '자동 확인에 실패했습니다. 잠시 뒤 다시 시도해 주세요.' });
    if (!ts.skipped) pass = issuePass(hashIp(ip), secret);
  }
  const reply = (status: number, body: Obj) => respond(status, pass ? { ...body, pass } : body);
  // 카운터가 죽으면 incrRateLimit 은 통과(fail-open)로 답한다 — 쪽마다 모델 비용이 나가는 이 라우트는 닫는다
  const limitDown = () => reply(503, { error: 'limit_unavailable', message: '이용량 확인이 잠시 되지 않아 스캔 쪽 읽기를 멈췄습니다. 잠시 뒤 다시 시도해 주세요.' });
  // IP 를 먼저 센다 — IP 에서 막힌 요청이 전체 하루 예산을 깎지 않게
  const ipLimit = await incrRateLimit('ip', `rr_ocr:${hashIp(ip)}`, IP_DAILY_PAGES);
  if (ipLimit.failed) return limitDown();
  if (!ipLimit.allowed)
    return reply(429, { error: 'rate_limited', message: `스캔 쪽 읽기는 하루 ${IP_DAILY_PAGES}쪽까지입니다. 내일 이어서 하거나 한글 원본을 올려 주세요.` });
  const globalLimit = await incrRateLimit('global', 'rr_ocr_all', GLOBAL_DAILY_PAGES);
  if (globalLimit.failed) return limitDown();
  if (!globalLimit.allowed)
    return reply(429, { error: 'rate_limited', message: '오늘 스캔 쪽 읽기 이용량이 많아 멈췄습니다. 내일 다시 시도하거나 한글 원본을 올려 주세요.' });

  try {
    stage = 'generation';
    const client = new Anthropic({ apiKey });
    const data = Buffer.from(await image.arrayBuffer()).toString('base64');
    // 하이쿠가 덜 읽었거나 호출 자체가 실패하면 소넷으로 다시 읽는다
    const left = () => BUDGET_MS - (Date.now() - started);
    let got = await readPage(client, 'haiku', image.type, data, { timeoutMs: Math.max(1_000, Math.min(HAIKU_TIMEOUT_MS, left())), maxRetries: 0 }).catch((err) => {
      console.error('[rules-review/ocr] haiku error', upstreamStatus(err));
      return null;
    });
    let model: OcrModel = 'haiku';
    if (!got?.ok) {
      const rest = left();
      if (rest < MIN_SONNET_MS) {
        console.log('[rules-review/ocr] sonnet skipped', got ? 'unreadable' : 'haiku_failed');
        if (got) return reply(422, { error: 'unreadable', message: '이 쪽은 글자를 읽지 못했습니다. 원본 파일을 확인해 주세요.' });
        return reply(503, { error: 'ocr_failed', upstream: null, message: '스캔 쪽을 읽지 못했습니다. 잠시 뒤 다시 시도해 주세요.' });
      }
      got = await readPage(client, 'sonnet', image.type, data, { timeoutMs: rest, maxRetries: 0 });
      model = 'sonnet';
    }
    console.log('[rules-review/ocr]', model, got.ok ? 'ok' : 'unreadable');
    if (!got.ok) return reply(422, { error: 'unreadable', message: '이 쪽은 글자를 읽지 못했습니다. 원본 파일을 확인해 주세요.' });
    return reply(200, { model, lines: got.text.split('\n').map((l) => l.trim()).filter(Boolean) });
  } catch (err) {
    console.error('[rules-review/ocr] error', err instanceof Error ? err.name : 'unknown', upstreamStatus(err));
    // 502·504 는 앞단(Cloudflare)이 제 오류 화면으로 바꿔 본문이 사라진다 — 503 으로 돌려 사유를 남긴다
    return reply(503, { error: 'ocr_failed', upstream: upstreamStatus(err), message: '스캔 쪽을 읽지 못했습니다. 잠시 뒤 다시 시도해 주세요.' });
  }
}
