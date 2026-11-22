// 오피스 묶음 — xlsx 서식 검사·행 추출·원본 서식 그대로 채우기·사양(JSON)으로 만들기.
//   inspect_xlsx · extract_xlsx_rows · fill_xlsx_template · make_xlsx_from_spec
// 엔진 = src/lib/office(바이트 입출력 순수 함수). 이 파일만 경로를 읽고 쓴다.
// ★ stdio 판(server.mjs)은 파일 경로로 받는다. 결과 파일은 writeNew(덮어쓰지 않음).
// ★ 공개 문구 금지어 + 포괄·대신·대행·대리·지도를 이 묶음의 글(설명·결과)에 쓰지 않는다.
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { inspectXlsx } from '@/lib/office/xlsx/inspect';
import { extractXlsxRows } from '@/lib/office/xlsx/extract';
import { fillXlsxTemplate } from '@/lib/office/xlsx/fill';
import { makeXlsxFromSpec } from '@/lib/office/xlsx/make';
import { checkZipUncompressedSize, MAX_REMOTE_INPUT_BYTES, MAX_REMOTE_OUTPUT_BYTES, MAX_REMOTE_UNZIPPED_BYTES } from '@/lib/office/limits';
import { argsLookLikeRrn, text, writeNew } from '../lib/common.mjs';

/** 파일 경로 입출력 — 이 PC 에서만 */
export const officeLocalOnly = ['inspect_xlsx', 'extract_xlsx_rows', 'fill_xlsx_template', 'make_xlsx_from_spec'];
/** base64 입출력 — fs 없음, 원격판(remote.mjs)에 싣는다 */
export const officeRemoteSafe = ['inspect_xlsx_bytes', 'extract_xlsx_rows_bytes', 'fill_xlsx_template_bytes', 'make_xlsx_from_spec_bytes'];
export const officeTools = [...officeLocalOnly, ...officeRemoteSafe];

const READS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITES = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const fail = (error, extra = {}) => text({ ok: false, error, ...extra });
const RRN_STOP = '입력에 주민등록번호 모양의 숫자가 있어 멈췄습니다. 이 도구는 주민등록번호를 받지 않습니다.';
const EXISTS = '이미 있는 파일은 덮어쓰지 않습니다. outFile 을 바꿔 주세요.';
const MAX_FILE = 20 * 1024 * 1024;
const NOT_SUPPORTED = '.xls(옛 형식)·암호 걸린 파일·매크로 파일(xlsm)·엑셀 라이브러리가 열지 못하는 파일은 지금 받지 않습니다. 엑셀에서 .xlsx 로 다시 저장해 주세요.';

const value = z.union([z.string().max(4000), z.number(), z.boolean(), z.null()]);
const cellsSchema = z.array(z.object({ sheet: z.string().max(100), cell: z.string().max(20), value })).max(5000).optional().describe('칸 하나씩 채우기');
const rowsSchema = z
  .object({
    sheet: z.string().max(100),
    startRow: z.number().int().min(1).max(1_000_000).describe('첫 자료 행 번호(1부터)'),
    columns: z.record(z.string().max(3), z.string().max(100)).describe('열 문자 → data 의 키(예 {"A":"id"})'),
    data: z.array(z.record(z.string().max(100), value.optional())).max(50_000),
    overflow: z.enum(['error', 'insertRows']).optional(),
  })
  .optional()
  .describe('표 행 채우기');
const specSchema = z
  .object({
    sheets: z
      .array(
        z.object({
          name: z.string().max(100),
          title: z.string().max(400).optional(),
          columns: z.array(z.object({ key: z.string().max(100), header: z.string().max(400), width: z.number().min(0).max(255).optional(), wrap: z.boolean().optional() })).max(200),
          headerRows: z.array(z.array(z.string().max(400).nullable()).max(200)).max(20).optional(),
          merges: z.array(z.string().max(30)).max(1000).optional(),
          validations: z.array(z.object({ range: z.string().max(30), list: z.array(z.string().max(255)).max(100) })).max(200).optional(),
          freeze: z.string().max(20).optional(),
          print: z
            .object({ orientation: z.enum(['landscape', 'portrait']), paper: z.literal('A4'), fitToWidth: z.number().int().min(1).max(10).optional(), printTitlesRows: z.string().max(20).optional() })
            .optional(),
          rows: z.array(z.record(z.string().max(100), value.optional())).max(50_000).optional(),
        }),
      )
      .max(50),
  })
  .describe('서식 사양');

/** 입력 파일을 읽는다. 오류면 문자열 */
function readInput(file) {
  const p = String(file ?? '').trim();
  if (!p) return '파일 경로를 주세요.';
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return `파일이 없습니다: ${p}`;
  if (fs.statSync(p).size > MAX_FILE) return '20MB 를 넘는 파일은 받지 않습니다.';
  return { path: p, bytes: new Uint8Array(fs.readFileSync(p)) };
}

