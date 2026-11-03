// 스모크 시험 — 합성 값만 쓴다(주민번호는 체크섬 맞춘 가상값). 실제 전송은 하지 않는다(confirm 없음).
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nhis-mcp-'));
const c = new Client({ name: 'smoke', version: '0' });
await c.connect(new StdioClientTransport({ command: process.execPath, args: [new URL('./dist/server.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')] }));
const show = async (name, args) => {
  const r = await c.callTool({ name, arguments: args });
  const t = r.content[0].text;
  console.log(`== ${name}\n${t.length > 1500 ? t.slice(0, 1500) + '…' : t}`);
  return JSON.parse(t);
};
console.log('tools:', (await c.listTools()).tools.map((t) => t.name).join(', '));
await show('find_branch', { address: '충북 청주시 상당구 상당로 155' });
const pf = path.join(tmp, 'people.json');
fs.writeFileSync(pf, JSON.stringify([{ name: '홍길동', rrn: '9001011234568', lastWorkDay: '2026-05-31', nhisCode: '01', payCur: 12000000, monthsCur: 5 }]));
const made = await show('make_form', {
  kind: 'loss', peopleFile: pf, reason: '퇴사 처리 과정에서 상실 신고를 놓쳐 늦게 신고합니다.', branchName: '청주동부지사',
  biz: { mgmtNo: '12345678901', name: '가상사업장', addr: '충북 청주시 상당구 상당로 155', ownerName: '김대표', tel: '043-000-0000' },
  outPath: path.join(tmp, 'loss.pdf'),
});
await show('popbill_status', {});
if (made.ok) await show('send_fax', { pdfPath: made.outPath, to: '043-000-0000', toName: '시험' });
await show('send_sms', { to: '010-0000-0000', text: '시험 문자', sender: '01000000000' });
await c.close();
console.log('tmp', tmp);
