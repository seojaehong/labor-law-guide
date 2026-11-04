// 스모크 시험 — 합성 값만 쓴다(주민번호는 체크섬 맞춘 가상값). 실제 전송은 하지 않는다(confirm 없음).
//   node smoke.mjs                         → ./dist/server.mjs
//   node smoke.mjs <server.mjs 경로|.cmd>   → 설치본 시험
// 결과는 묶어서 PASS/FAIL 로 낸다. 팝빌 응답(잔액·발신번호)은 화면에 찍지 않는다.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const target = process.argv[2] || fileURLToPath(new URL('./dist/server.mjs', import.meta.url));
const extra = process.argv.slice(3);
const transport = /\.cmd$/i.test(target)
  ? new StdioClientTransport({ command: 'cmd', args: ['/c', target, 'mcp', ...extra], env: process.env })
  : new StdioClientTransport({ command: process.execPath, args: [target, 'mcp', ...extra], env: process.env });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ilmunui-mcp-'));
const c = new Client({ name: 'smoke', version: '0' });
await c.connect(transport);
const fails = [];
const check = (label, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`); if (!cond) fails.push(label); };
const callJson = async (name, args) => {
  const r = await c.callTool({ name, arguments: args });
  const t = r.content[0].text;
  check(`${name}: 응답에 가상 주민번호 없음`, !t.includes('9001011234568') && !t.includes('900101-1234568'));
  return JSON.parse(t);
};

const tools = (await c.listTools()).tools.map((t) => t.name);
console.log('tools:', tools.join(', '));

if (tools.includes('find_branch')) {
  const fb = await callJson('find_branch', { address: '충북 청주시 상당구 상당로 155' });
  check(`find_branch ok (첫 후보: ${fb.branches?.[0]?.name})`, fb.ok && fb.branches?.length > 0);
}
let made = null;
if (tools.includes('make_form')) {
  const pf = path.join(tmp, 'people.json');
  fs.writeFileSync(pf, JSON.stringify([{ name: '홍길동', rrn: '9001011234568', lastWorkDay: '2026-05-31', nhisCode: '01', payCur: 12000000, monthsCur: 5 }]));
  made = await callJson('make_form', {
    kind: 'loss', peopleFile: pf, reason: '퇴사 처리 과정에서 상실 신고를 놓쳐 늦게 신고합니다.', branchName: '청주동부지사',
    biz: { mgmtNo: '12345678901', name: '가상사업장', addr: '충북 청주시 상당구 상당로 155', ownerName: '김대표', tel: '043-000-0000' },
    outPath: path.join(tmp, 'loss.pdf'),
  });
  const head = made.ok ? fs.readFileSync(made.outPath).subarray(0, 5).toString() : '';
  check(`make_form ok (${made.bytes} bytes, EDI 한도 안: ${made.withinEdiLimit})`, made.ok && head === '%PDF-');
}
if (tools.includes('popbill_status')) {
  const st = await callJson('popbill_status', {});
  console.log(`  popbill_status: ${st.ok === false ? `설정 없음 → missing=${st.missing?.join(',')}` : `연결됨(${st.env})`}`);
  const fx = await callJson('send_fax', { pdfPath: made?.outPath || path.join(tmp, 'none.pdf'), to: '043-000-0000', toName: '시험' });
  console.log(`  send_fax(미리보기): ${fx.preview ? '미리보기 반환, 전송 안 함' : `ok=${fx.ok} missing=${fx.missing?.join(',') || '-'} reason=${fx.reason || '-'}`}`);
  check('send_fax 는 confirm 없이 보내지 않음', !fx.receiptNum);
  const sm = await callJson('send_sms', { to: '010-0000-0000', text: '시험 문자', sender: '01000000000' });
  check('send_sms 는 confirm 없이 보내지 않음', !sm.receiptNum);
  const bad = await callJson('send_sms', { to: '010-0000-0000', text: '주민 900101-1234568', sender: '01000000000' });
  check('send_sms 는 본문 주민번호를 막음', bad.ok === false);
}
await c.close();
console.log(`tmp ${tmp}`);
console.log(fails.length ? `FAIL ${fails.length}건` : 'ALL PASS');
process.exit(fails.length ? 1 : 0);
