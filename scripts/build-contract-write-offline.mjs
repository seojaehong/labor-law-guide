// 근로계약서 작성(src/lib/contract-write/**)을 HTML 1장짜리 오프라인판으로 묶는다.
//
//   node scripts/build-contract-write-offline.mjs [--out <파일>]
//   기본 출력: dist-offline/contract-write.html (.gitignore — 저장소에 올리지 않는다)
//
// - 근로계약서 점검 오프라인판(build-contract-check-offline.mjs)과 같은 방식: vite build API, JS·CSS 인라인, prebuild 미연결.
// - 엑셀·한글·PDF 라이브러리의 동적 import 는 iife 단일 조각이라 번들 안으로 접힌다 — 파일을 받으러 나가지 않는다.
// - PDF 글꼴(나눔고딕 OFL 전체)은 <script id="cw-font" type="application/octet-stream"> 에 base64 로 싣는다.
//   글꼴 라이선스 전문(NanumGothic-OFL.txt)도 같은 HTML 의 주석이 아니라 바닥줄 아래 <details> 로 싣는다.
// - 규칙 카탈로그 데이터는 점검 오프라인판과 같은 투영(이름·조문·등급만)을 쓴다.
// - 화면을 여는 쪽은 CSP default-src 'none' 이라 혹시 남은 요청 코드가 있어도 나가지 못한다.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildInfo as checkBuildInfo } from './build-contract-check-offline.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = join(ROOT, 'src', 'offline', 'contract-write', 'entry.ts');
const FONT = join(ROOT, 'public', 'fonts', 'NanumGothic-Regular.ttf');
const FONT_LICENSE = join(ROOT, 'public', 'fonts', 'NanumGothic-OFL.txt');
export const DEFAULT_OUT = join(ROOT, 'dist-offline', 'contract-write.html');

const endsWithPath = (id, tail) => id.replace(/\\/g, '/').endsWith(tail);

function dataProjection() {
  return {
    name: 'contract-write-data-projection',
    enforce: 'pre',
    load(id) {
      if (endsWithPath(id, '/contract-check/data/compliance_rules.json')) {
        const src = JSON.parse(readFileSync(id, 'utf8'));
        const rules = src.rules.map(({ code, name, statute, severity }) => ({ code, name, statute, severity }));
        return JSON.stringify({ version: src.version, rules });
      }
      if (endsWithPath(id, '/contract-check/data/synthetic_edge_cases.json')) return '[]';
      return null;
    },
  };
}

export function buildInfo(now = new Date()) {
  const { date, sha } = checkBuildInfo(now);
  return { date, sha };
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const CSS = `
:root{--bg:#fff;--fg:#191f28;--sub:#4e5968;--line:#e5e8eb;--card:#f9fafb;--warn:#92400e;--on:#e8f3ff}
@media (prefers-color-scheme:dark){:root{--bg:#17171c;--fg:#f2f4f6;--sub:#b0b8c1;--line:#333d4b;--card:#202027;--warn:#ffd08a;--on:#1d3350}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:18px;margin:0 0 8px}
.lead,.sub,.hint{color:var(--sub)}.hint{display:block;font-size:12px}
#cw-form{display:grid;grid-template-columns:1fr;gap:12px;margin:16px 0}
@media (min-width:640px){#cw-form{grid-template-columns:1fr 1fr}}
.field{display:block}.label{display:block;font-weight:600;font-size:14px;margin-bottom:4px}
input,select{width:100%;min-height:44px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--fg);font:inherit}
.days{display:flex;flex-wrap:wrap;gap:6px}
button{min-height:44px;min-width:44px;padding:8px 14px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--fg);font:inherit;font-weight:600;cursor:pointer}
button.on{background:var(--on)}button.primary{background:var(--fg);color:var(--bg);border-color:var(--fg)}
#cw-result{border:1px solid var(--line);border-radius:12px;padding:16px}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:6px 4px;border-top:1px solid var(--line);text-align:left}
td.num{text-align:right}tr.total{font-weight:700}
.warn{color:var(--warn)}.feedback{background:var(--card);border-radius:8px;padding:10px;margin:10px 0}
.actions{display:flex;flex-wrap:wrap;gap:8px}
footer{margin-top:32px;padding-top:12px;border-top:1px solid var(--line);font-size:13px;color:var(--sub)}
pre{white-space:pre-wrap;font-size:11px}
`;

function page(js, fontB64, license) {
  const safeJs = js.replace(/<\/script/gi, '<\\/script');
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>근로계약서 작성 (오프라인판)</title>
<style>${CSS}</style>
</head>
<body>
<main>
<h1>근로계약서 작성</h1>
<p class="lead">이 파일은 인터넷 연결 없이 브라우저 안에서만 계산하고 파일을 만듭니다. 입력한 내용을 어디로도 보내지 않습니다.</p>
<form id="cw-form" onsubmit="return false"></form>
<section id="cw-result" aria-live="polite"></section>
<footer>
<p>연장·휴일 시간은 근무형태로 미리 정한 예정 시간입니다. 실제 근로가 이를 넘으면 넘는 시간의 수당을 따로 지급해야 합니다.</p>
<p id="cw-build"></p>
<details><summary>PDF 글꼴 라이선스(나눔고딕, SIL Open Font License 1.1)</summary><pre>${esc(license)}</pre></details>
</footer>
</main>
<script id="cw-font" type="application/octet-stream">${fontB64}</script>
<script>${safeJs}</script>
</body>
</html>
`;
}

export async function build(out = DEFAULT_OUT, info = buildInfo()) {
  const { build: viteBuild } = await import('vite');
  const result = await viteBuild({
    configFile: false,
    root: ROOT,
    logLevel: 'warn',
    publicDir: false,
    resolve: { alias: { '@': join(ROOT, 'src') } },
    define: { __CW_BUILD__: JSON.stringify(info), 'process.env.NODE_ENV': '"production"' },
    plugins: [dataProjection()],
    build: {
      write: false,
      emptyOutDir: false,
      sourcemap: false,
      minify: true,
      modulePreload: false,
      lib: { entry: ENTRY, formats: ['iife'], name: 'ContractWriteOfflineBundle', fileName: () => 'bundle.js' },
      rollupOptions: { output: { comments: { legal: false } } },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => r.output);
  const chunks = outputs.filter((o) => o.type === 'chunk');
  if (chunks.length !== 1) throw new Error(`번들 조각이 1개가 아닙니다: ${chunks.map((c) => c.fileName).join(', ')}`);
  const html = page(chunks[0].code, readFileSync(FONT).toString('base64'), readFileSync(FONT_LICENSE, 'utf8'));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html, 'utf8');
  return { out, html };
}

export function parseOut(args) {
  const i = args.indexOf('--out');
  if (i < 0) return DEFAULT_OUT;
  const v = args[i + 1];
  if (!v || v.startsWith('--')) throw new Error('--out 뒤에 출력 파일 경로를 적어 주세요');
  return resolve(v);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let out;
  try {
    out = parseOut(process.argv.slice(2));
  } catch (e) {
    console.error(String(e instanceof Error ? e.message : e));
    process.exit(2);
  }
  const { html } = await build(out);
  console.log(`contract-write offline: ${out} (${Buffer.byteLength(html)} bytes)`);
}
