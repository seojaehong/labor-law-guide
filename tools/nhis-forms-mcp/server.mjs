// 일의무늬 건보 신고서 MCP — 사이트와 같은 엔진으로 PDF 를 만들고, 팝빌로 팩스·문자를 보내고, 결과를 조회한다.
// ★ 주민번호는 이 PC 안에서만 PDF 로 만들어지고 팩스로 팝빌에만 나간다. 도구 응답에는 주민번호를 싣지 않는다.
// ★ 보내기(send_fax·send_sms)는 confirm:true 일 때만 실제로 보낸다. 기본은 미리보기.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildPacket, PacketError } from '@/lib/nhis-forms/build';
import { loadAgencies, parseAddress, findBranches, rowsFor } from '@/lib/branch-directory';

const req = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.LLG_ROOT || path.resolve(here, '../../..');
const SITE = process.env.LLG_SITE || 'https://yellowenvelope.kr';

// ── 설정: ~/.claude/.env 에서 읽는다(값은 어디에도 찍지 않는다) ──
function readEnv() {
  const out = {};
  try {
    for (const line of fs.readFileSync(path.join(os.homedir(), '.claude/.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^(POPBILL_[A-Z_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch { /* 없으면 아래 기본값 */ }
  return { ...out, ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('POPBILL_'))) };
}
const ENV = readEnv();
const CORP = (ENV.POPBILL_CORP_NUM || '7098502058').replace(/\D/g, '');
const IS_TEST = (ENV.POPBILL_IS_TEST ?? 'true') !== 'false';
const FAX_SENDER = (ENV.POPBILL_FAX_SENDER || '05044992647').replace(/\D/g, '');
const SMS_SENDER = (ENV.POPBILL_SMS_SENDER || '').replace(/\D/g, '');

let popbill = null;
function pb() {
  if (popbill) return popbill;
  if (!ENV.POPBILL_LINK_ID || !ENV.POPBILL_SECRET_KEY) throw new Error('팝빌 키가 없습니다(~/.claude/.env 의 POPBILL_LINK_ID·POPBILL_SECRET_KEY)');
  const lib = req('popbill');
  lib.config({
    LinkID: ENV.POPBILL_LINK_ID, SecretKey: ENV.POPBILL_SECRET_KEY, IsTest: IS_TEST,
    IPRestrictOnOff: true, UseStaticIP: false, UseLocalTimeYN: true, defaultErrorHandler: () => {},
  });
  popbill = { fax: lib.FaxService(), msg: lib.MessageService() };
  return popbill;
}
/** 팝빌 콜백 API 를 promise 로. 실패는 {ok:false, code, message} */
const call = (fn) => new Promise((res) => fn((r) => res({ ok: true, r }), (e) => res({ ok: false, code: e?.code, message: e?.message })));

const text = (obj) => ({ content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] });
const digits = (s) => String(s ?? '').replace(/\D/g, '');
const env = () => (IS_TEST ? '테스트환경' : '운영환경');

const server = new McpServer({ name: 'nhis-forms', version: '0.1.0' });

// ── 1. 지사 찾기 ──
server.tool(
  'find_branch',
  '사업장 주소나 사업자등록번호로 건강보험 관할 지사와 자격(취득·상실) 담당 전화·팩스를 찾는다. 사업자번호만 사이트 API 로 보내고, 주소 판정은 이 PC 의 지사 데이터로 한다.',
  { address: z.string().optional(), bizNo: z.string().optional(), pick: z.number().int().optional().describe('사업자번호 결과가 여러 사업장일 때 고를 번호(0부터)') },
  async ({ address, bizNo, pick }) => {
    let addr = (address || '').trim();
    if (!addr && bizNo) {
      const r = await fetch(`${SITE}/api/tools/branch-directory?bizNo=${digits(bizNo)}`).then((x) => x.json()).catch(() => null);
      if (!r?.ok) return text({ ok: false, reason: r?.reason || 'lookup-failed' });
      if (r.pick && pick === undefined) return text({ ok: true, pick: r.pick.map((w, i) => ({ i, ...w })), next: 'pick 번호를 넣어 다시 부르세요' });
      addr = r.pick ? r.pick[pick]?.address : r.address;
      if (!addr) return text({ ok: false, reason: 'bad-pick' });
    }
    if (!addr) return text({ ok: false, reason: 'address 또는 bizNo 가 필요합니다' });
    const a = parseAddress(addr);
    const found = findBranches(loadAgencies().nhis, a);
    return text({
      ok: true, address: addr, status: found.status,
      note: '고지서나 EDI 에 적힌 관리지사가 따로 있으면 그 지사가 우선입니다.',
      branches: found.candidates.slice(0, 3).map((c) => ({
        name: c.name, partial: c.partial,
        rows: rowsFor(c, a).filter((x) => x.tel || x.fax).slice(0, 6).map(({ dept, work, tel, fax, hit }) => ({ dept, work, tel, fax, hit })),
      })),
    });
  },
);

// ── 2. 신고서 PDF 만들기 ──
const bizSchema = z.object({
  mgmtNo: z.string(), name: z.string(), addr: z.string(), ownerName: z.string(),
  tel: z.string().optional(), fax: z.string().optional(), zip: z.string().optional(),
});
server.tool(
  'make_form',
  '건강보험 자격상실(별지 8호)·자격취득(별지 6호) 신고서 + 지연 사유 사업주확인서를 사이트와 같은 서식으로 PDF 한 파일로 만든다. 주민번호가 모델 대화에 실리지 않도록 사람 명단은 peopleFile(JSON 배열 경로)로만 받는다 — 도구가 그 파일을 직접 읽는다. loss 사람 = {name,rrn,lastWorkDay(YYYY-MM-DD),nhisCode("01" 등),payCur?,monthsCur?,payPrev?,monthsPrev?}, acq 사람 = {name,rrn,acqDate,monthlyPay,nhisCode("00" 등),ceo}.',
  {
    kind: z.enum(['loss', 'acq']),
    biz: bizSchema,
    peopleFile: z.string().describe('사람 명단 JSON 배열 파일 경로'),
    reason: z.string().describe('늦어진 이유(300자 이내)'),
    branchName: z.string().optional().describe('받을 지사 이름(예: 청주동부지사)'),
    stampPath: z.string().optional().describe('사업장 도장 PNG(투명 배경) 경로'),
    outPath: z.string().describe('저장할 PDF 경로'),
  },
  async ({ kind, biz, peopleFile, reason, branchName, stampPath, outPath }) => {
    const list = JSON.parse(fs.readFileSync(peopleFile, 'utf8'));
    if (!Array.isArray(list) || !list.length) return text({ ok: false, reason: 'peopleFile 에 사람이 없습니다' });
    const formPdf = fs.readFileSync(path.join(ROOT, `public/forms/nhis/${kind === 'loss' ? 'NHIS_8_LOSS' : 'NHIS_6_ACQ'}.pdf`));
    const font = fs.readFileSync(path.join(ROOT, 'public/fonts/llg-forms/LLGFormsSans-Regular.ttf'));
    const stamp = stampPath ? new Uint8Array(fs.readFileSync(stampPath)) : undefined;
    try {
      const p = await buildPacket({ formPdf: new Uint8Array(formPdf), font: new Uint8Array(font) }, { kind, biz, people: list, reason, branchName, stamp });
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, p.bytes);
      return text({ ok: true, outPath, bytes: p.bytes.length, withinEdiLimit: p.withinLimit, people: list.length, pages: 2, check: '보내기 전에 PDF 를 열어 칸이 맞는지 확인하세요.' });
    } catch (e) {
      if (e instanceof PacketError) return text({ ok: false, problems: e.problems });
      return text({ ok: false, error: String(e?.message || e) });
    }
  },
);

