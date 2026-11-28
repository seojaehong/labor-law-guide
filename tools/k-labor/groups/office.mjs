// 오피스 묶음 — xlsx 서식 검사·행 추출·원본 서식 그대로 채우기·사양(JSON)으로 만들기 + 회의 pptx 만들기·읽기.
//   inspect_xlsx · extract_xlsx_rows · fill_xlsx_template · make_xlsx_from_spec · make_meeting_pptx · extract_pptx · make_tbm_pptx · make_broadcast_pptx · make_education_pptx (+ 원격 …_bytes)
// 엔진 = src/lib/office(바이트 입출력 순수 함수). 이 파일만 경로를 읽고 쓴다.
// ★ stdio 판(server.mjs)은 파일 경로로 받는다. 결과 파일은 writeNew(덮어쓰지 않음).
// ★ 공개 문구 금지어 + 포괄·대신·대행·대리·지도를 이 묶음의 글(설명·결과)에 쓰지 않는다.
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
// 엔진은 라이브러리 입구(k-labor/office) 하나로만 부른다 — SafeClaw·작업자와 같은 함수·같은 Result
import { DEFAULT_LIMITS, DESIGN_IDS, extractPptx, extractXlsxRows, fillXlsxTemplate, inspectXlsx, makeBroadcastPptx, makeEducationPptx, makeMeetingPptx, makeTbmPptx, makeXlsxFromSpec } from '@/lib/office';
import {
  MAX_MCP_BODY_BYTES,
  REMOTE_OFFICE_LIMITS,
  REMOTE_OFFICE_MAX_BASE64_CHARS,
  REMOTE_OFFICE_MAX_INPUT_BYTES,
  REMOTE_OFFICE_MAX_OUTPUT_BYTES,
} from '@/lib/mcp/request-boundary';
import { argsLookLikeRrn, text, writeNew } from '../lib/common.mjs';

/** 파일 경로 입출력 — 이 PC 에서만 */
export const officeLocalOnly = ['inspect_xlsx', 'extract_xlsx_rows', 'fill_xlsx_template', 'make_xlsx_from_spec', 'make_meeting_pptx', 'extract_pptx', 'make_tbm_pptx', 'make_broadcast_pptx', 'make_education_pptx'];
/** base64 입출력 — fs 없음, 원격판(remote.mjs)에 싣는다 */
export const officeRemoteSafe = ['inspect_xlsx_bytes', 'extract_xlsx_rows_bytes', 'fill_xlsx_template_bytes', 'make_xlsx_from_spec_bytes', 'make_meeting_pptx_bytes', 'extract_pptx_bytes', 'make_tbm_pptx_bytes', 'make_broadcast_pptx_bytes', 'make_education_pptx_bytes'];
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

// 회의 PPTX 스냅숏 — 엔진(makeMeetingPptx)이 내용을 검사하므로 여기서는 모양과 크기만 본다
const item = z.record(z.string().max(100), z.any());
const items = (n) => z.array(item).max(n).optional();
const photoSchema = z.object({
  itemId: z.string().max(100),
  side: z.enum(['before', 'after']),
  data: z.string().max(8_000_000).optional().describe('사진 바이트(base64, 데이터 URL 머리 없이)'),
  file: z.string().max(400).optional().describe('사진 파일 경로(로컬 판만, png·jpg)'),
  mime: z.string().max(40).optional(),
});
const snapshotSchema = z
  .object({
    kind: z.enum(['pre', 'final']).optional(),
    site: z.string().max(200),
    cycle: z.string().max(200),
    basisDate: z.string().max(40),
    status: z.object({ label: z.enum(['초안', '확정']), version: z.number().int().min(1).optional() }),
    scaleId: z.string().max(100),
    scaleName: z.string().max(200),
    prior: items(1000),
    hazards: items(1000),
    photos: z.array(photoSchema).max(200).optional(),
    opinions: items(1000),
    questions: items(500),
    decisions: items(500),
    actions: items(1000),
    deferred: items(1000),
    bestPractices: items(100),
    attendees: z.object({ planned: items(200), actual: items(200) }).optional(),
    anchors: items(5000),
  })
  .passthrough()
  .describe('회의 스냅숏(사업장·회차·기준일·상태·척도·전회 항목·위험요인·사진·의견·결정 질문·근거 anchor 등)');
