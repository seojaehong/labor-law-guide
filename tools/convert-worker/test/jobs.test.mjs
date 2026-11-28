// node --test tools/convert-worker/test/jobs.test.mjs
// 서명 URL 방식 POST /jobs — 로컬 HTTP 가짜 스토리지로 시험한다(네트워크·DB 키 없음, 자료는 합성).
// office op 는 k-labor/office 묶음(tools/k-labor/dist/office/index.mjs 또는 K_LABOR_OFFICE_MODULE)을 쓴다 — 먼저 `node tools/k-labor/build.mjs`.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { after, before, describe, test } from 'node:test';

import { loadConfig, officeModulePath } from '../core.mjs';
import { handler } from '../lambda.mjs';
import { createApp } from '../server.mjs';

process.env.CONVERT_QUIET = '1';
const TOKEN = 'test-token-0123456789';
const sha = (b) => createHash('sha256').update(b).digest('hex');

// ── 가짜 스토리지 — GET /obj/<key> 는 저장된 바이트, PUT /obj/<key> 는 저장. 특수 경로로 실패를 흉내 낸다
function startStorage() {
  const objects = new Map();
  const hits = [];
  const server = createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/redirect') {
      res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' });
      return res.end();
    }
    if (url.pathname === '/hang') return; // 응답하지 않는다(시간 초과 시험)
    if (url.pathname === '/huge') {
      res.writeHead(200, { 'content-type': 'application/octet-stream' }); // content-length 없이 흘려 보낸다
      const chunk = Buffer.alloc(64 * 1024);
      let sent = 0;
      const pump = () => {
        while (sent < 8 * 1024 * 1024) {
          sent += chunk.length;
          if (!res.write(chunk)) return res.once('drain', pump);
        }
        res.end();
      };
      return pump();
    }
    if (url.pathname === '/put-fails' && req.method === 'PUT') {
      req.resume();
      res.writeHead(403);
      return res.end('denied');
    }
    if (req.method === 'GET') {
      const b = objects.get(url.pathname);
      if (!b) {
        res.writeHead(404);
        return res.end();
      }
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': b.length });
      return res.end(b);
    }
    if (req.method === 'PUT') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        objects.set(url.pathname, Buffer.concat(chunks));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"Key":"ok"}');
      });
      return;
    }
    res.writeHead(405);
    res.end();
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, objects, hits, base: `http://127.0.0.1:${server.address().port}` })));
}

function startWorker(env) {
  const config = loadConfig({ ...process.env, CONVERT_TOKEN: TOKEN, ...env });
  return new Promise((ok) => {
    const server = createApp(config);
    server.listen(0, '127.0.0.1', () => ok({ server, url: `http://127.0.0.1:${server.address().port}`, config }));
  });
}

