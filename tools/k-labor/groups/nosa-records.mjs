// nosa 기록 묶음(로컬 전용) — 노사협의회 회의록 보관함.
//   record_council_history  이행 기록·회의록 이력(판·서명·공지·가져옴 확인)을 덧붙인다 — 고치거나 지우지 않는다
//   export_council_vault    기록 폴더 → 옵시디언 보관함(md + YAML 앞머리 + [[위키링크]]) · _대시보드.md · _회의록대장.md·.xlsx
// 계산은 src/lib/nosa-council/records.ts(정본). 선은 구조화 값에서만 만든다(minutes-graph-spec-261110).
// ★ 이 파일은 원격판(remote.mjs)에서 불러오지 않는다 — 파일을 읽고 쓰며 exceljs 를 쓴다. stdio 판(server.mjs)의 nosa 묶음으로만 켠다.
// ★ 공개 문구 금지어 + 포괄·대신·대행·대리·지도를 이 묶음의 글(설명·결과)에 쓰지 않는다.
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { BOUNDARY_NOTICE, isoDate } from '@/lib/nosa-council/assess';
import { IMPL_STATUSES } from '@/lib/nosa-council/meeting-docs';
import {
  councilVault, DOC_LOG, DOC_STAGES, docEventErrors, IMPL_LOG, implHistory, implLabel, implRecordErrors, wikilinks,
} from '@/lib/nosa-council/records';
import { looksLikeRrn, text } from '../lib/common.mjs';
import { appendJsonl, loadCouncilDir, sha256File } from '../lib/council-dir.mjs';
import { todayKst } from './nosa.mjs';

export const nosaRecordsTools = ['record_council_history', 'export_council_vault'];

const WRITES = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const fail = (error, extra = {}) => text({ ok: false, error, ...extra });
const RRN_STOP = '입력에 주민등록번호 모양의 숫자가 있어 멈췄습니다. 이 도구는 주민등록번호를 받지 않습니다.';
const date = (d) => z.string().optional().describe(`${d} YYYY-MM-DD`);

async function ledgerXlsx(head, rows, warnings, today) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('회의록대장', { views: [{ state: 'frozen', ySplit: 2 }] });
  sheet.addRow([`회의록 대장 (${today})`]);
  sheet.getRow(1).font = { bold: true, size: 14 };
  const h = sheet.addRow(['회의', ...head]);
  h.font = { bold: true };
  h.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF2' } }; });
  for (const r of rows) sheet.addRow(r);
  sheet.columns.forEach((c, k) => { c.width = k === 0 ? 18 : 13; });
  const w = book.addWorksheet('점검');
  w.addRow(['점검']).font = { bold: true };
  for (const x of warnings.length ? warnings : ['알릴 것 없음']) w.addRow([x]);
  w.getColumn(1).width = 120;
  return Buffer.from(await book.xlsx.writeBuffer());
}

