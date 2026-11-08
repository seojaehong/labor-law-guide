// nhis 묶음 — 건강보험 관할 지사 찾기 + 자격취득·상실 신고서 PDF.
// 사이트와 같은 엔진(src/lib/nhis-forms·src/lib/branch-directory)을 그대로 불러와 서식이 한 벌로 유지된다.
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { buildPacket, PacketError } from '@/lib/nhis-forms/build';
import { loadAgencies, parseAddress, findBranches, rowsFor } from '@/lib/branch-directory';
import { text, digits, assetPath } from '../lib/common.mjs';

const SITE = process.env.LLG_SITE || 'https://yellowenvelope.kr';

export const nhisTools = ['find_branch', 'make_form'];

export function registerNhis(server) {
  // ── 지사 찾기 ──
  server.registerTool(
    'find_branch',
    {
      title: '건강보험 관할 지사 찾기',
      description: '사업장 주소나 사업자등록번호로 건강보험 관할 지사와 자격(취득·상실) 담당 전화·팩스를 찾는다. 사업자번호를 주면 그 번호만 일의 무늬 사이트 API 로 보내 주소를 받아 오고, 주소와 지사 데이터의 대조는 이 PC 안에서 한다.',
      inputSchema: { address: z.string().optional(), bizNo: z.string().optional(), pick: z.number().int().optional().describe('사업자번호 결과가 여러 사업장일 때 고를 번호(0부터)') },
      // 사업자번호 조회는 사이트 API 를 부른다 = 바깥을 읽기만 한다
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
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

  // ── 신고서 PDF ──
  const bizSchema = z.object({
    mgmtNo: z.string(), name: z.string(), addr: z.string(), ownerName: z.string(),
    tel: z.string().optional(), fax: z.string().optional(), zip: z.string().optional(),
  });
  server.registerTool(
    'make_form',
    {
      title: '건강보험 자격취득·상실 신고서 PDF 만들기',
      // PDF 를 outPath 에 쓴다. 있는 파일은 덮어쓰지 않는다(make_contract_files 와 같다)
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      description: '건강보험 자격상실(별지 8호)·자격취득(별지 6호) 신고서 + 지연 사유 사업주확인서를 사이트와 같은 서식으로 PDF 한 파일로 만든다. 주민번호가 모델 대화에 실리지 않도록 사람 명단은 peopleFile(JSON 배열 경로)로만 받는다 — 도구가 그 파일을 직접 읽는다. loss 사람 = {name,rrn,lastWorkDay(YYYY-MM-DD),nhisCode("01" 등),payCur?,monthsCur?,payPrev?,monthsPrev?}, acq 사람 = {name,rrn,acqDate,monthlyPay,nhisCode("00" 등),ceo}.',
      inputSchema: {
        kind: z.enum(['loss', 'acq']),
        biz: bizSchema,
        peopleFile: z.string().describe('사람 명단 JSON 배열 파일 경로'),
        reason: z.string().describe('늦어진 이유(300자 이내)'),
        branchName: z.string().optional().describe('받을 지사 이름(예: 청주동부지사)'),
        stampPath: z.string().optional().describe('사업장 도장 PNG(투명 배경) 경로'),
        outPath: z.string().describe('저장할 PDF 경로(이미 있으면 쓰지 않는다)'),
      },
    },
    async ({ kind, biz, peopleFile, reason, branchName, stampPath, outPath }) => {
      if (fs.existsSync(outPath)) return text({ ok: false, reason: '이미 있는 파일은 덮어쓰지 않습니다', exists: [outPath] });
      let list;
      try {
        list = JSON.parse(fs.readFileSync(peopleFile, 'utf8'));
      } catch (e) {
        return text({ ok: false, reason: `peopleFile 을 읽지 못했습니다: ${e?.code || 'JSON 형식 오류'}` });
      }
      if (!Array.isArray(list) || !list.length) return text({ ok: false, reason: 'peopleFile 에 사람이 없습니다' });
      try {
        const formPdf = fs.readFileSync(assetPath(kind === 'loss' ? 'NHIS_8_LOSS.pdf' : 'NHIS_6_ACQ.pdf'));
        const font = fs.readFileSync(assetPath('LLGFormsSans-Regular.ttf'));
        const stamp = stampPath ? new Uint8Array(fs.readFileSync(stampPath)) : undefined;
        const p = await buildPacket({ formPdf: new Uint8Array(formPdf), font: new Uint8Array(font) }, { kind, biz, people: list, reason, branchName, stamp });
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, p.bytes, { flag: 'wx' });
        return text({ ok: true, outPath, bytes: p.bytes.length, withinEdiLimit: p.withinLimit, people: list.length, pages: 2, check: '보내기 전에 PDF 를 열어 칸이 맞는지 확인하세요.' });
      } catch (e) {
        if (e instanceof PacketError) return text({ ok: false, problems: e.problems });
        return text({ ok: false, error: String(e?.message || e) });
      }
    },
  );
}
