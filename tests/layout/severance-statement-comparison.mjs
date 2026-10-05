import {chromium} from '@playwright/test';
import fs from 'node:fs';
const out='docs/design-visuals/severance-statement-20261005';
const browser=await chromium.launch({executablePath:'C:/Users/iceam/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'});
try {const p=await browser.newPage({viewport:{width:840,height:900}});
for(const kind of ['light-390','dark-390','a4']){
 const imgs=['before','after'].map(v=>`<section><h2>${v==='before'?'기존':'제안'}</h2><img src="data:image/png;base64,${fs.readFileSync(`${out}/${v}-${kind}.png`).toString('base64')}"></section>`).join('');
 await p.setContent(`<html lang="ko"><style>*{box-sizing:border-box}body{margin:0;padding:20px;background:#f3f1e8;font-family:Arial,sans-serif;color:#20231f}main{display:grid;grid-template-columns:1fr 1fr;gap:20px}h1{font-size:20px}h2{font-size:15px}img{width:100%;height:auto;display:block}section{min-width:0}</style><h1>퇴직금 산정서 · ${kind==='a4'?'A4 PDF 실제 출력':'390px 실제 화면'}</h1><main>${imgs}</main></html>`);
 await p.screenshot({path:`${out}/comparison-${kind}.png`,fullPage:true});
}} finally {await browser.close();}
