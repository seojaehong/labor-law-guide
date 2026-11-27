// node --test tools/convert-worker/test/
// LibreOffice 경로 = SOFFICE_PATH (윈도우 기본값 C:/Program Files/LibreOffice/program/soffice.exe)
// KOSHA 표본 폴더 = KOSHA_XLS_DIR (기본값은 아래). 표본은 저장소에 복사하지 않는다.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';

import { loadConfig } from '../core.mjs';
import { handler, lambdaConfig } from '../lambda.mjs';
import { createApp } from '../server.mjs';

process.env.CONVERT_QUIET = '1';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const requireRoot = createRequire(join(repoRoot, 'package.json'));
const ExcelJS = requireRoot('exceljs');
const XLSX = requireRoot('xlsx');

const TOKEN = 'test-token-0123456789';
const KOSHA_DIR =
  process.env.KOSHA_XLS_DIR ||
  'C:/Users/iceam/dev/sc-audit/evaluation/prd-v1-p0-2026-11-22/C_forms/KOSHA_위험성평가예시엑셀13종_2020';
const SAMPLE_LIMIT = Number(process.env.KOSHA_SAMPLE_LIMIT || 4);

const baseConfig = loadConfig({ ...process.env, CONVERT_TOKEN: TOKEN });
const sofficeOk = baseConfig.sofficePath !== 'soffice' ? existsSync(baseConfig.sofficePath) : !!process.env.SOFFICE_PATH;
const samples = existsSync(KOSHA_DIR)
  ? readdirSync(KOSHA_DIR)
      .filter((f) => f.toLowerCase().endsWith('.xls'))
      .sort()
      .slice(0, SAMPLE_LIMIT)
      .map((f) => join(KOSHA_DIR, f))
  : [];
const noSoffice = sofficeOk ? false : 'soffice not found (set SOFFICE_PATH)';
const noSamples = sofficeOk && samples.length ? false : noSoffice || 'KOSHA samples not found (set KOSHA_XLS_DIR)';

