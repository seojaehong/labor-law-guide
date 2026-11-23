// 변환 핵심 — server.mjs(HTTP)와 lambda.mjs(Lambda)가 같이 쓴다.
// 요청 하나 = 새 임시 폴더 + 새 LibreOffice 프로필. 끝나면 지운다. 파일 내용·이름은 기록하지 않는다.
import { spawn } from 'node:child_process';
import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// 입력 확장자 → 허용 출력. hwpx 는 LibreOffice 가 읽지 못해 받지 않는다.
// hwp 는 LibreOffice 의 옛 HWP 필터(HWP 97 이전 형식)만 읽는다 — 요즘 HWP 5.x 는 CONVERT_FAILED 로 끝난다.
const SHEET_OUT = ['xlsx', 'xls', 'pdf'];
export const FORMAT_MATRIX = Object.freeze({
  xls: SHEET_OUT,
  xlsx: SHEET_OUT,
  xlsm: SHEET_OUT,
  ods: SHEET_OUT,
  doc: ['pdf'],
  docx: ['pdf'],
  ppt: ['pdf'],
  pptx: ['pdf'],
  hwp: ['pdf'],
});

// LibreOffice --convert-to 인자. 출력 형식을 필터 이름으로 못박는다.
const FILTERS = {
  xlsx: 'xlsx:Calc MS Excel 2007 XML',
  xls: 'xls:MS Excel 97',
  pdf: 'pdf',
};

export const CONTENT_TYPES = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  pdf: 'application/pdf',
};

const STATUS = {
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  EMPTY_INPUT: 400,
  UNSUPPORTED_FORMAT: 415,
  INPUT_TOO_LARGE: 413,
  BUSY: 429,
  CONVERT_FAILED: 422,
  OUTPUT_TOO_LARGE: 502,
  TIMEOUT: 504,
  MISCONFIGURED: 503,
  INTERNAL: 500,
};

const MB = 1024 * 1024;

function defaultSoffice() {
  if (process.platform === 'win32') {
    const p = 'C:/Program Files/LibreOffice/program/soffice.exe';
    if (existsSync(p)) return p;
  }
  return 'soffice';
}

function intEnv(env, name, fallback) {
  const v = Number.parseInt(env[name] ?? '', 10);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

export function loadConfig(env = process.env) {
  return {
    token: env.CONVERT_TOKEN || '',
    sofficePath: env.SOFFICE_PATH || defaultSoffice(),
    maxInputBytes: intEnv(env, 'CONVERT_MAX_INPUT_BYTES', 20 * MB),
    maxOutputBytes: intEnv(env, 'CONVERT_MAX_OUTPUT_BYTES', 0), // 0 = 제한 없음(HTTP). Lambda 는 따로 정한다
    timeoutMs: intEnv(env, 'CONVERT_TIMEOUT_MS', 60_000),
    maxQueue: intEnv(env, 'CONVERT_MAX_QUEUE', 4), // 진행 중 1건 + 대기 N건. 넘으면 429
    workDir: env.CONVERT_WORK_DIR || tmpdir(),
  };
}

export function errorResponse(code, message) {
  return {
    status: STATUS[code] ?? 500,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: Buffer.from(JSON.stringify({ ok: false, code, message })),
    code,
  };
}

function digest(s) {
  return createHash('sha256').update(String(s)).digest();
}

// 토큰 비교 — 길이 차이도 새지 않도록 해시끼리 상수시간 비교.
export function checkAuth(config, authorizationHeader) {
  if (!config.token) return errorResponse('MISCONFIGURED', 'CONVERT_TOKEN is not set');
  const m = /^Bearer\s+(.+)$/i.exec(authorizationHeader || '');
  if (!m) return errorResponse('UNAUTHORIZED', 'missing bearer token');
  if (!timingSafeEqual(digest(m[1].trim()), digest(config.token))) {
    return errorResponse('UNAUTHORIZED', 'invalid token');
  }
  return null;
}

// 파일명에서 확장자만 쓴다. 이름 자체는 디스크에도 로그에도 남기지 않는다.
export function extOf(filename) {
  let name = String(filename || '');
  try {
    name = decodeURIComponent(name);
  } catch {
    /* 그대로 */
  }
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name.trim());
  return m ? m[1].toLowerCase() : '';
}

export function checkFormat(ext, to) {
  const outs = FORMAT_MATRIX[ext];
  if (!outs) return errorResponse('UNSUPPORTED_FORMAT', `input .${ext || '?'} not allowed`);
  if (!outs.includes(to)) return errorResponse('UNSUPPORTED_FORMAT', `.${ext} -> ${to || '?'} not allowed`);
  return null;
}

// ── 한 번에 한 건 ──────────────────────────────────────────
let running = false;
const waiters = [];

async function acquire(maxQueue) {
  if (!running) {
    running = true;
    return true;
  }
  if (waiters.length >= maxQueue) return false;
  await new Promise((resolve) => waiters.push(resolve));
  return true;
}

function release() {
  const next = waiters.shift();
  if (next) next();
  else running = false;
}