/** 디자인 프리셋(전파·회의·TBM·교안 덱 공용) */
const designOpt = z
  .enum([...DESIGN_IDS])
  .optional()
  .describe('디자인 프리셋 — quiet(고요)·field(현장 게시판)·app(앱 카드)·report(공문 보고서형)·story(전후 흐름). 전 장의 제목 영역·색·부품 배치가 바뀌고 판형 기본이 16:9 가 된다. 미지정이면 기본 먹색 A4');
const meetingOpts = {
  kind: z.enum(['pre', 'final']).optional().describe("pre = 회의 전 검토안(P1~P10), final = 회의 후 확정본(F1~F8). 비우면 snapshot.kind, 없으면 pre"),
  fontFace: z.string().max(60).optional().describe('글꼴(기본 맑은 고딕)'),
  layout: z.enum(['A4', '16:9']).optional().describe('판형(기본 A4 가로, design 을 고르면 기본 16:9)'),
  design: designOpt,
};
/** 로컬(stdio) 판 한도 — 라이브러리 기본값 */
const LOCAL = { limits: DEFAULT_LIMITS };

/** 라이브러리 Result → 도구 JSON. 성공은 data 를 펼치고(파일 바이트는 빼고), 실패는 code·error·details 를 펼친다 */
export function toTool(r) {
  if (r.ok) return { ok: true, ...r.data, warnings: r.warnings, engine: r.meta.engine };
  const d = r.details && typeof r.details === 'object' && !Array.isArray(r.details) ? r.details : {};
  return { ok: false, code: r.code, error: r.message, ...d, ...(d.needsReview ? { reason: r.message, notice: NOT_SUPPORTED } : {}), warnings: r.warnings };
}

/** 덱 만들기(라이브러리). 빈 배열 채우기는 엔진이 한다 */
const runMeeting = (snapshot, a, ctx) => makeMeetingPptx(snapshot, { ...ctx, kind: a.kind, fontFace: a.fontFace, layout: a.layout, design: a.design });
const MEETING_DESC =
  '회의 스냅숏(JSON)으로 위험성평가 회의 덱(pptx, 기본 A4 가로 — design 프리셋을 주고 layout 을 안 주면 16:9)을 만든다. kind pre = 회의 전 검토안(표지·개요·한눈 요약·전회 이행 현황·조치 전후·신규 후보·근로자 의견·회차 대비 변화·결정 필요 사항·근거), ' +
  'final = 회의 후 확정본(표지·참석·확정 결정·조치 계획·보류·우수 사례·다음 회차 이월·근거). 장마다 상태 배지(초안/확정 vN)와 notes 의 근거 anchor 목록을 넣는다. ' +
  '결과에 장 목록(slides)·글자 수로 추정한 넘침 후보(overflowEstimates)·확정본 이월 목록(carryOver, 다음 회차 prior 로 그대로 쓰는 모양)을 돌려준다. 넘침 정밀 확인은 PowerPoint 에서 한다.';

// TBM 카드 스냅숏 — 엔진(makeTbmPptx)이 내용을 검사하므로 여기서는 모양과 크기만 본다
const tbmSnapshotSchema = z
  .object({
    site: z.string().max(200),
    workDate: z.string().max(40),
    basisDate: z.string().max(40),
    cycle: z.string().max(200).optional(),
    revision: z.string().max(100).optional(),
    tasks: z.array(z.object({ id: z.string().max(100), process: z.string().max(300), place: z.string().max(300).optional(), hazards: z.array(item).max(200), questions: z.array(z.string().max(300)).max(10).optional() }).passthrough()).max(100),
    anchors: items(5000),
  })
  .passthrough()
  .describe('TBM 스냅숏(사업장·작업일·기준일 + 작업별 위험요인·대책·확인 질문 + 근거 anchor)');