// ── 3. 팝빌 상태 ──
server.tool('popbill_status', '팝빌 연결·잔액·팩스/문자 권한·등록된 발신번호를 조회한다(보내지 않는다).', {}, async () => {
  const { fax, msg } = pb();
  const [member, bal, partner, faxCharge, smsCharge, faxSenders, smsSenders] = await Promise.all([
    call((s, e) => fax.checkIsMember(CORP, s, e)),
    call((s, e) => fax.getBalance(CORP, s, e)),
    call((s, e) => fax.getPartnerBalance(CORP, s, e)),
    call((s, e) => fax.getChargeInfo(CORP, s, e)),
    call((s, e) => msg.getChargeInfo(CORP, 'SMS', s, e)),
    call((s, e) => fax.getSenderNumberList(CORP, s, e)),
    call((s, e) => msg.getSenderNumberList(CORP, s, e)),
  ]);
  return text({ env: env(), corp: CORP, member, balance: bal, partnerBalance: partner, faxCharge, smsCharge, faxSenders, smsSenders, defaultFaxSender: FAX_SENDER });
});

// ── 4. 팩스 ──
server.tool(
  'send_fax',
  'PDF 를 팝빌로 팩스 전송한다. confirm 이 true 가 아니면 보내지 않고 미리보기만 돌려준다. 받는 번호는 find_branch 의 지사 팩스를 사람이 확인한 값만 쓴다.',
  {
    pdfPath: z.string(), to: z.string(), toName: z.string().describe('받는 곳(예: 국민건강보험공단 청주동부지사 자격부)'),
    title: z.string().optional(), sender: z.string().optional(), confirm: z.boolean().optional(),
  },
  async ({ pdfPath, to, toName, title, sender, confirm }) => {
    if (!fs.existsSync(pdfPath)) return text({ ok: false, reason: 'PDF 가 없습니다' });
    const plan = { env: env(), from: digits(sender) || FAX_SENDER, to: digits(to), toName, title: title || '', file: path.basename(pdfPath), bytes: fs.statSync(pdfPath).size };
    if (confirm !== true) return text({ ok: true, preview: plan, next: '내용을 확인한 뒤 confirm:true 로 다시 부르면 보냅니다' });
    const { fax } = pb();
    const r = await call((s, e) => fax.sendFax(CORP, { SenderNum: plan.from, SenderName: '', Receiver: plan.to, ReceiverName: toName, FilePaths: [pdfPath], Title: plan.title, AdsYN: false }, s, e));
    return text(r.ok ? { ok: true, receiptNum: r.r, ...plan } : { ok: false, code: r.code, message: r.message, ...plan });
  },
);
server.tool('fax_result', '팩스 접수번호로 전송 결과를 조회한다.', { receiptNum: z.string() }, async ({ receiptNum }) => {
  const r = await call((s, e) => pb().fax.getFaxResult(CORP, receiptNum, '', s, e));
  if (!r.ok) return text(r);
  return text({ ok: true, env: env(), results: (r.r || []).map((x) => ({ to: x.receiveNum, toName: x.receiveName, state: x.state, result: x.result, pages: x.sendPageCnt, successPages: x.successPageCnt, failPages: x.failPageCnt, sent: x.sendDT, done: x.resultDT })) });
});