// ── soffice 실행 ──────────────────────────────────────────
function killTree(child) {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') {
      // soffice.exe 는 soffice.bin 을 자식으로 띄운다. 내가 띄운 PID 의 트리만 죽인다.
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      process.kill(-child.pid, 'SIGKILL'); // detached 로 띄웠으므로 프로세스 그룹 전체
    }
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      /* 이미 끝남 */
    }
  }
}

function runSoffice(config, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(config.sofficePath, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      detached: process.platform !== 'win32',
      windowsHide: true,
      env: { ...process.env },
    });
    let stderr = '';
    let timedOut = false;
    child.stderr.on('data', (d) => {
      if (stderr.length < 4000) stderr += d.toString();
    });
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeoutMs);
    const done = (code, spawnError) => {
      clearTimeout(timer);
      resolve({ code, timedOut, stderr, spawnError });
    };
    child.on('error', (e) => done(null, e));
    child.on('close', (code) => done(code));
  });
}

async function removeDir(dir) {
  // 죽인 soffice.bin 이 잠시 파일을 쥐고 있을 수 있어 몇 번 다시 시도한다.
  await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }).catch(() => {});
}

/**
 * 변환 1건. bytes = 입력 파일, ext = 입력 확장자, to = 출력 형식.
 * 반환 = { status, headers, body, code? }
 */
export async function convert(config, { bytes, ext, to }) {
  const fmtErr = checkFormat(ext, to);
  if (fmtErr) return fmtErr;
  if (!bytes || bytes.length === 0) return errorResponse('EMPTY_INPUT', 'empty body');
  if (bytes.length > config.maxInputBytes) {
    return errorResponse('INPUT_TOO_LARGE', `input exceeds ${config.maxInputBytes} bytes`);
  }
  if (!(await acquire(config.maxQueue))) return errorResponse('BUSY', 'converter busy, retry later');

  let dir;
  try {
    dir = await mkdtemp(join(config.workDir, 'cvw-'));
    const inPath = join(dir, `input.${ext}`);
    const outDir = join(dir, 'out');
    const profile = join(dir, 'profile');
    await writeFile(inPath, bytes);
    const args = [
      `-env:UserInstallation=${pathToFileURL(profile).href}`,
      '--headless',
      '--invisible',
      '--nologo',
      '--nodefault',
      '--nolockcheck',
      '--norestore',
      '--nofirststartwizard',
      '--convert-to',
      FILTERS[to],
      '--outdir',
      outDir,
      inPath,
    ];
    const r = await runSoffice(config, args, config.timeoutMs);
    if (r.timedOut) return errorResponse('TIMEOUT', `conversion exceeded ${config.timeoutMs} ms`);
    if (r.spawnError) return errorResponse('MISCONFIGURED', `cannot start soffice: ${r.spawnError.code || 'error'}`);

    // 종료코드가 0 이어도 입력을 못 읽은 경우가 있다 — 산출물이 실제로 있는지로 판정한다.
    const outPath = join(outDir, `input.${to}`);
    const st = await stat(outPath).catch(() => null);
    if (!st || st.size === 0) {
      return errorResponse('CONVERT_FAILED', `LibreOffice produced no output (exit ${r.code})`);
    }
    if (config.maxOutputBytes && st.size > config.maxOutputBytes) {
      return errorResponse('OUTPUT_TOO_LARGE', `output ${st.size} bytes exceeds ${config.maxOutputBytes}`);
    }
    const out = await readFile(outPath);
    return { status: 200, headers: { 'content-type': CONTENT_TYPES[to] }, body: out };
  } catch (e) {
    return errorResponse('INTERNAL', e?.code || 'unexpected error');
  } finally {
    if (dir) await removeDir(dir);
    release();
  }
}

/**
 * HTTP·Lambda 공통 라우팅. body 는 이미 읽힌 Buffer(또는 null).
 * req = { method, path, query: URLSearchParams, headers(소문자 키), body }
 */
export async function handle(config, req) {
  const started = Date.now();
  let res;
  let ext = '';
  let to = '';
  if (req.path === '/health') {
    res =
      req.method === 'GET'
        ? { status: 200, headers: { 'content-type': 'application/json' }, body: Buffer.from('{"ok":true}') }
        : errorResponse('METHOD_NOT_ALLOWED', 'use GET');
    return res;
  }
  if (req.path !== '/convert') return errorResponse('NOT_FOUND', 'unknown path');
  if (req.method !== 'POST') return errorResponse('METHOD_NOT_ALLOWED', 'use POST');

  res = checkAuth(config, req.headers.authorization);
  if (!res) {
    ext = extOf(req.headers['x-filename']);
    to = String(req.query.get('to') || '').toLowerCase();
    res = await convert(config, { bytes: req.body, ext, to });
  }
  log({ ext, to, inBytes: req.body?.length ?? 0, outBytes: res.status === 200 ? res.body.length : 0, status: res.status, code: res.code, ms: Date.now() - started });
  return res;
}

// 길이·확장자·결과만 남긴다. 파일명·내용은 남기지 않는다.
export function log(fields) {
  if (process.env.CONVERT_QUIET === '1') return;
  console.log(JSON.stringify({ t: new Date().toISOString(), ...fields }));
}