const tbmOpts = {
  maxHazards: z.number().int().min(1).max(3).optional().describe('장당 위험 개수(1~3, 기본 3)'),
  signatureRows: z.number().int().min(1).max(20).optional().describe('서명란 행 수(1~20, 기본 8)'),
  fontFace: z.string().max(60).optional().describe('글꼴'),
  layout: z.enum(['A4', '16:9']).optional().describe('판형(기본 A4 가로, design 을 고르면 기본 16:9)'),
  design: designOpt,
};
const runTbm = (snapshot, a, ctx) => makeTbmPptx(snapshot, { ...ctx, maxHazards: a.maxHazards, signatureRows: a.signatureRows, fontFace: a.fontFace, layout: a.layout, design: a.design });
const TBM_DESC =
  'TBM 스냅숏(JSON)으로 작업 전 안전점검(TBM) 카드 덱(pptx, 기본 A4 가로 — design 프리셋을 주고 layout 을 안 주면 16:9)을 만든다. 작업마다 한 장 — 오늘 조심할 위험 3개 이내(허용 불가 → 조건부 → 신규·변경 → 중대재해 우려 순)·대책·확인 질문·빈 서명란. ' +
  '문장은 입력 원문 그대로 싣고, 확인 질문이 없으면 빈 줄로 둔다. 결과에 장 목록(slides)·작업별로 실은 것과 뺀 것(picks)·글자 수로 추정한 넘침 후보(overflowEstimates)를 돌려준다.';

const broadcastOpts = {
  signatureRows: z.number().int().min(1).max(30).optional().describe('공유 확인 서명란 행 수(1~30, 기본 12)'),
  fontFace: z.string().max(60).optional().describe('글꼴'),
  layout: z.enum(['A4', '16:9']).optional().describe('판형(기본 A4 가로, design 을 고르면 기본 16:9)'),
  design: z
    .enum([...DESIGN_IDS])
    .optional()
    .describe('디자인 프리셋 — quiet(고요)·field(현장 게시판)·app(앱 카드)·report(공문 보고서형)·story(전후 흐름). 전 장의 제목 영역·색·부품 배치가 바뀌고 판형 기본이 16:9 가 된다. 미지정이면 기본 먹색 A4'),
};
const runBroadcast = (snapshot, a, ctx) => makeBroadcastPptx(snapshot, { ...ctx, signatureRows: a.signatureRows, fontFace: a.fontFace, layout: a.layout, design: a.design });
const BROADCAST_DESC =
  '확정된 회의 스냅숏(make_meeting_pptx 확정본과 같은 입력, status 확정)으로 근로자에게 전하는 회의 결과 전파본(pptx, 기본 A4 가로 — design 프리셋을 주고 layout 을 안 주면 16:9)을 만든다. ' +
  '한눈 요약 · 새로 생기거나 바뀐 위험 · 이번에 정한 대책(담당·기한) · 근로자 의견 처리 결과 · 지난 대책 이행 결과 · 다음으로 미룬 것 · 빈 공유 확인 서명란. ' +
  '문장은 스냅숏 원문 그대로 싣고 초안은 만들지 않는다. 결과에 장 목록(slides)·의견별 처리 결과(opinionResults)·넘침 후보(overflowEstimates)를 돌려준다.';

// 교안 스냅숏 — 엔진(makeEducationPptx)이 내용을 검사하므로 여기서는 모양과 크기만 본다
const educationSnapshotSchema = z
  .object({
    site: z.string().max(200),
    basisDate: z.string().max(40),
    educationDate: z.string().max(40),
    course: z.enum(['regular', 'hire', 'change']),
    cycle: z.string().max(200).optional(),
    hazards: z.array(item).max(1000),
    cases: z.array(item).max(20).optional(),
    quiz: z.array(item).max(20).optional(),
  })
  .passthrough()
  .describe('교안 스냅숏(사업장·기준일·교육일·교육 종류 regular 정기/hire 채용 시/change 작업내용 변경 시 + 위험요인·사고 사례(출처 포함)·확인 문제)');