// ── 5. 문자 ──
const eucBytes = (s) => [...s].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x7f ? 2 : 1), 0);
server.tool(
  'send_sms',
  '문자를 팝빌로 보낸다(90바이트 이하 단문, 넘으면 장문). confirm 이 true 가 아니면 미리보기만. 주민번호 등 개인 식별번호는 넣지 않는다.',
  { to: z.string(), text: z.string(), subject: z.string().optional(), sender: z.string().optional(), toName: z.string().optional(), confirm: z.boolean().optional() },
  async ({ to, text: body, subject, sender, toName, confirm }) => {
    if (/\d{6}\s*-?\s*[1-8]\d{6}/.test(body)) return text({ ok: false, reason: '본문에 주민번호 모양이 있습니다' });
    const from = digits(sender) || SMS_SENDER;
    const kind = eucBytes(body) <= 90 ? 'SMS' : 'LMS';
    const plan = { env: env(), kind, from, to: digits(to), bytes: eucBytes(body), text: body };
    if (!from) return text({ ok: false, reason: '문자 발신번호가 없습니다(sender 또는 POPBILL_SMS_SENDER)', preview: plan });
    if (confirm !== true) return text({ ok: true, preview: plan, next: '확인한 뒤 confirm:true 로 다시 부르면 보냅니다' });
    const { msg } = pb();
    const r = kind === 'SMS'
      ? await call((s, e) => msg.sendSMS(CORP, from, plan.to, toName || '', body, '', false, '', '', '', s, e))
      : await call((s, e) => msg.sendLMS(CORP, from, plan.to, toName || '', subject || '', body, '', false, '', '', '', s, e));
    return text(r.ok ? { ok: true, receiptNum: r.r, ...plan } : { ok: false, code: r.code, message: r.message, ...plan });
  },
);
server.tool('sms_result', '문자 접수번호로 전송 결과를 조회한다.', { receiptNum: z.string() }, async ({ receiptNum }) => {
  const r = await call((s, e) => pb().msg.getMessages(CORP, receiptNum, '', s, e));
  if (!r.ok) return text(r);
  return text({ ok: true, env: env(), results: (r.r || []).map((x) => ({ to: x.receiveNum, state: x.state, result: x.result, type: x.type, sent: x.sendDT, done: x.resultDT })) });
});

await server.connect(new StdioServerTransport());
console.error(`nhis-forms MCP ready (${env()})`);
