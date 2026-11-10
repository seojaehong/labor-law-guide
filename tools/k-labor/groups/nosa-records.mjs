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
import { ARTICLE_KEYS } from '@/lib/nosa-council/meeting';
import { IMPL_STATUSES } from '@/lib/nosa-council/meeting-docs';
import {
  caseCollisions, councilVault, DOC_LOG, DOC_STAGES, docEventErrors, IMPL_LOG, implHistory, implLabel, implRecordErrors, importedMinutes, importErrors, importMatches,
  importTextWarnings, IMPORTED, RESULT_NODES, wikilinks,
} from '@/lib/nosa-council/records';
import { GRIEVANCE_CATEGORIES, GRIEVANCE_KEEP_NOTE, GRIEVANCE_LOG, GRIEVANCE_STAGES, grievanceCases, grievanceRecordErrors } from '@/lib/nosa-council/grievance';
import { argsLookLikeRrn, looksLikeRrn, text } from '../lib/common.mjs';
import { appendJsonl, loadCouncilDir, sha256File } from '../lib/council-dir.mjs';
import { readRulesFile, RULES_FILE_KINDS } from '../lib/rules-file.mjs';
import { todayKst } from './nosa.mjs';

export const nosaRecordsTools = ['record_council_history', 'export_council_vault', 'import_council_minutes'];

