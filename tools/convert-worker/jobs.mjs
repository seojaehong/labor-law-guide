// POST /jobs — 서명 URL 방식. 파일 바이트는 요청·응답 본문에 싣지 않는다(Vercel 4.5MB·Lambda 6MB 한도 회피).
//   요청 JSON {op, inputUrl?, outputUrl?, args?}
//   작업자: inputUrl 을 GET → op 실행 → 결과 파일을 outputUrl 로 PUT → JSON {ok, op, data, warnings, input?, output?, meta}
// ★ 허용 호스트(ALLOWED_STORAGE_HOSTS)만 접근한다(SSRF 차단). https 만, 리다이렉트는 따라가지 않는다. DB 키는 없다.
// ★ URL(서명 토큰 포함)·파일명·내용은 로그에 남기지 않는다.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { CONTENT_TYPES, checkFormat, convert, errorResponse, officeModulePath } from './core.mjs';

/** op → 입력·출력 필요 여부 */
export const JOB_OPS = Object.freeze({
  convert: { input: true, output: true },
  'xlsx.inspect': { input: true, output: false },
  'xlsx.extract': { input: true, output: false },
  'xlsx.fill': { input: true, output: true },
  'xlsx.make': { input: false, output: true },
  'pptx.meeting': { input: false, output: true },
  'pptx.extract': { input: true, output: false },
  'pptx.tbm': { input: false, output: true },
});

// office 라이브러리 실패 코드 → HTTP. 나머지는 core 의 STATUS 표
const OFFICE_STATUS = {
  INVALID_ARGS: 422,
  UNSUPPORTED_INPUT: 422,
  OVERFLOW: 422,
  PRESERVATION_LOSS: 422,
  WORKLOAD_TOO_LARGE: 422,
  ZIP_TOO_LARGE: 422,
  WRITE_FAILED: 422,
  OUTPUT_TOO_LARGE: 422,
  RESULT_TOO_LARGE: 422,
};

const sha256 = (b) => createHash('sha256').update(b).digest('hex');

function jsonResponse(status, obj, code) {
  return { status, headers: { 'content-type': 'application/json; charset=utf-8' }, body: Buffer.from(JSON.stringify(obj)), code };
}

/** 실패 응답 — core.errorResponse 와 같은 모양에 details·warnings 를 더한다 */
function jobError(code, message, extra = {}) {
  const base = errorResponse(code, message);
  const status = OFFICE_STATUS[code] ?? base.status;
  return jsonResponse(status, { ok: false, code, message, ...extra }, code);
}

class JobError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/** 저장소 URL 검사 — 허용 호스트·https·자격 증명 없음. 통과하면 URL, 아니면 JobError */
export function checkStorageUrl(config, raw, label) {
  let u;
  try {
    u = new URL(String(raw ?? ''));
  } catch {
    throw new JobError('BAD_REQUEST', `${label} is not a URL`);
  }
  const deny = (why) => new JobError('HOST_NOT_ALLOWED', `${label}: ${why}`);
  if (u.username || u.password) throw deny('credentials in URL are not allowed');
  // http 는 시험용 — STORAGE_ALLOW_HTTP=1 이고 loopback 호스트일 때만
  if (!(u.protocol === 'https:' || (u.protocol === 'http:' && config.allowHttp && LOOPBACK.has(u.hostname.toLowerCase())))) {
    throw deny(`scheme ${u.protocol} not allowed`);
  }
  if (!config.allowedHosts.includes(u.host.toLowerCase())) throw deny('host not in ALLOWED_STORAGE_HOSTS');
  return u;
}

function remainingMs(deadline) {
  return Math.max(1, deadline - Date.now());
}

function isTimeout(e) {
  return e?.name === 'TimeoutError' || e?.name === 'AbortError' || e?.cause?.name === 'TimeoutError';
}

