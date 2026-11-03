// popbill 묶음 — 사용자 본인의 팝빌 계정으로 팩스·문자를 보내고 결과를 조회한다.
// ★ 기본값이 없다. 연동 키·사업자번호·발신번호는 사용자가 직접 넣어야 하고, 없으면 무엇이 빠졌는지 돌려준다.
// ★ 보내기(send_fax·send_sms)는 confirm:true 일 때만 실제로 보낸다. 기본은 미리보기.
// ★ 키 값은 어디에도 찍지 않는다.
import { z } from 'zod';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { text, digits, looksLikeRrn } from '../lib/common.mjs';

const req = createRequire(import.meta.url);

export const popbillTools = ['popbill_status', 'send_fax', 'fax_result', 'send_sms', 'sms_result'];

// 환경변수가 우선이고, 없으면 ~/.claude/.env 의 POPBILL_* 줄을 읽는다.
function readConfig() {
  const out = {};
  try {
    for (const line of fs.readFileSync(path.join(os.homedir(), '.claude/.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^(POPBILL_[A-Z_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch { /* 파일이 없으면 환경변수만 쓴다 */ }
  for (const [k, v] of Object.entries(process.env)) if (k.startsWith('POPBILL_')) out[k] = v;
  return out;
}
const CFG = readConfig();
const CORP = digits(CFG.POPBILL_CORP_NUM);
const IS_TEST = (CFG.POPBILL_IS_TEST ?? 'true') !== 'false';
const FAX_SENDER = digits(CFG.POPBILL_FAX_SENDER);
const SMS_SENDER = digits(CFG.POPBILL_SMS_SENDER);
const env = () => (IS_TEST ? '테스트환경' : '운영환경');

/** 빠진 설정 이름. extra = 이 도구에만 필요한 것 */
function missing(extra = []) {
  const m = [];
  if (!CFG.POPBILL_LINK_ID) m.push('POPBILL_LINK_ID');
  if (!CFG.POPBILL_SECRET_KEY) m.push('POPBILL_SECRET_KEY');
  if (!CORP) m.push('POPBILL_CORP_NUM');
  return m.concat(extra);
}
const notConfigured = (m) => text({
  ok: false,
  reason: '팝빌 설정이 없습니다. 본인 팝빌 계정의 값을 환경변수(또는 ~/.claude/.env)에 넣어 주세요.',
  missing: m,
  help: 'README 의 「환경변수」 절을 보세요. 이 도구는 기본 계정·기본 발신번호를 갖고 있지 않습니다.',
});

let popbill = null;
function pb() {
  if (popbill) return popbill;
  const lib = req('popbill');
  lib.config({
    LinkID: CFG.POPBILL_LINK_ID, SecretKey: CFG.POPBILL_SECRET_KEY, IsTest: IS_TEST,
    IPRestrictOnOff: true, UseStaticIP: false, UseLocalTimeYN: true, defaultErrorHandler: () => {},
  });
  popbill = { fax: lib.FaxService(), msg: lib.MessageService() };
  return popbill;
}
/** 팝빌 콜백 API 를 promise 로. 실패는 {ok:false, code, message} */
const call = (fn) => new Promise((res) => fn((r) => res({ ok: true, r }), (e) => res({ ok: false, code: e?.code, message: e?.message })));
const eucBytes = (s) => [...s].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x7f ? 2 : 1), 0);

export function registerPopbill(server) {
  server.tool('popbill_status', '내 팝빌 계정의 연결·잔액·팩스/문자 권한·등록된 발신번호를 조회한다(보내지 않는다).', {}, async () => {
    const m = missing();
    if (m.length) return notConfigured(m);
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
    return text({ env: env(), corp: CORP, member, balance: bal, partnerBalance: partner, faxCharge, smsCharge, faxSenders, smsSenders, defaultFaxSender: FAX_SENDER || null, defaultSmsSender: SMS_SENDER || null });
  });

  server.tool(
    'send_fax',
    'PDF 를 내 팝빌 계정·내 발신번호로 팩스 전송한다. confirm 이 true 가 아니면 보내지 않고 미리보기만 돌려준다. 받는 번호는 find_branch 의 지사 팩스를 사람이 확인한 값만 쓴다.',
    {
      pdfPath: z.string(), to: z.string(), toName: z.string().describe('받는 곳(예: 국민건강보험공단 청주동부지사 자격부)'),
      title: z.string().optional(), sender: z.string().optional().describe('발신번호(없으면 POPBILL_FAX_SENDER)'), confirm: z.boolean().optional(),
    },
    async ({ pdfPath, to, toName, title, sender, confirm }) => {
      const from = digits(sender) || FAX_SENDER;
      const m = missing(from ? [] : ['POPBILL_FAX_SENDER (또는 sender)']);
      if (m.length) return notConfigured(m);
      if (!fs.existsSync(pdfPath)) return text({ ok: false, reason: 'PDF 가 없습니다' });
      const plan = { env: env(), from, to: digits(to), toName, title: title || '', file: path.basename(pdfPath), bytes: fs.statSync(pdfPath).size };
      if (confirm !== true) return text({ ok: true, preview: plan, next: '내용을 확인한 뒤 confirm:true 로 다시 부르면 보냅니다' });
      const { fax } = pb();
      const r = await call((s, e) => fax.sendFax(CORP, { SenderNum: plan.from, SenderName: '', Receiver: plan.to, ReceiverName: toName, FilePaths: [pdfPath], Title: plan.title, AdsYN: false }, s, e));
      return text(r.ok ? { ok: true, receiptNum: r.r, ...plan } : { ok: false, code: r.code, message: r.message, ...plan });
    },
  );

  server.tool('fax_result', '팩스 접수번호로 전송 결과를 조회한다.', { receiptNum: z.string() }, async ({ receiptNum }) => {
    const m = missing();
    if (m.length) return notConfigured(m);
    const r = await call((s, e) => pb().fax.getFaxResult(CORP, receiptNum, '', s, e));
    if (!r.ok) return text(r);
    return text({ ok: true, env: env(), results: (r.r || []).map((x) => ({ to: x.receiveNum, toName: x.receiveName, state: x.state, result: x.result, pages: x.sendPageCnt, successPages: x.successPageCnt, failPages: x.failPageCnt, sent: x.sendDT, done: x.resultDT })) });
  });

  server.tool(
    'send_sms',
    '문자를 내 팝빌 계정·내 발신번호로 보낸다(90바이트 이하 단문, 넘으면 장문). confirm 이 true 가 아니면 미리보기만. 주민번호 등 개인 식별번호는 넣지 않는다.',
    { to: z.string(), text: z.string(), subject: z.string().optional(), sender: z.string().optional().describe('발신번호(없으면 POPBILL_SMS_SENDER)'), toName: z.string().optional(), confirm: z.boolean().optional() },
    async ({ to, text: body, subject, sender, toName, confirm }) => {
      if (looksLikeRrn(body)) return text({ ok: false, reason: '본문에 주민번호 모양이 있습니다' });
      const from = digits(sender) || SMS_SENDER;
      const m = missing(from ? [] : ['POPBILL_SMS_SENDER (또는 sender)']);
      if (m.length) return notConfigured(m);
      const kind = eucBytes(body) <= 90 ? 'SMS' : 'LMS';
      const plan = { env: env(), kind, from, to: digits(to), bytes: eucBytes(body), text: body };
      if (confirm !== true) return text({ ok: true, preview: plan, next: '확인한 뒤 confirm:true 로 다시 부르면 보냅니다' });
      const { msg } = pb();
      const r = kind === 'SMS'
        ? await call((s, e) => msg.sendSMS(CORP, from, plan.to, toName || '', body, '', false, '', '', '', s, e))
        : await call((s, e) => msg.sendLMS(CORP, from, plan.to, toName || '', subject || '', body, '', false, '', '', '', s, e));
      return text(r.ok ? { ok: true, receiptNum: r.r, ...plan } : { ok: false, code: r.code, message: r.message, ...plan });
    },
  );

  server.tool('sms_result', '문자 접수번호로 전송 결과를 조회한다.', { receiptNum: z.string() }, async ({ receiptNum }) => {
    const m = missing();
    if (m.length) return notConfigured(m);
    const r = await call((s, e) => pb().msg.getMessages(CORP, receiptNum, '', s, e));
    if (!r.ok) return text(r);
    return text({ ok: true, env: env(), results: (r.r || []).map((x) => ({ to: x.receiveNum, state: x.state, result: x.result, type: x.type, sent: x.sendDT, done: x.resultDT })) });
  });
}