/** 결과 파일 경로 검사. 오류면 문자열 */
function checkOut(outFile, src) {
  const out = String(outFile ?? '').trim();
  if (!/\.xlsx$/i.test(out)) return 'outFile 은 .xlsx 로 끝나야 합니다.';
  if (src && path.resolve(out) === path.resolve(src)) return '원본 파일에는 쓰지 않습니다. outFile 을 바꿔 주세요.';
  if (fs.existsSync(out)) return EXISTS;
  return { out };
}

function save(out, bytes) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  return writeNew(out, bytes);
}

export function registerOffice(server) {
  server.registerTool(
    'inspect_xlsx',
    {
      title: '엑셀(xlsx) 서식 구조 보기(로컬 전용)',
      description:
        'xlsx 파일의 시트별 크기·병합 범위·수식 칸 수·조건부서식 규칙 수·데이터 유효성 범위·그림 수·인쇄영역·인쇄제목·용지 방향·맞춤과 이름정의를 한 번에 돌려준다. 파일은 고치지 않는다. ' +
        `needsReview:true 는 이 엔진이 열지 않은 파일이라는 뜻이다(${NOT_SUPPORTED})`,
      inputSchema: { file: z.string().max(400).describe('xlsx 파일 경로(20MB 이하)') },
      annotations: READS,
    },
    async (a) => {
      const f = readInput(a.file);
      if (typeof f === 'string') return fail(f);
      return text({ file: f.path, ...(await inspectXlsx(f.bytes)) });
    },
  );

  server.registerTool(
    'extract_xlsx_rows',
    {
      title: '엑셀(xlsx) 표 행을 칸 주소와 함께 읽기(로컬 전용)',
      description:
        '머리행 아래 행을 머리 이름별로 읽는다. 칸마다 원래 칸 주소(cell)·원문 값(raw, 글자는 숫자로 바꾸지 않음)·수식(formula)·저장된 계산값(cachedValue)·병합 출처(mergedFrom)를 붙인다. ' +
        '계산값이 저장되지 않은 수식 칸과 maxRows 로 잘린 행은 warnings 에 적는다. 파일은 고치지 않는다.',
      inputSchema: {
        file: z.string().max(400).describe('xlsx 파일 경로(20MB 이하)'),
        sheet: z.string().max(100).optional().describe('시트 이름(비우면 첫 시트)'),
        headerRow: z.number().int().min(1).max(1_000_000).optional().describe('머리행 번호(1부터, 기본 1)'),
        maxRows: z.number().int().min(1).max(100_000).optional().describe('읽을 최대 행 수(기본 10000)'),
      },
      annotations: READS,
    },
    async (a) => {
      const f = readInput(a.file);
      if (typeof f === 'string') return fail(f);
      const r = await extractXlsxRows(f.bytes, { sheet: a.sheet, headerRow: a.headerRow, maxRows: a.maxRows });
      return text({ file: f.path, ...r });
    },
  );

  server.registerTool(
    'fill_xlsx_template',
    {
      title: '엑셀(xlsx) 원본 서식 그대로 칸 채우기(로컬 전용)',
      description:
        '원본 xlsx 의 지정 칸(cells)과 표 행(rows)만 채워 새 파일로 저장한다. 원본은 고치지 않고 이미 있는 파일은 덮어쓰지 않는다. ' +
        '수식 칸의 저장된 계산값은 지우고 열 때 다시 계산하게 표시한다(fullCalcOnLoad). preserved 에 병합·수식 수·조건부서식·유효성 범위·인쇄영역·인쇄제목·방향·맞춤·그림 수·이름정의를 채우기 전후로 비교해 돌려준다. ' +
        "rows 의 자료가 템플릿 빈 행보다 많으면 overflow='error'(기본) 는 채우지 않고 넘친 행 수를, 'insertRows' 는 행을 넣고 warnings 를 낸다.",
      inputSchema: {
        file: z.string().max(400).describe('원본(템플릿) xlsx 파일 경로(20MB 이하)'),
        outFile: z.string().max(400).describe('저장할 새 xlsx 파일 경로'),
        cells: cellsSchema,
        rows: rowsSchema,
      },
      annotations: WRITES,
    },
    async (a) => {
      if (argsLookLikeRrn({ cells: a.cells, rows: a.rows })) return fail(RRN_STOP);
      if (!a.cells?.length && !a.rows) return fail('cells 나 rows 중 하나를 주세요.');
      const f = readInput(a.file);
      if (typeof f === 'string') return fail(f);
      const o = checkOut(a.outFile, f.path);
      if (typeof o === 'string') return fail(o, o === EXISTS ? { exists: String(a.outFile).trim() } : {});
      const r = await fillXlsxTemplate(f.bytes, { cells: a.cells, rows: a.rows });
      const { bytes, ...rest } = r;
      if (!r.ok || !bytes) return text({ ...rest, ...(r.needsReview ? { notice: NOT_SUPPORTED } : {}) });
      if (!save(o.out, bytes)) return fail(EXISTS, { exists: o.out });
      return text({ ...rest, file: { path: o.out, bytes: bytes.length } });
    },
  );

  server.registerTool(
    'make_xlsx_from_spec',
    {
      title: '사양(JSON)으로 엑셀(xlsx) 서식 만들기(로컬 전용)',
      description:
        '시트마다 이름·제목(1행 병합)·열(key·머리·폭·줄바꿈)·추가 머리행·병합·유효성 목록(드롭다운)·틀고정·인쇄(가로/세로·A4·폭 맞춤·인쇄제목 행)·자료 행을 받아 xlsx 를 새로 만든다. ' +
        '이미 있는 파일은 덮어쓰지 않는다. 사양이 잘못되면(빈·중복 시트 이름, 열 key 중복 등) 만들지 않고 errors 를 돌려준다.',
      inputSchema: {
        spec: specSchema,
        outFile: z.string().max(400).describe('저장할 새 xlsx 파일 경로'),
      },
      annotations: WRITES,
    },
    async (a) => {
      if (argsLookLikeRrn({ spec: a.spec })) return fail(RRN_STOP);
      const o = checkOut(a.outFile);
      if (typeof o === 'string') return fail(o, o === EXISTS ? { exists: String(a.outFile).trim() } : {});
      const r = await makeXlsxFromSpec(a.spec);
      if (!r.ok) return text(r);
      if (!save(o.out, r.bytes)) return fail(EXISTS, { exists: o.out });
      return text({ ok: true, file: { path: o.out, bytes: r.bytes.length }, sheets: a.spec.sheets.map((s) => s.name) });
    },
  );

  registerOfficeRemote(server);
}