/** 입력 GET — 리다이렉트 안 따라감, 크기 상한(선언·실제), 시간 상한 */
async function fetchInput(config, url, deadline) {
  let res;
  try {
    res = await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(Math.min(config.jobFetchTimeoutMs, remainingMs(deadline))) });
  } catch (e) {
    if (isTimeout(e)) throw new JobError('TIMEOUT', 'input download timed out');
    throw new JobError('FETCH_FAILED', `input download failed: ${e?.cause?.code || e?.name || 'error'}`);
  }
  if (res.status !== 200) {
    await res.body?.cancel().catch(() => {});
    throw new JobError('FETCH_FAILED', `input download returned HTTP ${res.status}`);
  }
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > config.jobMaxInputBytes) {
    await res.body?.cancel().catch(() => {});
    throw new JobError('INPUT_TOO_LARGE', `input exceeds ${config.jobMaxInputBytes} bytes`);
  }
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > config.jobMaxInputBytes) {
        await reader.cancel().catch(() => {});
        throw new JobError('INPUT_TOO_LARGE', `input exceeds ${config.jobMaxInputBytes} bytes`);
      }
      chunks.push(value);
    }
  } catch (e) {
    if (e instanceof JobError) throw e;
    if (isTimeout(e)) throw new JobError('TIMEOUT', 'input download timed out');
    throw new JobError('FETCH_FAILED', 'input download interrupted');
  }
  if (size === 0) throw new JobError('EMPTY_INPUT', 'input is empty');
  return new Uint8Array(Buffer.concat(chunks));
}

/** 결과 PUT — 리다이렉트 안 따라감, 시간 상한, 2xx 만 성공 */
async function putOutput(config, url, bytes, contentType, deadline) {
  let res;
  try {
    res = await fetch(url, {
      method: 'PUT',
      body: bytes,
      headers: { 'content-type': contentType, 'content-length': String(bytes.length) },
      redirect: 'manual',
      signal: AbortSignal.timeout(Math.min(config.jobFetchTimeoutMs, remainingMs(deadline))),
    });
  } catch (e) {
    if (isTimeout(e)) throw new JobError('TIMEOUT', 'output upload timed out');
    throw new JobError('UPLOAD_FAILED', `output upload failed: ${e?.cause?.code || e?.name || 'error'}`);
  }
  await res.body?.cancel().catch(() => {});
  if (res.status < 200 || res.status >= 300) throw new JobError('UPLOAD_FAILED', `output upload returned HTTP ${res.status}`);
}

/** office op 를 작업 스레드에서 — 시간이 넘으면 스레드를 끝낸다 */
function runOfficeOp(config, op, input, args, deadline) {
  const modulePath = officeModulePath();
  if (!existsSync(modulePath)) return Promise.reject(new JobError('MISCONFIGURED', 'k-labor/office module not found (K_LABOR_OFFICE_MODULE)'));
  return new Promise((resolve, reject) => {
    const limits = {
      maxInputBytes: config.jobMaxInputBytes,
      maxUnzippedBytes: config.jobMaxUnzippedBytes,
      maxZipEntries: config.jobMaxZipEntries,
      maxCells: config.jobMaxCells,
      maxOutputBytes: config.jobMaxOutputBytes,
    };
    const worker = new Worker(new URL('./office-thread.mjs', import.meta.url), {
      workerData: { modulePath, op, input, args, limits },
      resourceLimits: config.jobMaxOldGenMb ? { maxOldGenerationSizeMb: config.jobMaxOldGenMb } : undefined,
    });
    let settled = false;
    const finish = (fn, v) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(v);
    };
    const timer = setTimeout(() => {
      worker.terminate().catch(() => {});
      finish(reject, new JobError('TIMEOUT', `office op exceeded ${config.jobTimeoutMs} ms`));
    }, remainingMs(deadline));
    worker.once('message', (r) => {
      finish(resolve, r);
      worker.terminate().catch(() => {});
    });
    worker.once('error', (e) => finish(reject, new JobError(e?.code === 'ERR_WORKER_OUT_OF_MEMORY' ? 'WORKLOAD_TOO_LARGE' : 'INTERNAL', e?.code === 'ERR_WORKER_OUT_OF_MEMORY' ? 'office op ran out of memory' : 'office op crashed')));
    worker.once('exit', (code) => finish(reject, new JobError('INTERNAL', `office op exited (${code})`)));
  });
}