const educationOpts = {
  topN: z.number().int().min(1).max(12).optional().describe('주요 위험 장에 싣는 개수(1~12, 기본 6)'),
  signatureRows: z.number().int().min(1).max(30).optional().describe('교육 확인 서명부 행 수(1~30, 기본 16)'),
  fontFace: z.string().max(60).optional().describe('글꼴'),
  layout: z.enum(['A4', '16:9']).optional().describe('판형(기본 A4 가로, design 을 고르면 기본 16:9)'),
  design: designOpt,
};
const runEducation = (snapshot, a, ctx) => makeEducationPptx(snapshot, { ...ctx, topN: a.topN, signatureRows: a.signatureRows, fontFace: a.fontFace, layout: a.layout, design: a.design });
const EDUCATION_DESC =
  '위험성평가 결과(위험요인 목록)로 근로자 안전보건교육 교안(pptx, 기본 A4 가로 — design 프리셋을 주고 layout 을 안 주면 16:9)을 만든다 — 산업안전보건법 시행규칙 별표 5 제1호 가목(정기교육)·다목(채용 시·작업내용 변경 시 교육)의 「위험성 평가에 관한 사항」. ' +
  '표지(교육 종류·근거) · 결과 요약(허용 여부별 개수·재해 유형 상위) · 꼭 알아야 할 위험과 대책(TBM 과 같은 순서로 topN) · 사고 사례(입력한 것만, 출처 표시) · 확인 문제(답은 노트에만, 없으면 빈 줄) · 빈 교육 확인 서명부. ' +
  '문장은 입력 원문 그대로 싣는다. 결과에 장 목록(slides)·요약(summary)·실은 것과 뺀 것(shown·omitted)·넘침 후보(overflowEstimates)를 돌려준다.';

/** 입력 파일을 읽는다. 오류면 문자열 */
function readInput(file) {
  const p = String(file ?? '').trim();
  if (!p) return '파일 경로를 주세요.';
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return `파일이 없습니다: ${p}`;
  if (fs.statSync(p).size > MAX_FILE) return '20MB 를 넘는 파일은 받지 않습니다.';
  return { path: p, bytes: new Uint8Array(fs.readFileSync(p)) };
}

