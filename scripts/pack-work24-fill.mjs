// 크롬 웹스토어에 올릴 zip 을 만든다 — 개발용 localhost 주소를 빼고 묶는다.
// 사용: node scripts/pack-work24-fill.mjs  →  artifacts/work24-fill-<버전>.zip
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

const SRC = 'extensions/work24-fill';
const FILES = ['manifest.json', 'background.js', 'site.js', 'fill.js', 'icons/icon16.png', 'icons/icon48.png', 'icons/icon128.png'];
const DEV = /http:\/\/localhost:3123/;

export function storeManifest(raw) {
  const m = JSON.parse(raw);
  for (const cs of m.content_scripts) cs.matches = cs.matches.filter((u) => !DEV.test(u));
  return JSON.stringify(m, null, 2) + '\n';
}
export function storeBackground(raw) {
  return raw.replace(/,\s*'http:\/\/localhost:3123'/, '');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/pack-work24-fill.mjs')) {
  const zip = new JSZip();
  for (const f of FILES) {
    const p = path.join(SRC, f);
    let body = fs.readFileSync(p);
    if (f === 'manifest.json') body = storeManifest(body.toString('utf8'));
    if (f === 'background.js') body = storeBackground(body.toString('utf8'));
    zip.file(f, body);
  }
  const { version } = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));
  fs.mkdirSync('artifacts', { recursive: true });
  const out = `artifacts/work24-fill-${version}.zip`;
  fs.writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  console.log(out);
}