// ── 원격(HTTP)판 — base64 입출력. 아래 함수들은 fs·네트워크를 쓰지 않는다(remote.mjs 가 officeRemoteSafe 이름만 통과시킨다).
const REMOTE_READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
// 채우기·만들기도 원격판에서는 서버에 아무것도 남기지 않고 바이트만 돌려준다
const REMOTE_MAKE = { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
const b64In = z.string().max(8_000_000).describe('xlsx 파일 바이트(base64, 디코드 후 5MB 이하)');

/** base64 → 바이트. 크기(5MB)·zip 해제 합계(50MB) 검사. 오류면 {ok:false, code, error} */
function decodeRemoteInput(b64) {
  const s = String(b64 ?? '').replace(/\s+/g, '');
  if (!s) return { ok: false, code: 'BAD_BASE64', error: 'base64 를 주세요.' };
  if (s.length % 4 !== 0 || !B64_RE.test(s)) return { ok: false, code: 'BAD_BASE64', error: 'base64 형식이 아닙니다.' };
  if (Math.floor((s.length * 3) / 4) - (s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0) > MAX_REMOTE_INPUT_BYTES)
    return { ok: false, code: 'INPUT_TOO_LARGE', error: `디코드한 입력이 ${MAX_REMOTE_INPUT_BYTES} 바이트(5MB)를 넘습니다.` };
  const bytes = new Uint8Array(Buffer.from(s, 'base64'));
  const z64 = checkZipUncompressedSize(bytes, MAX_REMOTE_UNZIPPED_BYTES);
  if (!z64.ok) return { ok: false, code: 'ZIP_TOO_LARGE', error: `zip 을 열지 않았습니다: ${z64.reason}` };
  return { ok: true, bytes };
}

/** 결과 바이트 → base64. 5MB 를 넘으면 {ok:false, code:'OUTPUT_TOO_LARGE'} */
export function encodeRemoteOutput(bytes) {
  if (bytes.length > MAX_REMOTE_OUTPUT_BYTES) return { ok: false, code: 'OUTPUT_TOO_LARGE', error: `결과가 ${MAX_REMOTE_OUTPUT_BYTES} 바이트(5MB)를 넘어 돌려주지 않습니다.`, bytes: bytes.length };
  return { ok: true, base64: Buffer.from(bytes).toString('base64') };
}

function registerOfficeRemote(server) {
  server.registerTool(
    'inspect_xlsx_bytes',
    {
      title: '엑셀(xlsx) 서식 구조 보기(base64)',
      description:
        'base64 로 받은 xlsx 의 시트별 크기·병합 범위·수식 칸 수·조건부서식 규칙 수·데이터 유효성 범위·그림 수·인쇄영역·인쇄제목·용지 방향·맞춤과 이름정의를 돌려준다. 서버에 파일을 남기지 않는다. ' +
        `입력은 디코드 후 5MB, 압축을 푼 합계 50MB 까지. needsReview:true 는 이 엔진이 열지 않은 파일이라는 뜻이다(${NOT_SUPPORTED})`,
      inputSchema: { base64: b64In },
      annotations: REMOTE_READ,
    },
    async (a) => {
      const d = decodeRemoteInput(a.base64);
      if (!d.ok) return text(d);
      return text(await inspectXlsx(d.bytes));
    },
  );

  server.registerTool(
    'extract_xlsx_rows_bytes',
    {
      title: '엑셀(xlsx) 표 행을 칸 주소와 함께 읽기(base64)',
      description:
        'base64 로 받은 xlsx 의 머리행 아래 행을 머리 이름별로 읽는다. 칸마다 칸 주소(cell)·원문 값(raw, 글자는 숫자로 바꾸지 않음)·수식·저장된 계산값·병합 출처를 붙인다. ' +
        '계산값이 저장되지 않은 수식 칸과 잘린 행은 warnings 에 적는다. 입력은 디코드 후 5MB, 압축을 푼 합계 50MB 까지.',
      inputSchema: {
        base64: b64In,
        sheet: z.string().max(100).optional().describe('시트 이름(비우면 첫 시트)'),
        headerRow: z.number().int().min(1).max(1_000_000).optional().describe('머리행 번호(1부터, 기본 1)'),
        maxRows: z.number().int().min(1).max(100_000).optional().describe('읽을 최대 행 수(기본 10000)'),
      },
      annotations: REMOTE_READ,
    },
    async (a) => {
      const d = decodeRemoteInput(a.base64);
      if (!d.ok) return text(d);
      return text(await extractXlsxRows(d.bytes, { sheet: a.sheet, headerRow: a.headerRow, maxRows: a.maxRows }));
    },
  );

  server.registerTool(
    'fill_xlsx_template_bytes',
    {
      title: '엑셀(xlsx) 원본 서식 그대로 칸 채우기(base64)',
      description:
        'base64 로 받은 원본 xlsx 의 지정 칸(cells)과 표 행(rows)만 채워 새 xlsx 를 base64 로 돌려준다. 서버에 파일을 남기지 않는다. ' +
        '수식 칸의 저장된 계산값은 지우고 열 때 다시 계산하게 표시한다(fullCalcOnLoad). preserved 에 서식 항목을 채우기 전후로 비교해 돌려준다. ' +
        "rows 가 템플릿 빈 행보다 많으면 overflow='error'(기본) 는 채우지 않고, 'insertRows' 는 행을 넣고 warnings 를 낸다. 입력·결과는 각각 5MB 까지.",
      inputSchema: {
        base64: b64In,
        cells: cellsSchema,
        rows: rowsSchema,
      },
      annotations: REMOTE_MAKE,
    },
    async (a) => {
      if (argsLookLikeRrn({ cells: a.cells, rows: a.rows })) return fail(RRN_STOP);
      if (!a.cells?.length && !a.rows) return fail('cells 나 rows 중 하나를 주세요.');
      const d = decodeRemoteInput(a.base64);
      if (!d.ok) return text(d);
      const r = await fillXlsxTemplate(d.bytes, { cells: a.cells, rows: a.rows });
      const { bytes, ...rest } = r;
      if (!r.ok || !bytes) return text({ ...rest, ...(r.needsReview ? { notice: NOT_SUPPORTED } : {}) });
      const o = encodeRemoteOutput(bytes);
      if (!o.ok) return text(o);
      return text({ ...rest, base64: o.base64, outputBytes: bytes.length });
    },
  );

  server.registerTool(
    'make_xlsx_from_spec_bytes',
    {
      title: '사양(JSON)으로 엑셀(xlsx) 서식 만들기(base64)',
      description:
        '시트마다 이름·제목(1행 병합)·열·추가 머리행·병합·유효성 목록(드롭다운)·틀고정·인쇄(가로/세로·A4·폭 맞춤·인쇄제목 행)·자료 행을 받아 xlsx 를 만들어 base64 로 돌려준다. 서버에 파일을 남기지 않는다. ' +
        '사양이 잘못되면 만들지 않고 errors 를 돌려준다. 결과는 5MB 까지.',
      inputSchema: { spec: specSchema },
      annotations: REMOTE_MAKE,
    },
    async (a) => {
      if (argsLookLikeRrn({ spec: a.spec })) return fail(RRN_STOP);
      const r = await makeXlsxFromSpec(a.spec);
      if (!r.ok) return text(r);
      const o = encodeRemoteOutput(r.bytes);
      if (!o.ok) return text(o);
      return text({ ok: true, base64: o.base64, outputBytes: r.bytes.length, sheets: a.spec.sheets.map((s) => s.name) });
    },
  );
}