async function job(url, body, token = TOKEN) {
  const headers = { 'content-type': 'application/json' };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  const r = await fetch(`${url}/jobs`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
  return { status: r.status, json: await r.json() };
}

const noOffice = existsSync(officeModulePath()) ? false : `k-labor/office 묶음 없음(${officeModulePath()}) — node tools/k-labor/build.mjs`;

describe('POST /jobs — 서명 URL 방식', () => {
  let st;
  let w;
  let hostOnly;
  before(async () => {
    st = await startStorage();
    hostOnly = new URL(st.base).host;
    w = await startWorker({ ALLOWED_STORAGE_HOSTS: hostOnly, STORAGE_ALLOW_HTTP: '1', JOB_FETCH_TIMEOUT_MS: '1500' });
  });
  after(() => {
    w.server.closeAllConnections();
    w.server.close();
    st.server.closeAllConnections();
    st.server.close();
  });

  test('xlsx.make → 결과를 outputUrl 로 PUT, 응답은 JSON(data·warnings·sha256·bytes)', { skip: noOffice }, async () => {
    const r = await job(w.url, {
      op: 'xlsx.make',
      outputUrl: `${st.base}/obj/out/made.xlsx?token=signed`,
      args: { spec: { sheets: [{ name: '평가표', columns: [{ key: 'id', header: 'ID' }, { key: 'h', header: '위험요인' }] }] } },
    });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.ok, true);
    assert.deepEqual(r.json.data.sheets, ['평가표']);
    const stored = st.objects.get('/obj/out/made.xlsx');
    assert.ok(stored);
    assert.equal(r.json.output.sha256, sha(stored));
    assert.equal(r.json.output.bytes, stored.length);
    assert.match(r.json.output.contentType, /spreadsheetml/);
    assert.equal(r.json.meta.engine.name, 'k-labor/office');
    assert.ok(Array.isArray(r.json.warnings));
  });

  test('xlsx.fill — inputUrl 을 GET, 채운 파일을 PUT, 보존 보고를 JSON 으로', { skip: noOffice }, async () => {
    const tpl = st.objects.get('/obj/out/made.xlsx');
    st.objects.set('/obj/in/tpl.xlsx', tpl);
    const r = await job(w.url, {
      op: 'xlsx.fill',
      inputUrl: `${st.base}/obj/in/tpl.xlsx`,
      outputUrl: `${st.base}/obj/out/filled.xlsx`,
      args: { rows: { sheet: '평가표', startRow: 2, columns: { A: 'id', B: 'h' }, data: [{ id: 'H1', h: '합성 위험요인' }] } },
    });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.data.preserved.allSame, true);
    assert.equal(r.json.input.sha256, sha(tpl));
    assert.equal(r.json.output.sha256, sha(st.objects.get('/obj/out/filled.xlsx')));

    const ex = await job(w.url, { op: 'xlsx.extract', inputUrl: `${st.base}/obj/out/filled.xlsx`, args: { sheet: '평가표' } });
    assert.equal(ex.status, 200);
    assert.equal(ex.json.data.rows[0].cells['위험요인'].raw, '합성 위험요인');
    assert.equal(ex.json.output, undefined);
  });

  test('pptx.meeting → pptx.extract', { skip: noOffice }, async () => {
    const snapshot = { site: '합성', cycle: '1회차', basisDate: '2026-11-23', status: { label: '초안' }, scaleId: 's', scaleName: '합성 척도', prior: [], hazards: [], photos: [], opinions: [], questions: [], anchors: [] };
    const mk = await job(w.url, { op: 'pptx.meeting', outputUrl: `${st.base}/obj/out/deck.pptx`, args: { snapshot, kind: 'pre' } });
    assert.equal(mk.status, 200, JSON.stringify(mk.json));
    const ex = await job(w.url, { op: 'pptx.extract', inputUrl: `${st.base}/obj/out/deck.pptx` });
    assert.equal(ex.json.data.slides.length, mk.json.data.slides.length);
  });

  test('pptx.tbm → pptx.extract', { skip: noOffice }, async () => {
    const snapshot = { site: '합성', workDate: '2026-12-02', basisDate: '2026-12-01', tasks: [{ id: 'T-1', process: '합성 작업', hazards: [{ id: 'H-1', situation: '합성 위험', measures: ['합성 대책'] }] }] };
    const mk = await job(w.url, { op: 'pptx.tbm', outputUrl: `${st.base}/obj/out/tbm.pptx`, args: { snapshot, maxHazards: 2 } });
    assert.equal(mk.status, 200, JSON.stringify(mk.json));
    assert.deepEqual(mk.json.data.picks, [{ taskId: 'T-1', shown: ['H-1'], omitted: [] }]);
    const ex = await job(w.url, { op: 'pptx.extract', inputUrl: `${st.base}/obj/out/tbm.pptx` });
    assert.equal(ex.json.data.slides.length, 1);
  });

  test('pptx.broadcast — 확정 스냅숏 → 7장', { skip: noOffice }, async () => {
    const snapshot = { kind: 'final', site: '합성', cycle: '2회차', basisDate: '2026-11-23', status: { label: '확정', version: 1 }, scaleId: 's', scaleName: '합성 척도', prior: [], hazards: [], photos: [], opinions: [], questions: [], anchors: [] };
    const mk = await job(w.url, { op: 'pptx.broadcast', outputUrl: `${st.base}/obj/out/bc.pptx`, args: { snapshot } });
    assert.equal(mk.status, 200, JSON.stringify(mk.json));
    assert.equal(mk.json.data.slides.length, 7);
  });

  test('pptx.broadcast — design 을 넘기면 프리셋 부품·16:9 로 만든다', { skip: noOffice }, async () => {
    const snapshot = { kind: 'final', site: '합성', cycle: '2회차', basisDate: '2026-11-23', status: { label: '확정', version: 1 }, scaleId: 's', scaleName: '합성 척도', prior: [], hazards: [], photos: [], opinions: [], questions: [], anchors: [] };
    const mk = await job(w.url, { op: 'pptx.broadcast', outputUrl: `${st.base}/obj/out/bc-field.pptx`, args: { snapshot, design: 'field' } });
    assert.equal(mk.status, 200, JSON.stringify(mk.json));
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(st.objects.get('/obj/out/bc-field.pptx'));
    assert.match(await zip.file('ppt/presentation.xml').async('string'), /<p:sldSz cx="12192000" cy="6858000"/);
    assert.match(await zip.file('ppt/slides/slide1.xml').async('string'), /name="part:tile-grid"/);
  });

  test('pptx.education — 교안 스냅숏 → 5장(사례 없음)', { skip: noOffice }, async () => {
    const snapshot = { site: '합성', basisDate: '2026-11-23', educationDate: '2026-12-01', course: 'hire', hazards: [{ id: 'H-1', situation: '합성 위험', measures: ['합성 대책'] }] };
    const mk = await job(w.url, { op: 'pptx.education', outputUrl: `${st.base}/obj/out/ed.pptx`, args: { snapshot } });
    assert.equal(mk.status, 200, JSON.stringify(mk.json));
    assert.equal(mk.json.data.slides.length, 5);
  });

  test('office op 실패는 Result 코드 그대로(UNSUPPORTED_INPUT 422), PUT 하지 않는다', { skip: noOffice }, async () => {
    st.objects.set('/obj/in/not.xlsx', Buffer.from('plain text'));
    const before = st.hits.length;
    const r = await job(w.url, { op: 'xlsx.fill', inputUrl: `${st.base}/obj/in/not.xlsx`, outputUrl: `${st.base}/obj/out/never.xlsx`, args: { cells: [{ sheet: 's', cell: 'A1', value: 1 }] } });
    assert.equal(r.status, 422);
    assert.equal(r.json.code, 'UNSUPPORTED_INPUT');
    assert.equal(st.objects.has('/obj/out/never.xlsx'), false);
    assert.ok(!st.hits.slice(before).some((h) => h.startsWith('PUT')));
  });

  test('허용 목록 밖 호스트는 요청 전에 403 HOST_NOT_ALLOWED(SSRF 차단)', async () => {
    const before = st.hits.length;
    for (const u of ['http://169.254.169.254/latest/meta-data/', 'http://localhost:1/x', `http://user:pw@${hostOnly}/obj/in/tpl.xlsx`, 'file:///etc/passwd']) {
      const r = await job(w.url, { op: 'xlsx.inspect', inputUrl: u });
      assert.equal(r.status, 403, u);
      assert.equal(r.json.code, 'HOST_NOT_ALLOWED', u);
    }
    assert.equal(st.hits.length, before);
  });

  test('http 는 STORAGE_ALLOW_HTTP=1 일 때만(기본 https 만)', async () => {
    const strict = await startWorker({ ALLOWED_STORAGE_HOSTS: hostOnly });
    try {
      const r = await job(strict.url, { op: 'xlsx.inspect', inputUrl: `${st.base}/obj/in/tpl.xlsx` });
      assert.equal(r.status, 403);
      assert.equal(r.json.code, 'HOST_NOT_ALLOWED');
    } finally {
      strict.server.close();
    }
  });

  test('STORAGE_ALLOW_HTTP=1 이어도 loopback 이 아닌 허용 호스트의 http 는 거절', async () => {
    const lax = await startWorker({ ALLOWED_STORAGE_HOSTS: `storage.example.test,${hostOnly}`, STORAGE_ALLOW_HTTP: '1' });
    try {
      const r = await job(lax.url, { op: 'xlsx.inspect', inputUrl: 'http://storage.example.test/obj/in/tpl.xlsx' });
      assert.equal(r.status, 403);
      assert.equal(r.json.code, 'HOST_NOT_ALLOWED');
    } finally {
      lax.server.close();
    }
  });

  test('리다이렉트는 따라가지 않는다', async () => {
    const r = await job(w.url, { op: 'xlsx.inspect', inputUrl: `${st.base}/redirect` });
    assert.equal(r.status, 502);
    assert.equal(r.json.code, 'FETCH_FAILED');
  });

  test('입력 상한 — content-length 없이 흘려도 읽는 중에 멈춘다', async () => {
    const small = await startWorker({ ALLOWED_STORAGE_HOSTS: hostOnly, STORAGE_ALLOW_HTTP: '1', JOB_MAX_INPUT_BYTES: String(1024 * 1024) });
    try {
      const r = await job(small.url, { op: 'xlsx.inspect', inputUrl: `${st.base}/huge` });
      assert.equal(r.status, 413);
      assert.equal(r.json.code, 'INPUT_TOO_LARGE');
    } finally {
      small.server.close();
    }
  });

  test('스토리지가 응답하지 않으면 시간 초과', async () => {
    const t0 = Date.now();
    const r = await job(w.url, { op: 'xlsx.inspect', inputUrl: `${st.base}/hang` });
    assert.equal(r.status, 504);
    assert.equal(r.json.code, 'TIMEOUT');
    assert.ok(Date.now() - t0 < 10_000);
  });

  test('PUT 실패는 UPLOAD_FAILED', { skip: noOffice }, async () => {
    const r = await job(w.url, { op: 'xlsx.make', outputUrl: `${st.base}/put-fails`, args: { spec: { sheets: [{ name: 's', columns: [{ key: 'a', header: 'A' }] }] } } });
    assert.equal(r.status, 502);
    assert.equal(r.json.code, 'UPLOAD_FAILED');
  });

  test('없는 404 입력은 FETCH_FAILED', async () => {
    const r = await job(w.url, { op: 'xlsx.inspect', inputUrl: `${st.base}/obj/none.xlsx` });
    assert.equal(r.status, 502);
    assert.equal(r.json.code, 'FETCH_FAILED');
  });

  test('요청 검사 — 인증·JSON·op·필수 URL', async () => {
    assert.equal((await job(w.url, { op: 'xlsx.inspect' }, null)).status, 401);
    assert.equal((await job(w.url, '{not json')).json.code, 'BAD_REQUEST');
    assert.equal((await job(w.url, { op: 'shell.exec', inputUrl: `${st.base}/x` })).json.code, 'BAD_REQUEST');
    assert.equal((await job(w.url, { op: 'xlsx.inspect' })).json.code, 'BAD_REQUEST'); // inputUrl 없음
    assert.equal((await job(w.url, { op: 'xlsx.make', args: { spec: { sheets: [] } } })).json.code, 'BAD_REQUEST'); // outputUrl 없음
    assert.equal((await job(w.url, { op: 'convert', inputUrl: `${st.base}/x`, outputUrl: `${st.base}/y`, args: { from: 'exe', to: 'pdf' } })).json.code, 'UNSUPPORTED_FORMAT');
  });

  test('요청 JSON 상한 — 넘으면 413, 인증 실패는 본문을 읽기 전에 401', async () => {
    const tight = await startWorker({ ALLOWED_STORAGE_HOSTS: hostOnly, STORAGE_ALLOW_HTTP: '1', JOB_MAX_REQUEST_BYTES: '256' });
    try {
      const big = { op: 'xlsx.make', outputUrl: `${st.base}/obj/out/big.xlsx`, args: { pad: 'x'.repeat(1024) } };
      const r = await job(tight.url, big);
      assert.equal(r.status, 413);
      assert.equal(r.json.code, 'INPUT_TOO_LARGE');
      const bad = await job(tight.url, big, 'wrong-token');
      assert.equal(bad.status, 401);
      assert.equal(st.objects.has('/obj/out/big.xlsx'), false);
    } finally {
      tight.server.close();
    }
  });

  test('ALLOWED_STORAGE_HOSTS 가 비면 모든 작업을 거절한다', async () => {
    const none = await startWorker({ ALLOWED_STORAGE_HOSTS: '' });
    try {
      const r = await job(none.url, { op: 'xlsx.inspect', inputUrl: `${st.base}/obj/in/tpl.xlsx` });
      assert.equal(r.status, 503);
      assert.equal(r.json.code, 'MISCONFIGURED');
    } finally {
      none.server.close();
    }
  });

  test('office op 시간 상한 — 작업 스레드를 끝낸다', { skip: noOffice }, async () => {
    const slow = await startWorker({ ALLOWED_STORAGE_HOSTS: hostOnly, STORAGE_ALLOW_HTTP: '1', JOB_TIMEOUT_MS: '1' });
    try {
      const r = await job(slow.url, { op: 'xlsx.make', outputUrl: `${st.base}/obj/out/slow.xlsx`, args: { spec: { sheets: [{ name: 's', columns: [{ key: 'a', header: 'A' }] }] } } });
      assert.equal(r.status, 504);
      assert.equal(r.json.code, 'TIMEOUT');
      assert.equal(st.objects.has('/obj/out/slow.xlsx'), false);
    } finally {
      slow.server.close();
    }
  });

  test('Lambda 이벤트 경로도 같은 처리', { skip: noOffice }, async () => {
    const env = { CONVERT_TOKEN: TOKEN, ALLOWED_STORAGE_HOSTS: hostOnly, STORAGE_ALLOW_HTTP: '1' };
    const saved = {};
    for (const [k, v] of Object.entries(env)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
    try {
      const body = JSON.stringify({ op: 'xlsx.make', outputUrl: `${st.base}/obj/out/lambda.xlsx`, args: { spec: { sheets: [{ name: 's', columns: [{ key: 'a', header: 'A' }] }] } } });
      const res = await handler({
        rawPath: '/jobs',
        requestContext: { http: { method: 'POST' } },
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: Buffer.from(body).toString('base64'),
        isBase64Encoded: true,
      });
      assert.equal(res.statusCode, 200);
      const json = JSON.parse(Buffer.from(res.body, 'base64').toString());
      assert.equal(json.ok, true);
      assert.equal(json.output.sha256, sha(st.objects.get('/obj/out/lambda.xlsx')));
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});

// LibreOffice 변환 op — soffice 가 있을 때만
const cfg = loadConfig({ ...process.env, CONVERT_TOKEN: TOKEN });
const sofficeOk = cfg.sofficePath !== 'soffice' ? existsSync(cfg.sofficePath) : !!process.env.SOFFICE_PATH;
describe('POST /jobs op=convert', () => {
  test('xlsx → pdf 를 서명 URL 로 주고받는다', { skip: sofficeOk && !noOffice ? false : 'soffice 또는 office 묶음 없음', timeout: 120_000 }, async () => {
    const st = await startStorage();
    const w = await startWorker({ ALLOWED_STORAGE_HOSTS: new URL(st.base).host, STORAGE_ALLOW_HTTP: '1' });
    try {
      const make = await job(w.url, { op: 'xlsx.make', outputUrl: `${st.base}/obj/src.xlsx`, args: { spec: { sheets: [{ name: '평가표', columns: [{ key: 'a', header: '가' }], rows: [{ a: '합성' }] }] } } });
      assert.equal(make.status, 200);
      const r = await job(w.url, { op: 'convert', inputUrl: `${st.base}/obj/src.xlsx`, outputUrl: `${st.base}/obj/out.pdf`, args: { from: 'xlsx', to: 'pdf' } });
      assert.equal(r.status, 200, JSON.stringify(r.json));
      const pdf = st.objects.get('/obj/out.pdf');
      assert.equal(pdf.subarray(0, 4).toString('latin1'), '%PDF');
      assert.equal(r.json.output.sha256, sha(pdf));
      assert.equal(r.json.output.contentType, 'application/pdf');
    } finally {
      w.server.close();
      st.server.close();
    }
  });
});