/** 요청 JSON 검사 */
function parseJob(body) {
  let job;
  try {
    job = JSON.parse(Buffer.from(body ?? '').toString('utf8'));
  } catch {
    throw new JobError('BAD_REQUEST', 'body must be JSON');
  }
  if (!job || typeof job !== 'object' || Array.isArray(job)) throw new JobError('BAD_REQUEST', 'body must be a JSON object');
  const spec = JOB_OPS[job.op];
  if (!spec) throw new JobError('BAD_REQUEST', `op must be one of ${Object.keys(JOB_OPS).join(', ')}`);
  if (job.args !== undefined && (typeof job.args !== 'object' || job.args === null || Array.isArray(job.args))) throw new JobError('BAD_REQUEST', 'args must be an object');
  if (spec.input && !job.inputUrl) throw new JobError('BAD_REQUEST', `op ${job.op} needs inputUrl`);
  if (spec.output && !job.outputUrl) throw new JobError('BAD_REQUEST', `op ${job.op} needs outputUrl`);
  return { op: job.op, inputUrl: job.inputUrl, outputUrl: job.outputUrl, args: job.args ?? {}, spec };
}

/** 작업 1건. 반환 = core 응답 모양 {status, headers, body, code?} + 로그용 크기 */
export async function runJob(config, body) {
  const started = Date.now();
  const deadline = started + config.jobTimeoutMs;
  const stats = { op: '', inBytes: 0, outBytes: 0 };
  try {
    if (!config.allowedHosts.length) throw new JobError('MISCONFIGURED', 'ALLOWED_STORAGE_HOSTS is not set');
    const job = parseJob(body);
    stats.op = job.op;
    // 네트워크에 닿기 전에 두 URL 을 다 검사한다
    const inUrl = job.spec.input ? checkStorageUrl(config, job.inputUrl, 'inputUrl') : null;
    const outUrl = job.spec.output ? checkStorageUrl(config, job.outputUrl, 'outputUrl') : null;
    if (job.op === 'convert') {
      const from = String(job.args.from ?? '').toLowerCase();
      const to = String(job.args.to ?? '').toLowerCase();
      const fmt = checkFormat(from, to);
      if (fmt) return { ...fmt, stats };
    }

    const input = inUrl ? await fetchInput(config, inUrl, deadline) : null;
    stats.inBytes = input?.length ?? 0;

    let result; // {data, warnings, meta?, file?: {bytes, mime}}
    if (job.op === 'convert') {
      const from = String(job.args.from).toLowerCase();
      const to = String(job.args.to).toLowerCase();
      const r = await convert({ ...config, maxInputBytes: config.jobMaxInputBytes, maxOutputBytes: config.jobMaxOutputBytes }, { bytes: Buffer.from(input), ext: from, to });
      if (r.status !== 200) return { ...r, stats };
      result = { data: { from, to }, warnings: r.warnings ?? [], file: { bytes: new Uint8Array(r.body), mime: CONTENT_TYPES[to] } };
    } else {
      const r = await runOfficeOp(config, job.op, input, job.args, deadline);
      if (!r.ok) {
        const extra = { warnings: r.warnings ?? [] };
        if (r.details !== undefined) extra.details = r.details;
        if (r.meta) extra.meta = r.meta;
        return { ...jobError(r.code ?? 'INTERNAL', r.message ?? 'office op failed', extra), stats };
      }
      const f = r.files?.[0];
      result = { data: r.data, warnings: r.warnings ?? [], meta: r.meta, file: f ? { bytes: f.bytes, mime: f.mime } : undefined };
    }

    // 응답 JSON 크기 상한 — 넘으면 PUT 전에 멈춘다
    const reply = { ok: true, op: job.op, data: result.data, warnings: result.warnings };
    if (input) reply.input = { sha256: sha256(input), bytes: input.length };
    if (result.meta) reply.meta = result.meta;
    if (result.file && outUrl) {
      if (result.file.bytes.length > config.jobMaxOutputBytes) throw new JobError('OUTPUT_TOO_LARGE', `output exceeds ${config.jobMaxOutputBytes} bytes`);
      reply.output = { sha256: sha256(result.file.bytes), bytes: result.file.bytes.length, contentType: result.file.mime };
    }
    const json = Buffer.from(JSON.stringify(reply));
    if (json.length > config.jobMaxResultBytes) throw new JobError('RESULT_TOO_LARGE', `result JSON exceeds ${config.jobMaxResultBytes} bytes`);
    if (result.file && outUrl) {
      await putOutput(config, outUrl, result.file.bytes, result.file.mime, deadline);
      stats.outBytes = result.file.bytes.length;
    }
    return { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' }, body: json, stats };
  } catch (e) {
    if (e instanceof JobError) return { ...jobError(e.code, e.message), stats };
    return { ...jobError('INTERNAL', 'unexpected error'), stats };
  }
}