/** 결과 파일 경로 검사. 오류면 문자열 */
function checkOut(outFile, src, ext = '.xlsx') {
  const out = String(outFile ?? '').trim();
  if (!out.toLowerCase().endsWith(ext)) return `outFile 은 ${ext} 로 끝나야 합니다.`;
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
      return text({ file: f.path, ...toTool(await inspectXlsx(f.bytes, LOCAL)) });
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
      const r = await extractXlsxRows(f.bytes, { ...LOCAL, sheet: a.sheet, headerRow: a.headerRow, maxRows: a.maxRows });
      return text({ file: f.path, ...toTool(r) });
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
      const r = await fillXlsxTemplate(f.bytes, { ...LOCAL, cells: a.cells, rows: a.rows });
      if (!r.ok) return text(toTool(r));
      const out = r.files[0];
      if (!save(o.out, out.bytes)) return fail(EXISTS, { exists: o.out });
      return text({ ...toTool(r), file: { path: o.out, bytes: out.size, sha256: out.sha256 } });
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
      const r = await makeXlsxFromSpec(a.spec, LOCAL);
      if (!r.ok) return text(toTool(r));
      const out = r.files[0];
      if (!save(o.out, out.bytes)) return fail(EXISTS, { exists: o.out });
      return text({ ...toTool(r), file: { path: o.out, bytes: out.size, sha256: out.sha256 } });
    },
  );

  server.registerTool(
    'make_meeting_pptx',
    {
      title: '회의 덱(pptx) 만들기(로컬 전용)',
      description: `${MEETING_DESC} 사진은 data(base64) 또는 file(경로)로 준다. 이미 있는 파일은 덮어쓰지 않는다.`,
      inputSchema: {
        snapshot: snapshotSchema,
        ...meetingOpts,
        outFile: z.string().max(400).describe('저장할 새 pptx 파일 경로'),
      },
      annotations: WRITES,
    },
    async (a) => {
      if (argsLookLikeRrn({ snapshot: a.snapshot })) return fail(RRN_STOP);
      const o = checkOut(a.outFile, undefined, '.pptx');
      if (typeof o === 'string') return fail(o, o === EXISTS ? { exists: String(a.outFile).trim() } : {});
      const photos = [];
      for (const p of a.snapshot?.photos ?? []) {
        if (p.data || !p.file) {
          photos.push(p);
          continue;
        }
        const f = readInput(p.file);
        if (typeof f === 'string') return fail(`사진 ${p.itemId}: ${f}`);
        const mime = p.mime ?? (/\.jpe?g$/i.test(f.path) ? 'image/jpeg' : 'image/png');
        photos.push({ itemId: p.itemId, side: p.side, mime, data: Buffer.from(f.bytes).toString('base64') });
      }
      const r = await runMeeting({ ...a.snapshot, photos }, a, LOCAL);
      if (!r.ok) return text(toTool(r));
      const out = r.files[0];
      if (!save(o.out, out.bytes)) return fail(EXISTS, { exists: o.out });
      return text({ ...toTool(r), file: { path: o.out, bytes: out.size, sha256: out.sha256 } });
    },
  );

  server.registerTool(
    'make_tbm_pptx',
    {
      title: 'TBM 카드 덱(pptx) 만들기(로컬 전용)',
      description: `${TBM_DESC} 이미 있는 파일은 덮어쓰지 않는다.`,
      inputSchema: { snapshot: tbmSnapshotSchema, ...tbmOpts, outFile: z.string().max(400).describe('저장할 새 pptx 파일 경로') },
      annotations: WRITES,
    },
    async (a) => {
      if (argsLookLikeRrn({ snapshot: a.snapshot })) return fail(RRN_STOP);
      const o = checkOut(a.outFile, undefined, '.pptx');
      if (typeof o === 'string') return fail(o, o === EXISTS ? { exists: String(a.outFile).trim() } : {});
      const r = await runTbm(a.snapshot, a, LOCAL);
      if (!r.ok) return text(toTool(r));
      const out = r.files[0];
      if (!save(o.out, out.bytes)) return fail(EXISTS, { exists: o.out });
      return text({ ...toTool(r), file: { path: o.out, bytes: out.size, sha256: out.sha256 } });
    },
  );

  server.registerTool(
    'make_broadcast_pptx',
    {
      title: '회의 결과 전파본(pptx) 만들기(로컬 전용)',
      description: `${BROADCAST_DESC} 이미 있는 파일은 덮어쓰지 않는다.`,
      inputSchema: { snapshot: snapshotSchema, ...broadcastOpts, outFile: z.string().max(400).describe('저장할 새 pptx 파일 경로') },
      annotations: WRITES,
    },
    async (a) => {
      if (argsLookLikeRrn({ snapshot: a.snapshot })) return fail(RRN_STOP);
      const o = checkOut(a.outFile, undefined, '.pptx');
      if (typeof o === 'string') return fail(o, o === EXISTS ? { exists: String(a.outFile).trim() } : {});
      const r = await runBroadcast(a.snapshot, a, LOCAL);
      if (!r.ok) return text(toTool(r));
      const out = r.files[0];
      if (!save(o.out, out.bytes)) return fail(EXISTS, { exists: o.out });
      return text({ ...toTool(r), file: { path: o.out, bytes: out.size, sha256: out.sha256 } });
    },
  );

  server.registerTool(
    'make_education_pptx',
    {
      title: '위험성평가 교육 교안(pptx) 만들기(로컬 전용)',
      description: `${EDUCATION_DESC} 이미 있는 파일은 덮어쓰지 않는다.`,
      inputSchema: { snapshot: educationSnapshotSchema, ...educationOpts, outFile: z.string().max(400).describe('저장할 새 pptx 파일 경로') },
      annotations: WRITES,
    },
    async (a) => {
      if (argsLookLikeRrn({ snapshot: a.snapshot })) return fail(RRN_STOP);
      const o = checkOut(a.outFile, undefined, '.pptx');
      if (typeof o === 'string') return fail(o, o === EXISTS ? { exists: String(a.outFile).trim() } : {});
      const r = await runEducation(a.snapshot, a, LOCAL);
      if (!r.ok) return text(toTool(r));
      const out = r.files[0];
      if (!save(o.out, out.bytes)) return fail(EXISTS, { exists: o.out });
      return text({ ...toTool(r), file: { path: o.out, bytes: out.size, sha256: out.sha256 } });
    },
  );

  server.registerTool(
    'extract_pptx',
    {
      title: '파워포인트(pptx) 장별 글자·표·notes 읽기(로컬 전용)',
      description:
        'pptx 의 장마다 도형(id·이름·글자)·표(행×칸 글자)·notes(발표자 메모)를 장 순서대로 읽는다. 파일은 고치지 않는다. zip(pptx)이 아니거나 열지 못하면 needsReview:true 와 이유를 돌려준다.',
      inputSchema: { file: z.string().max(400).describe('pptx 파일 경로(20MB 이하)') },
      annotations: READS,
    },
    async (a) => {
      const f = readInput(a.file);
      if (typeof f === 'string') return fail(f);
      return text({ file: f.path, ...toTool(await extractPptx(f.bytes, LOCAL)) });
    },
  );

  registerOfficeRemote(server);
}