export function registerNosaRecords(server) {
  server.registerTool(
    'record_council_history',
    {
      title: '노사협의회 기록 덧붙이기(로컬 전용)',
      description:
        '기록 폴더(회의록 .json 이 있는 폴더)에 한 줄을 덧붙인다. 고치거나 지우지 않는다 — 잘못 적었으면 corrects(고칠 기록 번호)를 단 새 기록을 붙인다. ' +
        'kind = implementation: 의결 안건의 이행 기록(_이행기록.jsonl — 일자·상태(미착수/진행/완료/보류/철회)·담당 직위·내용·근거·확인한 회의). 현재 상태는 마지막 기록이고, 근거 없는 완료는 「완료(근거 없음)」으로 본다. ' +
        'kind = minutes: 회의록 이력(_회의록이력.jsonl — 초안·회람·수정(사유)·서명 완료·공지·가져옴 확인). 파일 경로를 주면 그 판의 SHA-256 을 함께 남겨 서명본이 나중에 바뀌었는지 대장에서 본다. 주민등록번호는 받지 않는다.',
      inputSchema: {
        dir: z.string().describe('기록 폴더(회의록 .json 이 있는 폴더)'),
        kind: z.enum(['implementation', 'minutes']).describe('implementation 이행 기록 / minutes 회의록 이력'),
        implementation: z.object({
          date: z.string().describe('일자 YYYY-MM-DD'),
          agendaId: z.string().max(40).describe('의결 안건 ID'),
          status: z.enum(IMPL_STATUSES).describe('상태'),
          owner: z.string().max(40).optional().describe('담당(직위)'),
          content: z.string().max(1000).optional().describe('내용'),
          evidence: z.string().max(300).optional().describe('근거(문서 경로·회의 ID) — 완료에는 꼭'),
          confirmedAt: z.string().max(40).optional().describe('확인한 회의(회의 키, 예: 2026-정기-4차)'),
          corrects: z.number().int().min(1).optional().describe('정정 — 고칠 기록 번호(seq)'),
        }).optional().describe('kind = implementation 일 때'),
        minutes: z.object({
          meetingKey: z.string().max(40).describe('회의 키(예: 2026-정기-4차)'),
          stage: z.enum(DOC_STAGES).describe('단계'),
          date: z.string().describe('일자 YYYY-MM-DD'),
          version: z.number().int().min(1).optional().describe('판 번호'),
          reason: z.string().max(300).optional().describe('변경 사유(수정 판에 꼭)'),
          path: z.string().max(400).optional().describe('그 판의 파일 경로 — 주면 SHA-256 을 남긴다'),
        }).optional().describe('kind = minutes 일 때'),
      },
      annotations: WRITES,
    },
    async (a) => {
      if (looksLikeRrn(JSON.stringify(a))) return fail(RRN_STOP);
      let data;
      try {
        data = loadCouncilDir(a.dir);
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
      const warnings = [];
      if (a.kind === 'implementation') {
        const r = a.implementation ?? {};
        const errors = implRecordErrors({ ...r, date: isoDate(r.date) ?? r.date });
        if (r.corrects != null && r.corrects > data.records.length) errors.push(`정정할 기록 ${r.corrects}번이 없습니다(지금 ${data.records.length}건).`);
        if (errors.length) return text({ ok: false, errors, error: '맞지 않는 칸이 있어 덧붙이지 않았습니다.' });
        const known = data.minutes.some((m) => m.agenda.some((x) => x.id === r.agendaId && x.result === '의결'));
        if (!known) warnings.push(`기록 폴더의 회의록에서 의결된 안건 ${r.agendaId} 를 찾지 못했다 — ID 를 확인한다(가져올 회의록이면 그대로 둔다).`);
        if (r.status === '완료' && !(r.evidence ?? '').trim()) warnings.push('근거 없이 「완료」로 적어 「완료(근거 없음)」으로 보인다 — 근거(문서 경로·회의 ID)를 더한 기록을 붙이면 풀린다.');
        const rec = appendJsonl(path.join(a.dir, IMPL_LOG), { date: isoDate(r.date), agendaId: r.agendaId.trim(), status: r.status, owner: r.owner, content: r.content, evidence: r.evidence, confirmedAt: r.confirmedAt, corrects: r.corrects });
        const hist = implHistory(data.minutes, [...data.records, rec])[rec.agendaId] ?? [];
        return text({ ok: true, file: path.join(a.dir, IMPL_LOG), record: rec, current: hist.length ? implLabel(hist.at(-1)) : implLabel(rec), history: hist.length, ...(warnings.length ? { warnings } : {}) });
      }
      const e = a.minutes ?? {};
      const errors = docEventErrors({ ...e, date: isoDate(e.date) ?? e.date });
      let sha256;
      if (e.path) {
        sha256 = fs.existsSync(e.path) && fs.statSync(e.path).isFile() ? sha256File(e.path) : null;
        if (!sha256) errors.push(`파일이 없습니다: ${e.path}`);
      }
      if (errors.length) return text({ ok: false, errors, error: '맞지 않는 칸이 있어 덧붙이지 않았습니다.' });
      if (!data.minutes.some((m) => m.meeting.key === e.meetingKey)) warnings.push(`기록 폴더에 회의 ${e.meetingKey} 의 회의록 .json 이 없다 — 회의 키를 확인한다.`);
      const rec = appendJsonl(path.join(a.dir, DOC_LOG), { meetingKey: e.meetingKey.trim(), stage: e.stage, date: isoDate(e.date), version: e.version, reason: e.reason, path: e.path, sha256 });
      return text({ ok: true, file: path.join(a.dir, DOC_LOG), record: rec, ...(warnings.length ? { warnings } : {}) });
    },
  );

  server.registerTool(
    'export_council_vault',
    {
      title: '노사협의회 회의록 보관함 내보내기(로컬 전용)',
      description:
        '기록 폴더(회의록 .json · _이행기록.jsonl · _회의록이력.jsonl)를 읽어 outDir 에 옵시디언 보관함을 만든다: 노드 하나 = md 파일 하나(YAML 앞머리 type·id·date·status + 본문 + [[위키링크]]) — 협의회·회의·안건·결과·이행·법조문·위원(직위·구분만). ' +
        '선은 안건 ID·결과·법조문 분류·제안 측·이행 기록에서만 만들고(같은 안건 ID 가 다음 회의에 다시 나오면 이월), 발언 요지 같은 자유 글은 링크가 되지 않게 옮긴다. 가져온 회의록은 「가져옴 확인」 전에는 잇지 않는다. ' +
        '_대시보드.md: 미이행·기한 경과 의결, 3회 이상 이월, 1년간 다루지 않은 법 제20조제1항 호, 정기회의 간격, 보고사항 누락. _회의록대장.md·.xlsx: 차수·개최일·통보·정족수·안건·의결 수·서명일·공지일·보존 만료일(작성일부터 3년)·현재 판·해시와 점검(서명 누락·공지 기한·보존 만료·서명본 해시 변경). 이미 있는 파일은 덮어쓰지 않는다.',
      inputSchema: {
        dir: z.string().describe('기록 폴더'),
        outDir: z.string().describe('보관함을 만들 폴더(옵시디언에서 이 폴더를 연다)'),
        today: date('기준일(기본 오늘, KST).'),
      },
      annotations: WRITES,
    },
    async (a) => {
      if (looksLikeRrn(JSON.stringify(a))) return fail(RRN_STOP);
      const today = a.today ? isoDate(a.today) : todayKst();
      if (!today) return fail(`today 는 YYYY-MM-DD 날짜입니다(받은 값: ${a.today}).`);
      let data;
      try {
        data = loadCouncilDir(a.dir);
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
      if (!data.minutes.length) return text({ ok: false, error: '기록 폴더에 회의록 .json 이 없습니다.', ...(data.skipped.length ? { skippedFiles: data.skipped } : {}) });
      const hashes = Object.fromEntries([...new Set(data.events.map((e) => e.path).filter(Boolean))].map((p) => [p, sha256File(p)]));
      const v = councilVault(data.minutes, data.records, data.events, hashes, today);
      const targets = [...v.files.map((f) => f.path), '_회의록대장.xlsx'].map((p) => path.join(a.outDir, p));
      const exists = targets.filter((p) => fs.existsSync(p));
      if (exists.length) return fail('이미 있는 파일은 덮어쓰지 않습니다. outDir 를 바꿔 주세요.', { exists: exists.slice(0, 20) });
      for (const f of v.files) {
        const p = path.join(a.outDir, f.path);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, f.text);
      }
      fs.writeFileSync(path.join(a.outDir, '_회의록대장.xlsx'), await ledgerXlsx(v.ledgerHead, v.ledger.rows.map((r, k) => [r.key, ...v.ledgerCells[k]]), v.ledger.warnings, today));
      const names = new Set(v.files.map((f) => path.basename(f.path, '.md')));
      const brokenLinks = v.files.flatMap((f) => wikilinks(f.text).filter((l) => !names.has(l)).map((l) => `${f.path} → ${l}`));
      const d = v.dashboard;
      return text({
        ok: true,
        outDir: a.outDir,
        today,
        files: v.files.length + 1,
        counts: {
          meetings: v.ledger.rows.length,
          agenda: v.graph.nodes.filter((n) => n.type === '안건').length,
          edges: v.graph.edges.length,
          carried: v.graph.edges.filter((e) => e.type === '이월').length,
        },
        brokenLinks,
        dashboard: {
          overdue: d.overdue.map((x) => ({ agendaId: x.agendaId, status: x.status, due: x.due, late: x.late })),
          carriedThreeTimes: d.carried.map((x) => x.agendaId),
          untouchedArticles: d.untouched.map((x) => x.key),
          gaps: d.gaps.map((x) => x.status),
          missingReports: d.missingReports.map((x) => x.meeting),
          unconfirmed: d.unconfirmed,
          candidates: d.candidates.length,
        },
        ...(v.ledger.warnings.length ? { warnings: v.ledger.warnings } : {}),
        ...(data.skipped.length ? { skippedFiles: data.skipped } : {}),
        boundary: BOUNDARY_NOTICE,
        open: '옵시디언에서 「폴더를 보관함으로 열기」로 outDir 를 열면 그래프 보기·백링크가 바로 된다. 파일은 이 PC 에만 있다.',
      });
    },
  );
}
