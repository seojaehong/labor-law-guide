// 근로계약서 점검 규칙 코어(src/lib/contract-check/**)를 HTML 1장짜리 오프라인판으로 묶는다.
//
//   node scripts/build-contract-check-offline.mjs [--out <파일>]
//   기본 출력: dist-offline/contract-check.html (.gitignore — 저장소에 올리지 않는다)
//
// - 번들러는 이미 직접 의존인 vite 의 build API 를 쓴다(build-hwp-editor.mjs 와 같은 방식, 의존 추가 없음).
// - JS·CSS 를 전부 인라인한다. 외부 스크립트·폰트·CDN·분석 태그를 넣지 않는다.
// - 엔진 데이터는 고치지 않는다. 다만 compliance_rules.json 은 번들 안에서만 code·name·statute·severity·auto
//   만 남긴다 — description·logic 은 화면에 쓰이지 않는 내부 설명이라 산출물에 싣지 않는다.
// - prebuild 에 연결하지 않는다(운영 빌드 영향 0).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = join(ROOT, 'src', 'offline', 'contract-check', 'entry.ts');
export const DEFAULT_OUT = join(ROOT, 'dist-offline', 'contract-check.html');

/** compliance_rules.json 을 화면·엔진이 읽는 칸만 남겨 싣는다 */
function catalogProjection() {
  return {
    name: 'contract-check-catalog-projection',
    enforce: 'pre',
    load(id) {
      if (!id.replace(/\\/g, '/').endsWith('/contract-check/data/compliance_rules.json')) return null;
      const src = JSON.parse(readFileSync(id, 'utf8'));
      const rules = src.rules.map(({ code, name, statute, severity, auto }) => ({ code, name, statute, severity, auto }));
      return JSON.stringify({ version: src.version, rules });
    },
  };
}

const CSS = `
:root{--bg:#fff;--fg:#191f28;--sub:#4e5968;--line:#e5e8eb;--card:#f9fafb;
--danger-bg:#fdecec;--danger:#b42318;--warn-bg:#fff4e0;--warn:#92400e;--ok-bg:#e8f6ef;--ok:#05603a;--nd-bg:#f2f4f6;--nd:#333d4b}
@media (prefers-color-scheme:dark){:root{--bg:#17171c;--fg:#f2f4f6;--sub:#b0b8c1;--line:#333d4b;--card:#202027;
--danger-bg:#3b1515;--danger:#ffb4ab;--warn-bg:#3a2a0c;--warn:#ffd08a;--ok-bg:#0f2e20;--ok:#8ee0b5;--nd-bg:#2b2b33;--nd:#d1d6db}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:22px;margin:0 0 4px}h3{font-size:16px;margin:24px 0 8px}
.lead{color:var(--sub);margin:0 0 16px}
textarea{width:100%;min-height:200px;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--fg);font:13px/1.5 ui-monospace,Consolas,monospace}
.actions{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 4px}
button{min-height:44px;padding:8px 18px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--fg);font:inherit;font-weight:600;cursor:pointer}
button.primary{background:var(--fg);color:var(--bg);border-color:var(--fg)}
#cc-error{color:var(--danger);min-height:1.6em;margin:4px 0}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.badge{display:inline-block;padding:2px 10px;border-radius:6px;font-size:13px;font-weight:600}
.s-violation{background:var(--danger-bg);color:var(--danger)}.s-risk{background:var(--warn-bg);color:var(--warn)}
.s-ok{background:var(--ok-bg);color:var(--ok)}.s-needs_data{background:var(--nd-bg);color:var(--nd)}
ul.findings{list-style:none;padding:0;margin:0}
li.finding{border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:8px}
.head{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.statute{font-size:12px;color:var(--sub)}
.detail{font-size:13px;color:var(--sub);margin:6px 0 0}
.amend{font-size:13px;background:var(--card);border-radius:6px;padding:6px 8px;margin:6px 0 0}
footer{margin-top:32px;padding-top:12px;border-top:1px solid var(--line);font-size:13px;color:var(--sub)}
@media print{.actions,textarea,#cc-error{display:none}}
`;

function page(js) {
  // </script> 가 번들 문자열에 있으면 HTML 이 끊긴다
  const safeJs = js.replace(/<\/script/gi, '<\\/script');
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:">
<title>근로계약서 점검 (오프라인판)</title>
<style>${CSS}</style>
</head>
<body>
<main>
<h1>근로계약서 점검</h1>
<p class="lead">이 파일은 인터넷 연결 없이 브라우저 안에서만 계산합니다. 입력한 내용을 어디로도 보내지 않습니다.</p>
<label for="cc-input">계약 정보(JSON)를 붙여넣으세요</label>
<textarea id="cc-input" spellcheck="false" placeholder='{"contract_id": "...", "workplace": {...}, "employee": {...}, ...}'></textarea>
<div class="actions">
<button type="button" id="cc-run" class="primary">점검하기</button>
<button type="button" id="cc-sample">합성 예시로 보기</button>
</div>
<div id="cc-error" role="alert"></div>
<div id="cc-out"></div>
<footer>참고용 점검 결과입니다. 항목마다 적힌 근거 조문을 함께 확인하세요. 예시 버튼은 가상 계약 4건(합성값)을 넣습니다.</footer>
</main>
<script>${safeJs}</script>
</body>
</html>
`;
}

/** 번들을 만들어 HTML 1장으로 쓰고, 그 경로와 내용을 돌려준다 */
export async function build(out = DEFAULT_OUT) {
  const { build: viteBuild } = await import('vite');
  const result = await viteBuild({
    configFile: false,
    root: ROOT,
    logLevel: 'warn',
    publicDir: false,
    resolve: { alias: { '@': join(ROOT, 'src') } },
    plugins: [catalogProjection()],
    build: {
      write: false,
      emptyOutDir: false,
      sourcemap: false,
      minify: true,
      modulePreload: false,
      lib: { entry: ENTRY, formats: ['iife'], name: 'ContractCheckOfflineBundle', fileName: () => 'bundle.js' },
      rollupOptions: { output: { comments: { legal: false } } },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => r.output);
  const chunks = outputs.filter((o) => o.type === 'chunk');
  if (chunks.length !== 1) throw new Error(`번들 조각이 1개가 아닙니다: ${chunks.map((c) => c.fileName).join(', ')}`);
  const html = page(chunks[0].code);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html, 'utf8');
  return { out, html };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const i = process.argv.indexOf('--out');
  const out = i > 0 ? resolve(process.argv[i + 1]) : DEFAULT_OUT;
  const { html } = await build(out);
  console.log(`contract-check offline: ${out} (${Buffer.byteLength(html)} bytes)`);
}