function startServer(config) {
  return new Promise((ok) => {
    const server = createApp(config);
    server.listen(0, '127.0.0.1', () => ok({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

async function post(url, { to = 'xlsx', name = 'a.xls', token = TOKEN, body = Buffer.from('x') } = {}) {
  const headers = { 'x-filename': encodeURIComponent(name) };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  const r = await fetch(`${url}/convert?to=${to}`, { method: 'POST', headers, body });
  const buf = Buffer.from(await r.arrayBuffer());
  const json = (r.headers.get('content-type') || '').includes('json') ? JSON.parse(buf.toString()) : null;
  return { status: r.status, type: r.headers.get('content-type'), buf, json };
}

// 병합은 「서로 다른 범위의 수」로 센다. KOSHA 90703 의 한 시트는 원본에 같은 병합 범위가
// 두 번 적혀 있어(17개 중 고유 16개) LibreOffice 가 하나로 합친다 — 잃은 병합은 없다(261123 실측).
const uniq = (ranges) => new Set(ranges).size;

function sheetjsStats(buf) {
  const wb = XLSX.read(buf, { type: 'buffer' });
  return {
    names: wb.SheetNames,
    merges: wb.SheetNames.map((n) => uniq((wb.Sheets[n]['!merges'] || []).map((m) => XLSX.utils.encode_range(m)))),
  };
}

async function exceljsStats(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return {
    names: wb.worksheets.map((w) => w.name),
    merges: wb.worksheets.map((w) => uniq(w.model.merges || [])),
  };
}

describe('HTTP 서버 — 거절 경로', () => {
  let srv;
  before(async () => {
    srv = await startServer({ ...baseConfig, maxInputBytes: 1024 });
  });
  after(() => srv.server.close());

  test('GET /health', async () => {
    const r = await fetch(`${srv.url}/health`);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true });
  });

  test('토큰 없음 → 401 UNAUTHORIZED', async () => {
    const r = await post(srv.url, { token: null });
    assert.equal(r.status, 401);
    assert.equal(r.json.code, 'UNAUTHORIZED');
    assert.equal(r.json.ok, false);
  });

  test('틀린 토큰 → 401 UNAUTHORIZED', async () => {
    const r = await post(srv.url, { token: 'wrong' });
    assert.equal(r.status, 401);
    assert.equal(r.json.code, 'UNAUTHORIZED');
  });

  test('허용 안 된 확장자 → 415 UNSUPPORTED_FORMAT', async () => {
    for (const [name, to] of [
      ['a.exe', 'pdf'],
      ['a.hwpx', 'pdf'],
      ['a', 'xlsx'],
      ['a.docx', 'xlsx'], // 문서 → 엑셀은 행렬에 없다
      ['a.xls', 'html'],
    ]) {
      const r = await post(srv.url, { name, to });
      assert.equal(r.status, 415, `${name} -> ${to}`);
      assert.equal(r.json.code, 'UNSUPPORTED_FORMAT');
    }
  });

  test('상한 초과 → 413 INPUT_TOO_LARGE', async () => {
    const r = await post(srv.url, { body: Buffer.alloc(2048, 1) });
    assert.equal(r.status, 413);
    assert.equal(r.json.code, 'INPUT_TOO_LARGE');
  });

  test('빈 본문 → 400 EMPTY_INPUT', async () => {
    const r = await post(srv.url, { body: Buffer.alloc(0) });
    assert.equal(r.status, 400);
    assert.equal(r.json.code, 'EMPTY_INPUT');
  });

  test('토큰 환경변수가 없으면 거절 → 503 MISCONFIGURED', async () => {
    const s = await startServer({ ...baseConfig, token: '' });
    try {
      const r = await post(s.url, {});
      assert.equal(r.status, 503);
      assert.equal(r.json.code, 'MISCONFIGURED');
    } finally {
      s.server.close();
    }
  });
});

describe('Lambda 어댑터 — 거절 경로', () => {
  test('Function URL 이벤트, 토큰 틀림 → 401', async () => {
    process.env.CONVERT_TOKEN = TOKEN;
    const res = await handler({
      rawPath: '/convert',
      rawQueryString: 'to=xlsx',
      headers: { Authorization: 'Bearer nope', 'X-Filename': 'a.xls' },
      body: Buffer.from('x').toString('base64'),
      isBase64Encoded: true,
      requestContext: { http: { method: 'POST' } },
    });
    assert.equal(res.statusCode, 401);
    assert.equal(res.isBase64Encoded, true);
    assert.equal(JSON.parse(Buffer.from(res.body, 'base64').toString()).code, 'UNAUTHORIZED');
  });

  test('Lambda 상한은 6MB 응답 한도에 맞춰 약 4.4MB', () => {
    const c = lambdaConfig({ CONVERT_TOKEN: TOKEN });
    assert.equal(c.maxInputBytes, 4_400_000);
    assert.equal(c.maxOutputBytes, 4_400_000);
  });
});

describe('실제 변환 (LibreOffice)', { skip: noSamples, timeout: 600_000 }, () => {
  let srv;
  before(async () => {
    srv = await startServer({ ...baseConfig, maxQueue: 0 });
  });
  after(() => srv.server.close());
  // 실변환 1건이 이 PC 에서 15~48초다(요청마다 새 프로필). `--test-timeout=30000` 아래에서도 돌도록 시험마다 상한을 따로 준다
  const REAL = { timeout: 180_000 };

  for (const [i, file] of samples.entries()) {
    test(`KOSHA 표본 #${i + 1} .xls → xlsx: 시트 수·병합 수 유지, 다시 xls 로 왕복`, REAL, async () => {
      const src = readFileSync(file);
      const orig = sheetjsStats(src);

      const r = await post(srv.url, { name: 'sample.xls', to: 'xlsx', body: src });
      assert.equal(r.status, 200, r.json ? JSON.stringify(r.json) : '');
      assert.match(r.type, /spreadsheetml/);
      const conv = await exceljsStats(r.buf);
      assert.deepEqual(conv.names, orig.names, '시트 이름·수');
      assert.deepEqual(conv.merges, orig.merges, '시트별 병합 수');

      const back = await post(srv.url, { name: 'sample.xlsx', to: 'xls', body: r.buf });
      assert.equal(back.status, 200, back.json ? JSON.stringify(back.json) : '');
      assert.equal(back.type, 'application/vnd.ms-excel');
      // BIFF8 서명(OLE2 D0CF11E0)
      assert.equal(back.buf.subarray(0, 4).toString('hex'), 'd0cf11e0');
      const round = sheetjsStats(back.buf);
      assert.deepEqual(round.names, orig.names, '왕복 후 시트 이름');
      assert.deepEqual(round.merges, orig.merges, '왕복 후 병합 수');
    });
  }

  test('.xls → pdf', REAL, async () => {
    const r = await post(srv.url, { name: 'sample.xls', to: 'pdf', body: readFileSync(samples[0]) });
    assert.equal(r.status, 200, r.json ? JSON.stringify(r.json) : '');
    assert.equal(r.buf.subarray(0, 5).toString(), '%PDF-');
  });

  test('반쪽 난 xlsx → 422 CONVERT_FAILED (종료코드 0 이어도 산출물이 없으면 실패)', REAL, async () => {
    const ok = await post(srv.url, { name: 'sample.xls', to: 'xlsx', body: readFileSync(samples[0]) });
    assert.equal(ok.status, 200);
    const half = ok.buf.subarray(0, ok.buf.length >> 1);
    const r = await post(srv.url, { name: 'broken.xlsx', to: 'xls', body: half });
    assert.equal(r.status, 422);
    assert.equal(r.json.code, 'CONVERT_FAILED');
  });

  test('동시에 두 건, 대기열 0 → 하나는 429 BUSY', REAL, async () => {
    const src = readFileSync(samples[0]);
    const [a, b] = await Promise.all([
      post(srv.url, { name: 's.xls', to: 'xlsx', body: src }),
      post(srv.url, { name: 's.xls', to: 'xlsx', body: src }),
    ]);
    const statuses = [a.status, b.status].sort();
    assert.deepEqual(statuses, [200, 429]);
    assert.equal((a.status === 429 ? a : b).json.code, 'BUSY');
  });

  test('시간 초과 → 504 TIMEOUT, soffice 종료·임시 폴더 삭제', REAL, async () => {
    const work = mkdtempSync(join(tmpdir(), 'cvw-test-'));
    const s = await startServer({ ...baseConfig, timeoutMs: 300, workDir: work });
    try {
      const r = await post(s.url, { name: 'sample.xls', to: 'xlsx', body: readFileSync(samples[0]) });
      assert.equal(r.status, 504);
      assert.equal(r.json.code, 'TIMEOUT');
      assert.deepEqual(await readdir(work), [], '요청 임시 폴더가 남지 않는다');
    } finally {
      s.server.close();
      rmSync(work, { recursive: true, force: true });
    }
  });

  test('Lambda 어댑터로 실제 변환', REAL, async () => {
    process.env.CONVERT_TOKEN = TOKEN;
    if (process.env.SOFFICE_PATH === undefined) process.env.SOFFICE_PATH = baseConfig.sofficePath;
    const src = readFileSync(samples[0]);
    const res = await handler({
      rawPath: '/convert',
      rawQueryString: 'to=xlsx',
      headers: { authorization: `Bearer ${TOKEN}`, 'x-filename': 'sample.xls' },
      body: src.toString('base64'),
      isBase64Encoded: true,
      requestContext: { http: { method: 'POST' } },
    });
    assert.equal(res.statusCode, 200);
    const conv = await exceljsStats(Buffer.from(res.body, 'base64'));
    assert.deepEqual(conv.names, sheetjsStats(src).names);
  });
});