const WRITES = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const fail = (error, extra = {}) => text({ ok: false, error, ...extra });
const RRN_STOP = '입력에 주민등록번호 모양의 숫자가 있어 멈췄습니다. 이 도구는 주민등록번호를 받지 않습니다.';
const date = (d) => z.string().optional().describe(`${d} YYYY-MM-DD`);
const safeName = (s) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');

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
        'kind = minutes: 회의록 이력(_회의록이력.jsonl — 초안·회람·수정(사유)·서명 완료·공지·가져옴 확인). 파일 경로를 주면 그 판의 SHA-256 을 함께 남겨 서명본이 나중에 바뀌었는지 대장에서 본다. ' +
        'kind = grievance: 고충처리 대장(_고충대장.jsonl — 사건 번호 G-…·단계(청취/통보/회의 부의/종결)·날짜·분류·부의한 안건 ID). 처리결과 통보 기한은 청취일부터 10일(법 제28조제1항), 처리하기 곤란한 사항은 협의회 회의에 부친다(같은 조 제2항), 대장은 1년간 보존(시행령 제9조). 이름·사연은 받지 않는다. 주민등록번호는 받지 않는다.',
      inputSchema: {
        dir: z.string().describe('기록 폴더(회의록 .json 이 있는 폴더)'),
        kind: z.enum(['implementation', 'minutes', 'grievance']).describe('implementation 이행 기록 / minutes 회의록 이력 / grievance 고충처리 대장'),
        grievance: z.object({
          caseId: z.string().max(30).describe('사건 번호 — G- 로 시작하는 영문·숫자(예: G-2026-001). 이름을 넣지 않는다'),
          stage: z.enum(GRIEVANCE_STAGES).describe('단계 — 청취(기한의 기산점)·통보·회의 부의·종결'),
          date: z.string().describe('그 단계의 날짜 YYYY-MM-DD'),
          category: z.enum(GRIEVANCE_CATEGORIES).optional().describe('분류 — 청취에 꼭'),
          agendaId: z.string().max(40).optional().describe('회의 부의 — 협의회 안건 ID'),
          corrects: z.number().int().min(1).optional().describe('정정 — 고칠 기록 번호(seq)'),
        }).optional().describe('kind = grievance 일 때'),
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
      if (argsLookLikeRrn(a)) return fail(RRN_STOP);
      let data;
      try {
        data = loadCouncilDir(a.dir);
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
      const warnings = [];
      if (a.kind === 'grievance') {
        const r = a.grievance ?? {};
        const rec0 = { caseId: r.caseId?.trim(), stage: r.stage, date: isoDate(r.date) ?? r.date, category: r.category, agendaId: r.agendaId?.trim() || undefined, corrects: r.corrects };
        const errors = grievanceRecordErrors(rec0, data.grievances);
        if (errors.length) return text({ ok: false, errors, error: '맞지 않는 칸이 있어 덧붙이지 않았습니다.' });
        if (rec0.agendaId && !data.minutes.some((m) => m.agenda.some((x) => x.id === rec0.agendaId))) warnings.push(`기록 폴더의 회의록에서 안건 ${rec0.agendaId} 를 찾지 못했다 — 부의한 회의의 회의록을 만든 뒤에 보관함에서 이어진다.`);
        const rec = appendJsonl(path.join(a.dir, GRIEVANCE_LOG), rec0);
        const c = grievanceCases([...data.grievances, rec], todayKst()).find((x) => x.caseId === rec.caseId);
        return text({ ok: true, file: path.join(a.dir, GRIEVANCE_LOG), record: rec, case: c, keep: GRIEVANCE_KEEP_NOTE, ...(warnings.length ? { warnings } : {}) });
      }
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
      const target = data.minutes.find((m) => m.meeting.key === e.meetingKey);
      // 「가져옴 확인」은 그때 가져온 원본 해시에 묶는다 — 같은 키로 다시 가져오면 다시 확인해야 한다
      if (e.stage === '가져옴 확인' && !sha256 && target?.import?.source?.sha256) sha256 = target.import.source.sha256;
      if (!target) warnings.push(`기록 폴더에 회의 ${e.meetingKey} 의 회의록 .json 이 없다 — 회의 키를 확인한다.`);
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
      if (argsLookLikeRrn(a)) return fail(RRN_STOP);
      const today = a.today ? isoDate(a.today) : todayKst();
      if (!today) return fail(`today 는 YYYY-MM-DD 날짜입니다(받은 값: ${a.today}).`);
      let data;
      try {
        data = loadCouncilDir(a.dir);
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
      if (!data.minutes.length) return text({ ok: false, error: '기록 폴더에 회의록 .json 이 없습니다.', ...(data.skipped.length ? { skippedFiles: data.skipped } : {}) });
      const paths = [...data.events.map((e) => e.path), ...data.minutes.map((m) => m.import?.source?.path)].filter(Boolean);
      const hashes = Object.fromEntries([...new Set(paths)].map((p) => [p, sha256File(p)]));
      const v = councilVault(data.minutes, data.records, data.events, hashes, today, data.grievances);
      const clashes = caseCollisions(v.files.map((f) => f.path));
      if (clashes.length) return fail('대소문자만 다른 안건 ID 가 있어 한 파일로 겹칩니다. 회의록의 안건 ID 를 고쳐 주세요.', { clashes: clashes.slice(0, 20) });
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
          grievances: d.grievances.length,
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
          grievancesLate: d.grievancesLate.map((c) => ({ caseId: c.caseId, due: c.due, notified: c.notified })),
        },
        ...(v.ledger.warnings.length ? { warnings: v.ledger.warnings } : {}),
        ...(data.skipped.length ? { skippedFiles: data.skipped } : {}),
        boundary: BOUNDARY_NOTICE,
        open: '옵시디언에서 「폴더를 보관함으로 열기」로 outDir 를 열면 그래프 보기·백링크가 바로 된다. 파일은 이 PC 에만 있다.',
      });
    },
  );

  // ── 옛 회의록 가져오기 — 글자를 읽어 주고(①), 모델이 제안한 구조를 확인해 「가져옴 — 확인 전」 .json 으로 쓴다(②) ──
  const side = z.enum(['근로자위원', '사용자위원']);
  const long = (d) => z.string().max(2000).optional().describe(d);
  const TEXT_MAX = 60_000;
  server.registerTool(
    'import_council_minutes',
    {
      title: '노사협의회 옛 회의록 가져오기(로컬 전용)',
      description:
        `이미 있는 회의록 파일(${RULES_FILE_KINDS.join('·')})을 기록 폴더로 가져온다. 두 번 부른다 — ① proposal 없이 부르면 원본 글자·SHA-256 과 기록 폴더의 회의 키·안건 ID 를 돌려주고 아무것도 쓰지 않는다. ` +
        '② 원문에서 읽은 구조(회의 종류·차수·개최일·정원·안건별 ID·제목·구분·법조문 분류·제안 측·결과·이월)를 proposal 로 넣어 다시 부르면 도구가 확인한다(구분과 결과의 짝·ID 형식과 중복·날짜·원문에 개최일과 제목이 있는지·읽은 뒤 원본이 바뀌었는지). ' +
        `통과하면 기록 폴더에 「${IMPORTED}」 회의록 .json 을 쓴다. 원본은 옮기거나 고치지 않고 경로·SHA-256 만 남긴다. 확인 전 회의록은 보관함에서 다른 노드와 잇지 않는다 — 사람이 원본과 맞춰 본 뒤 record_council_history(kind = minutes, stage = 가져옴 확인)를 붙이면 잇는다. ` +
        '이월 안건은 앞 회의의 같은 ID 를 쓰고, 제목만 비슷한 안건은 「후보」로만 보인다. 원문에 없는 값은 비운다. 스캔(그림뿐인) pdf 는 읽지 않는다. 이름은 받지 않는다(직위·구분만). 주민등록번호는 받지 않는다. 이미 있는 파일은 덮어쓰지 않는다.',
      inputSchema: {
        dir: z.string().describe('기록 폴더 — 가져온 회의록 .json 을 여기에 쓴다'),
        source: z.string().describe(`원본 회의록 파일(${RULES_FILE_KINDS.join('·')}, 10MB 이하) — 옮기지 않는다`),
        sourceSha256: z.string().regex(/^[0-9a-f]{64}$/).optional().describe('①에서 받은 SHA-256 — 주면 그 사이 원본이 바뀌었는지 본다'),
        proposal: z.object({
          workplace: z.object({ name: z.string().max(100).optional().describe('사업장명(필수)') }).describe('사업장'),
          councilName: z.string().max(100).optional().describe('노사협의회 명칭'),
          meeting: z.object({
            kind: z.enum(['정기', '임시']).describe('회의 종류'),
            number: z.number().int().min(1).optional().describe('차수(필수 — 회의 키 YYYY-정기|임시-N차)'),
            date: z.string().describe('개최일 YYYY-MM-DD'),
            time: z.string().max(20).optional().describe('시각'),
            place: z.string().max(100).optional().describe('장소'),
            noticeDate: date('소집 통보일(원문에 있을 때).'),
            previousRegularDate: date('직전 정기회의일(원문에 있을 때).'),
          }).describe('회의'),
          seats: z.object({ worker: z.number().int().min(1), employer: z.number().int().min(1) }).describe('그때 협의회규정상 정원'),
          attendance: z.object({ worker: z.number().int().min(0), employer: z.number().int().min(0) }).optional().describe('출석 수(원문에 있을 때)'),
          agenda: z.array(z.object({
            id: z.string().max(40).optional().describe('안건 ID — 이월 안건은 앞 회의의 같은 ID(①의 existing.agenda). 비우면 A-개최일-순번'),
            title: z.string().max(200).describe('안건 제목(원문 그대로)'),
            type: z.enum(['보고', '협의', '의결']).describe('구분'),
            article: z.enum(ARTICLE_KEYS).optional().describe('법조문 분류 — 20-1~20-17, 21-1~21-5, 22-1~22-4'),
            proposer: side.optional().describe('제안 측'),
            carriedOver: z.boolean().optional().describe('앞선 회의에서 넘어온 안건'),
            result: z.enum(RESULT_NODES).describe('원문에 적힌 결과 — 의결 / 의결되지 않음 / 계속 협의 / 보고 완료'),
            inFavor: z.number().int().min(0).optional().describe('찬성 수(원문에 있을 때)'),
            background: long('배경(원문에 있을 때)'),
            discussion: z.array(z.object({
              side: z.enum(['근로자위원', '사용자위원', '의장', '간사']),
              position: z.string().max(40).optional().describe('직위'),
              summary: z.string().max(2000).describe('발언 요지 — 원문 그대로'),
            })).max(40).optional().describe('발언 요지(이름 없이 직위·구분만)'),
            decision: z.string().max(1000).optional().describe('의결된 내용'),
            implementation: z.object({ action: z.string().max(300).optional(), owner: z.string().max(40).optional().describe('담당 직위'), due: date('이행 기한.') }).optional().describe('이행 계획'),
          })).min(1).max(40).describe('안건 순서대로'),
          reports: z.object({ 경영계획: long('경영계획 전반 및 실적'), 생산계획: long('분기별 생산계획과 실적'), 인력계획: long('인력계획'), 재정상황: long('기업의 경제적·재정적 상황') }).optional().describe('정기회의 보고사항(원문에 있을 때)'),
          otherNotes: z.string().max(1000).optional().describe('그 밖의 참고사항'),
          writtenDate: z.string().describe('작성일 YYYY-MM-DD(원문에 없으면 개최일) — 보존 만료를 여기서 잰다'),
        }).optional().describe('원문에서 읽은 구조 — 없으면 원본 글자만 읽어 돌려준다'),
        fileBase: z.string().max(80).optional().describe('.json 이름 앞부분(기본 노사협의회_개최일_정기N차)'),
      },
      annotations: WRITES,
    },
    async (a) => {
      if (argsLookLikeRrn(a)) return fail(RRN_STOP);
      let data;
      let read;
      try {
        data = loadCouncilDir(a.dir);
        read = await readRulesFile(a.source);
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
      const source = path.resolve(a.source);
      const sha256 = sha256File(source);
      if (!a.proposal) {
        const agenda = new Map();
        for (const m of data.minutes) for (const x of m.agenda) agenda.set(x.id, { id: x.id, title: x.title, meetings: [...(agenda.get(x.id)?.meetings ?? []), m.meeting.key] });
        return text({
          ok: true,
          step: 'read',
          source,
          sha256,
          kind: read.kind,
          chars: read.text.length,
          text: read.text.slice(0, TEXT_MAX),
          ...(read.text.length > TEXT_MAX ? { truncated: `글자가 ${read.text.length}자라 앞 ${TEXT_MAX}자만 실었다.` } : {}),
          ...(looksLikeRrn(read.text) ? { warnings: ['원문에 주민등록번호 모양의 숫자가 있어 응답에서 가렸다. 가져온 회의록에는 싣지 않는다.'] } : {}),
          existing: { meetings: data.minutes.map((m) => m.meeting.key), agenda: [...agenda.values()].slice(0, 300) },
          next: '원문에서 읽은 값으로 proposal 을 채워 sourceSha256 과 함께 다시 부른다. 결과는 원문에 적힌 대로, 이월 안건은 existing.agenda 의 같은 ID 를 쓴다. 원문에 없는 값은 비운다.',
        });
      }
      if (a.sourceSha256 && a.sourceSha256 !== sha256) return fail('읽은 뒤 원본 파일이 바뀌었다. proposal 없이 다시 읽고 구조를 다시 맞춘다.', { sha256 });
      const p = { ...a.proposal, writtenDate: isoDate(a.proposal.writtenDate) ?? a.proposal.writtenDate };
      const errors = importErrors(p);
      if (errors.length) return text({ ok: false, errors, error: '원문 구조가 맞지 않아 가져오지 않았습니다. 고쳐서 다시 부르세요.' });
      const { record, warnings } = importedMinutes(p, { path: source, sha256 });
      const key = record.meeting.key;
      if (data.minutes.some((m) => m.meeting.key === key)) return fail(`기록 폴더에 같은 회의 키(${key})의 회의록이 이미 있습니다. 판은 record_council_history(kind = minutes)로 남깁니다.`);
      const m = record.meeting;
      const base = safeName((a.fileBase ?? '').trim() || `노사협의회_${m.date.replace(/-/g, '')}_${m.kind}${m.number}차`);
      const file = path.resolve(a.dir, `${base}_회의록_가져옴.json`);
      if (fs.existsSync(file)) return fail('이미 있는 파일은 덮어쓰지 않습니다. fileBase 를 바꿔 주세요.', { exists: [file] });
      fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
      const textWarnings = importTextWarnings(record, read.text);
      const { sameId, candidates } = importMatches(record, data.minutes, data.events);
      return text({
        ok: true,
        step: 'saved',
        file,
        meetingKey: key,
        status: IMPORTED,
        source: { path: source, sha256 },
        agenda: record.agenda.map((x) => ({ id: x.id, title: x.title, result: x.result })),
        sameId,
        candidates,
        ...(textWarnings.length ? { textWarnings } : {}),
        ...(warnings.length || record.check.warnings.length ? { warnings: [...warnings, ...record.check.warnings] } : {}),
        next: `원본을 열어 값을 맞춰 본 뒤 record_council_history(kind = minutes, meetingKey = ${key}, stage = 가져옴 확인)를 붙이면 보관함에서 잇는다. 틀린 값이 있으면 이 .json 을 지우고 다시 가져온다.`,
      });
    },
  );
}
