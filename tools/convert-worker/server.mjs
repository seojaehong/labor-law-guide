// HTTP 모드 — Lightsail·아무 Docker 호스트·로컬 PC. 의존성 없음(Node 22+).
//   POST /convert?to=xlsx|xls|pdf   본문 = 파일 바이트, 헤더 x-filename, Authorization: Bearer <CONVERT_TOKEN>
//   POST /jobs                      본문 = JSON {op, inputUrl, outputUrl, args} — 서명 URL 방식(jobs.mjs)
//   GET  /health
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { checkAuth, errorResponse, handle, loadConfig } from './core.mjs';

function send(res, out) {
  res.writeHead(out.status, { ...out.headers, 'content-length': out.body.length, 'cache-control': 'no-store' });
  res.end(out.body);
}

// 본문을 읽되 상한을 넘으면 즉시 멈춘다. 넘으면 null.
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let over = false;
    req.on('data', (c) => {
      if (over) return;
      size += c.length;
      if (size > limit) {
        over = true;
        chunks.length = 0;
        resolve(null);
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!over) resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
  });
}

export function createApp(config = loadConfig()) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      const base = { method: req.method, path: url.pathname, query: url.searchParams, headers: req.headers };

      if (url.pathname === '/convert' && req.method === 'POST') {
        // 인증 → 크기 순서로, 본문을 읽기 전에 거른다.
        const authErr = checkAuth(config, req.headers.authorization);
        if (authErr) {
          req.resume();
          return send(res, authErr);
        }
        const declared = Number(req.headers['content-length'] || 0);
        if (declared > config.maxInputBytes) {
          req.resume();
          res.setHeader('connection', 'close');
          return send(res, errorResponse('INPUT_TOO_LARGE', `input exceeds ${config.maxInputBytes} bytes`));
        }
        const body = await readBody(req, config.maxInputBytes);
        if (body === null) {
          res.setHeader('connection', 'close');
          return send(res, errorResponse('INPUT_TOO_LARGE', `input exceeds ${config.maxInputBytes} bytes`));
        }
        return send(res, await handle(config, { ...base, body }));
      }
      if (url.pathname === '/jobs' && req.method === 'POST') {
        // 본문은 작은 JSON 뿐이다(파일 바이트는 서명 URL 로 주고받는다). 인증 먼저, 상한 넘으면 읽다가 멈춘다.
        const authErr = checkAuth(config, req.headers.authorization);
        if (authErr) {
          req.resume();
          return send(res, authErr);
        }
        const body = await readBody(req, config.jobMaxRequestBytes);
        if (body === null) {
          res.setHeader('connection', 'close');
          return send(res, errorResponse('INPUT_TOO_LARGE', `request exceeds ${config.jobMaxRequestBytes} bytes`));
        }
        return send(res, await handle(config, { ...base, body }));
      }
      req.resume();
      return send(res, await handle(config, { ...base, body: null }));
    } catch {
      if (!res.headersSent) send(res, errorResponse('INTERNAL', 'unexpected error'));
    }
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const config = loadConfig();
  if (!config.token) {
    console.error('CONVERT_TOKEN is not set — refusing to start');
    process.exit(1);
  }
  const port = Number(process.env.PORT || 8080);
  const server = createApp(config);
  server.requestTimeout = Math.max(config.timeoutMs, config.jobTimeoutMs) + 60_000;
  server.listen(port, () => console.log(JSON.stringify({ t: new Date().toISOString(), msg: 'listening', port })));
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
