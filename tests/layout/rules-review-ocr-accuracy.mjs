// 스캔 쪽 읽기 정확도 — 운영 화면 그대로(자동 확인·하이쿠→소넷·한도 포함) 잰다.
// 글자층이 있는 실제 규정 pdf 쪽을 그림만 있는 pdf 로 바꿔 올리고, 「동의하고 … 보내 읽기」를 눌러 읽힌 글자를 글자층(정답)과 견준다.
// 규정 파일·결과는 저장소에 넣지 않는다. 쪽마다 모델을 부른다.
// RR_OCR_DIR=<pdf 폴더> RR_OUT=<결과 폴더> [RR_OCR_FILES=6] [VISUAL_BASE_URL=https://yellowenvelope.kr] node tests/layout/rules-review-ocr-accuracy.mjs
import fs from 'node:fs';import path from 'node:path';import {chromium} from '@playwright/test';
import {createCanvas} from '@napi-rs/canvas';import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
const DIR=process.env.RR_OCR_DIR,OUT=process.env.RR_OUT,base=process.env.VISUAL_BASE_URL||'https://yellowenvelope.kr';
if(!DIR||!OUT)throw new Error('RR_OCR_DIR·RR_OUT 필요');
fs.mkdirSync(path.join(OUT,'pages'),{recursive:true});
const keep=(s)=>s.replace(/[^가-힣0-9]/g,'');
// 편집 거리 기반 같음 정도(0~1) — 한글·숫자만 견준다(rules-review-ocr-real.test.ts 와 같은 셈)
function similarity(a,b){if(!a&&!b)return 1;let prev=Array.from({length:b.length+1},(_,j)=>j);for(let i=1;i<=a.length;i++){const cur=[i];for(let j=1;j<=b.length;j++)cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=cur;}return 1-prev[b.length]/Math.max(a.length,b.length);}
// 그림(JPEG) 한 장짜리 pdf — 글자층이 없어 화면이 「스캔 쪽」으로 본다
function imagePdf(jpeg,w,h){const W=(w*72/200).toFixed(2),H=(h*72/200).toFixed(2);const content=`q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
  const objs=[`<< /Type /Catalog /Pages 2 0 R >>`,`<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,null,`<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
  const parts=[Buffer.from('%PDF-1.4\n')],offs=[];let len=parts[0].length;
  objs.forEach((o,i)=>{offs.push(len);const b=o===null?Buffer.concat([Buffer.from(`${i+1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),jpeg,Buffer.from('\nendstream\nendobj\n')]):Buffer.from(`${i+1} 0 obj\n${o}\nendobj\n`);parts.push(b);len+=b.length;});
  parts.push(Buffer.from(`xref\n0 ${objs.length+1}\n0000000000 65535 f \n${offs.map((o)=>`${String(o).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${len}\n%%EOF\n`));return Buffer.concat(parts);}

const files=fs.readdirSync(DIR).filter((f)=>f.toLowerCase().endsWith('.pdf')&&!/대비표|편람/.test(f)).slice(0,Number(process.env.RR_OCR_FILES??6));
const pages=[];
for(const f of files){const task=pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(path.join(DIR,f)))});const doc=await task.promise;
  for(const no of [...new Set([1,Math.ceil(doc.numPages/2)])]){const page=await doc.getPage(no);
    const items=(await page.getTextContent()).items;
    // 쪽 꼬리말(「파일 이름_제…호 3/10」)은 옮기지 말라고 했으니 정답에서도 뺀다
    const truth=keep(items.map((i)=>i.str).join('').replace(/\S*_제[\d,]+호_\d{8}_\S*\s*\d+\s*\/\s*\d+/g,''));
    const b=page.getViewport({scale:1}),vp=page.getViewport({scale:1800/Math.max(b.width,b.height)});
    const canvas=createCanvas(Math.ceil(vp.width),Math.ceil(vp.height)),ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    await page.render({canvasContext:ctx,canvas,viewport:vp}).promise;
    const id=String(pages.length+1).padStart(2,'0'),name=`${id} 측정${'가나다라마바사아자차카타파하'[pages.length]} 규정`,file=path.join(OUT,'pages',`${name}.pdf`);
    fs.writeFileSync(file,imagePdf(await canvas.encode('jpeg',85),canvas.width,canvas.height));
    pages.push({id,name,file,src:f,page:no,truth});console.log('그림 pdf',id,no);}
  await task.destroy();}

// 자동화 브라우저는 자동 확인(turnstile) 토큰을 받지 못한다 — 운영은 RR_CDP=<일반 크롬 원격 디버깅 주소> 로 붙는다
const browser=process.env.RR_CDP?await chromium.connectOverCDP(process.env.RR_CDP):await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
const ctx=process.env.RR_CDP?browser.contexts()[0]:await browser.newContext();const page=await ctx.newPage();await page.setViewportSize({width:1280,height:900});const errors=[];
page.on('console',(m)=>{if(m.type()==='error'&&!(m.location().url||'').includes('challenges.cloudflare.com'))errors.push(m.text());});
await page.goto(`${base}/tools/rules-review`,{waitUntil:'networkidle'});
{const r=page.getByRole('button',{name:'지우고 새로 시작'});if(await r.count())await r.click();}
await page.locator('input[type=file][accept^=".zip"]').setInputFiles(pages.map((p)=>p.file));
await page.getByRole('heading',{name:/규정 \d+개를 읽었습니다/}).waitFor({timeout:120000}).catch(async(e)=>{console.log((await page.locator('main.rr').innerText()).slice(-500));throw e;});
const t0=Date.now();
await page.getByRole('region',{name:'pdf 로 읽은 규정'}).getByRole('button',{name:/동의하고 스캔 \d+쪽 보내 읽기/}).click();
await page.getByText(/스캔 쪽 \d+쪽을 읽었습니다/).waitFor({timeout:pages.length*60000});
const notice=await page.locator('.rr-note[role=status]').innerText();
await page.waitForTimeout(2000); // 자동 저장(0.5초 뒤)이 끝난 뒤 읽는다
const ws=await page.evaluate(()=>new Promise((res,rej)=>{const q=indexedDB.open('rules-review',1);q.onsuccess=()=>{const g=q.result.transaction('kv').objectStore('kv').get('workspace');g.onsuccess=()=>res(g.result);g.onerror=()=>rej(g.error);};q.onerror=()=>rej(q.error);}));
const rows=pages.map((p)=>{const reg=ws.regs.find((r)=>(r.fileName??'').includes(p.name));const got=keep((reg?.lines??[]).map((l)=>l.text).join(''));
  return {id:p.id,src:p.src,page:p.page,truthChars:p.truth.length,gotChars:got.length,sim:Number(similarity(p.truth,got).toFixed(4)),found:!!reg};});
const sims=rows.map((r)=>r.sim).sort((a,b)=>a-b);
const summary={base,pages:rows.length,seconds:Math.round((Date.now()-t0)/1000),notice,meanSim:Number((sims.reduce((a,b)=>a+b,0)/sims.length).toFixed(4)),minSim:sims[0],medianSim:sims[Math.floor(sims.length/2)],consoleErrors:errors};
fs.writeFileSync(path.join(OUT,'ocr_accuracy_e2e.json'),JSON.stringify({summary,rows},null,1));
console.log(JSON.stringify(summary,null,1));for(const r of rows)console.log(r.id,r.page,r.truthChars,r.gotChars,r.sim,r.found?'':'(짝 없음)');
if(process.env.RR_CDP)await page.close();else await browser.close();
process.exit(0); // CDP 연결이 node 를 붙잡아 두지 않게