// ── 원격(HTTP)판 — base64 입출력. 아래 함수들은 fs·네트워크를 쓰지 않는다(remote.mjs 가 officeRemoteSafe 이름만 통과시킨다).
// ★ 원격 공개 입구(무인증)는 고객 파일 처리 대상이 아니다 — 합성 표본·작은 서식 맛보기용. 한도는 request-boundary.ts 가 단일 출처다(G4 Act on 1).
const REMOTE_READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
// 채우기·만들기도 원격판에서는 서버에 아무것도 남기지 않고 바이트만 돌려준다
const REMOTE_MAKE = { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
const KB = (n) => `${Math.floor(n / 1024)}KB`;
const REMOTE_IN = KB(REMOTE_OFFICE_MAX_INPUT_BYTES);
const REMOTE_OUT = `${REMOTE_OFFICE_MAX_OUTPUT_BYTES / 1024 / 1024}MB`;
/** 원격 도구 설명에 붙는 정책 문구 — 숫자는 request-boundary 상수에서 계산 */
export const REMOTE_POLICY =
  `원격 공개 도구는 고객 파일 처리용이 아니다(합성 표본·작은 서식 맛보기용). 입력 파일은 디코드 후 ${REMOTE_IN}(${REMOTE_OFFICE_MAX_INPUT_BYTES} 바이트)까지로, 요청 본문 상한 ${KB(MAX_MCP_BODY_BYTES)} 에서 계산한 값이다. ` +
  '고객 파일은 로컬 판(stdio) 또는 SafeClaw 작업자 경로로 처리한다.';
const b64In = (what) => z.string().max(REMOTE_OFFICE_MAX_BASE64_CHARS).describe(`${what} 파일 바이트(base64, 디코드 후 ${REMOTE_IN} 이하)`);

/** base64 → 바이트. 크기 검사(원격 정책). zip 실제 해제 상한·작업량은 엔진이 REMOTE_OFFICE_LIMITS 로 본다. 오류면 {ok:false, code, error} */
function decodeRemoteInput(b64) {
  const s = String(b64 ?? '').replace(/\s+/g, '');
  if (!s) return { ok: false, code: 'BAD_BASE64', error: 'base64 를 주세요.' };
  if (s.length % 4 !== 0 || !B64_RE.test(s)) return { ok: false, code: 'BAD_BASE64', error: 'base64 형식이 아닙니다.' };
  if (Math.floor((s.length * 3) / 4) - (s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0) > REMOTE_OFFICE_MAX_INPUT_BYTES)
    return { ok: false, code: 'INPUT_TOO_LARGE', error: `디코드한 입력이 ${REMOTE_OFFICE_MAX_INPUT_BYTES} 바이트(${REMOTE_IN})를 넘습니다. ${REMOTE_POLICY}` };
  return { ok: true, bytes: new Uint8Array(Buffer.from(s, 'base64')) };
}

/** 결과 바이트 → base64. 원격 출력 상한을 넘으면 {ok:false, code:'OUTPUT_TOO_LARGE'} */
export function encodeRemoteOutput(bytes) {
  if (bytes.length > REMOTE_OFFICE_MAX_OUTPUT_BYTES) return { ok: false, code: 'OUTPUT_TOO_LARGE', error: `결과가 ${REMOTE_OFFICE_MAX_OUTPUT_BYTES} 바이트(${REMOTE_OUT})를 넘어 돌려주지 않습니다.`, bytes: bytes.length };
  return { ok: true, base64: Buffer.from(bytes).toString('base64') };
}

/** 원격 한도(request-boundary 단일 출처) */
const REMOTE = { limits: REMOTE_OFFICE_LIMITS };

/** 파일을 내는 원격 도구 — Result → 도구 JSON + base64 */
function remoteOut(r) {
  if (!r.ok) return toTool(r);
  const out = r.files[0];
  const o = encodeRemoteOutput(out.bytes);
  if (!o.ok) return o;
  return { ...toTool(r), base64: o.base64, outputBytes: out.size, sha256: out.sha256 };
}

function registerOfficeRemote(server) {
  server.registerTool(
    'inspect_xlsx_bytes',
    {
      title: '엑셀(xlsx) 서식 구조 보기(base64)',
      description:
        'base64 로 받은 xlsx 의 시트별 크기·병합 범위·수식 칸 수·조건부서식 규칙 수·데이터 유효성 범위·그림 수·인쇄영역·인쇄제목·용지 방향·맞춤과 이름정의를 돌려준다. 서버에 파일을 남기지 않는다. ' +
        `needsReview:true 는 이 엔진이 열지 않은 파일이라는 뜻이다(${NOT_SUPPORTED}) ${REMOTE_POLICY}`,
      inputSchema: { base64: b64In('xlsx') },
      annotations: REMOTE_READ,
    },
    async (a) => {
      const d = decodeRemoteInput(a.base64);
      if (!d.ok) return text(d);
      return text(toTool(await inspectXlsx(d.bytes, REMOTE)));
    },
  );

  server.registerTool(
    'extract_xlsx_rows_bytes',
    {
      title: '엑셀(xlsx) 표 행을 칸 주소와 함께 읽기(base64)',
      description:
        'base64 로 받은 xlsx 의 머리행 아래 행을 머리 이름별로 읽는다. 칸마다 칸 주소(cell)·원문 값(raw, 글자는 숫자로 바꾸지 않음)·수식·저장된 계산값·병합 출처를 붙인다. ' +
        `계산값이 저장되지 않은 수식 칸과 잘린 행은 warnings 에 적는다. ${REMOTE_POLICY}`,
      inputSchema: {
        base64: b64In('xlsx'),
        sheet: z.string().max(100).optional().describe('시트 이름(비우면 첫 시트)'),
        headerRow: z.number().int().min(1).max(1_000_000).optional().describe('머리행 번호(1부터, 기본 1)'),
        maxRows: z.number().int().min(1).max(100_000).optional().describe('읽을 최대 행 수(기본 10000)'),
      },
      annotations: REMOTE_READ,
    },
    async (a) => {
      const d = decodeRemoteInput(a.base64);
      if (!d.ok) return text(d);
      return text(toTool(await extractXlsxRows(d.bytes, { ...REMOTE, sheet: a.sheet, headerRow: a.headerRow, maxRows: a.maxRows })));
    },
  );

  server.registerTool(
    'fill_xlsx_template_bytes',
    {
      title: '엑셀(xlsx) 원본 서식 그대로 칸 채우기(base64)',
      description:
        'base64 로 받은 원본 xlsx 의 지정 칸(cells)과 표 행(rows)만 채워 새 xlsx 를 base64 로 돌려준다. 서버에 파일을 남기지 않는다. ' +
        '수식 칸의 저장된 계산값은 지우고 열 때 다시 계산하게 표시한다(fullCalcOnLoad). preserved 에 서식 항목을 채우기 전후로 비교해 돌려준다. ' +
        `rows 가 템플릿 빈 행보다 많으면 overflow='error'(기본) 는 채우지 않고, 'insertRows' 는 행을 넣고 warnings 를 낸다. 결과는 ${REMOTE_OUT} 까지. ${REMOTE_POLICY}`,
      inputSchema: {
        base64: b64In('xlsx'),
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
      const r = await fillXlsxTemplate(d.bytes, { ...REMOTE, cells: a.cells, rows: a.rows });
      return text(remoteOut(r));
    },
  );

  server.registerTool(
    'make_xlsx_from_spec_bytes',
    {
      title: '사양(JSON)으로 엑셀(xlsx) 서식 만들기(base64)',
      description:
        '시트마다 이름·제목(1행 병합)·열·추가 머리행·병합·유효성 목록(드롭다운)·틀고정·인쇄(가로/세로·A4·폭 맞춤·인쇄제목 행)·자료 행을 받아 xlsx 를 만들어 base64 로 돌려준다. 서버에 파일을 남기지 않는다. ' +
        `사양이 잘못되면 만들지 않고 errors 를 돌려준다. 결과는 ${REMOTE_OUT} 까지.`,
      inputSchema: { spec: specSchema },
      annotations: REMOTE_MAKE,
    },
    async (a) => {
      if (argsLookLikeRrn({ spec: a.spec })) return fail(RRN_STOP);
      return text(remoteOut(await makeXlsxFromSpec(a.spec, REMOTE)));
    },
  );

  server.registerTool(
    'make_meeting_pptx_bytes',
    {
      title: '회의 덱(pptx) 만들기(base64)',
      description: `${MEETING_DESC} 사진은 data(base64)로만 받는다. 결과 pptx 를 base64 로 돌려주고 서버에 파일을 남기지 않는다. 결과는 ${REMOTE_OUT} 까지. 요청 본문은 ${KB(MAX_MCP_BODY_BYTES)} 까지라 사진은 작게 준다.`,
      inputSchema: { snapshot: snapshotSchema, ...meetingOpts },
      annotations: REMOTE_MAKE,
    },
    async (a) => {
      if (argsLookLikeRrn({ snapshot: a.snapshot })) return fail(RRN_STOP);
      if ((a.snapshot?.photos ?? []).some((p) => p.file && !p.data)) return fail('원격판은 사진 경로(file)를 받지 않습니다. data(base64)로 주세요.');
      return text(remoteOut(await runMeeting(a.snapshot, a, REMOTE)));
    },
  );

  server.registerTool(
    'make_tbm_pptx_bytes',
    {
      title: 'TBM 카드 덱(pptx) 만들기(base64)',
      description: `${TBM_DESC} 결과 pptx 를 base64 로 돌려주고 서버에 파일을 남기지 않는다. 결과는 ${REMOTE_OUT} 까지.`,
      inputSchema: { snapshot: tbmSnapshotSchema, ...tbmOpts },
      annotations: REMOTE_MAKE,
    },
    async (a) => {
      if (argsLookLikeRrn({ snapshot: a.snapshot })) return fail(RRN_STOP);
      return text(remoteOut(await runTbm(a.snapshot, a, REMOTE)));
    },
  );

  server.registerTool(
    'make_broadcast_pptx_bytes',
    {
      title: '회의 결과 전파본(pptx) 만들기(base64)',
      description: `${BROADCAST_DESC} 사진은 쓰지 않는다. 결과 pptx 를 base64 로 돌려주고 서버에 파일을 남기지 않는다. 결과는 ${REMOTE_OUT} 까지.`,
      inputSchema: { snapshot: snapshotSchema, ...broadcastOpts },
      annotations: REMOTE_MAKE,
    },
    async (a) => {
      if (argsLookLikeRrn({ snapshot: a.snapshot })) return fail(RRN_STOP);
      return text(remoteOut(await runBroadcast(a.snapshot, a, REMOTE)));
    },
  );

  server.registerTool(
    'make_education_pptx_bytes',
    {
      title: '위험성평가 교육 교안(pptx) 만들기(base64)',
      description: `${EDUCATION_DESC} 결과 pptx 를 base64 로 돌려주고 서버에 파일을 남기지 않는다. 결과는 ${REMOTE_OUT} 까지.`,
      inputSchema: { snapshot: educationSnapshotSchema, ...educationOpts },
      annotations: REMOTE_MAKE,
    },
    async (a) => {
      if (argsLookLikeRrn({ snapshot: a.snapshot })) return fail(RRN_STOP);
      return text(remoteOut(await runEducation(a.snapshot, a, REMOTE)));
    },
  );

  server.registerTool(
    'extract_pptx_bytes',
    {
      title: '파워포인트(pptx) 장별 글자·표·notes 읽기(base64)',
      description:
        'base64 로 받은 pptx 의 장마다 도형(id·이름·글자)·표(행×칸 글자)·notes(발표자 메모)를 장 순서대로 읽는다. 서버에 파일을 남기지 않는다. ' +
        `zip(pptx)이 아니거나 열지 못하면 needsReview:true 와 이유를 돌려준다. ${REMOTE_POLICY}`,
      inputSchema: { base64: b64In('pptx') },
      annotations: REMOTE_READ,
    },
    async (a) => {
      const d = decodeRemoteInput(a.base64);
      if (!d.ok) return text(d);
      return text(toTool(await extractPptx(d.bytes, REMOTE)));
    },
  );
}
