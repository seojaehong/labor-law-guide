// XLSX 템플릿 구조 검사 — 바이트 입력, fs·네트워크 없음.
// 채우기 전후 보존 비교의 기준이 된다(병합·수식·조건부서식·유효성·인쇄설정·그림·이름정의).
// 지원하지 않는 입력(.xls·깨진 zip·ExcelJS 가 못 여는 파일)은 예외 대신 needsReview 로 돌린다.
import ExcelJS from 'exceljs';
import { DEFAULT_LIMITS, readZipGuarded, type Limits } from '../limits';
import { scanXlsxWorkload, type Workload } from './workload';

/** 엔진 실패 코드(라이브러리 입구 ErrorCode 의 일부) */
export type OpenFailCode = 'UNSUPPORTED_INPUT' | 'INPUT_TOO_LARGE' | 'ZIP_TOO_LARGE' | 'WORKLOAD_TOO_LARGE';

export interface XlsxValidation {
  range: string;
  type: string;
  list?: string[];
  formula1?: string;
}

export interface XlsxSheetInfo {
  name: string;
  dims: string;
  merges: string[];
  formulaCells: number;
  conditionalRules: number;
  validations: XlsxValidation[];
  images: number;
  printArea?: string;
  printTitles?: string;
  orientation?: 'landscape' | 'portrait';
  paper?: string;
  fitToWidth?: number;
  /** 틀고정: 고정되지 않은 첫 칸 주소(예 'B3') */
  freeze?: string;
}

export interface XlsxInputCandidate {
  sheet: string;
  range: string;
  reason: 'validation';
}

export interface InspectXlsxResult {
  ok: boolean;
  needsReview?: boolean;
  reason?: string;
  code?: OpenFailCode;
  sheets: XlsxSheetInfo[];
  definedNames: { name: string; ranges: string[] }[];
  inputCandidates: XlsxInputCandidate[];
}

const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

const PAPER_NAMES: Record<number, string> = { 1: 'Letter', 8: 'A3', 9: 'A4', 11: 'A5' };

function review(reason: string, code: OpenFailCode = 'UNSUPPORTED_INPUT'): InspectXlsxResult {
  return { ok: false, ...(code === 'UNSUPPORTED_INPUT' ? { needsReview: true } : {}), code, reason, sheets: [], definedNames: [], inputCandidates: [] };
}

/** 1 → 'A', 27 → 'AA' */
export function colLetter(n: number): string {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

function decodeXml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = decodeXml(m[2]);
  return out;
}

const utf8 = new TextDecoder('utf-8');
const partText = (parts: Map<string, Uint8Array>, name: string): string | undefined => {
  const b = parts.get(name);
  return b ? utf8.decode(b) : undefined;
};

/** 시트 이름 → zip 안의 시트 XML 경로 */
function sheetPaths(parts: Map<string, Uint8Array>): Map<string, string> {
  const map = new Map<string, string>();
  const wbXml = partText(parts, 'xl/workbook.xml');
  const relXml = partText(parts, 'xl/_rels/workbook.xml.rels');
  if (!wbXml || !relXml) return map;
  const targets = new Map<string, string>();
  for (const m of relXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const a = attrs(m[0]);
    if (a.Id && a.Target) targets.set(a.Id, a.Target);
  }
  for (const m of wbXml.matchAll(/<sheet\b[^>]*>/g)) {
    const a = attrs(m[0]);
    const target = targets.get(a['r:id'] ?? '');
    if (!a.name || !target) continue;
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    map.set(a.name, path);
  }
  return map;
}

/** 시트 XML 의 dataValidation 을 sqref 범위 그대로 읽는다(ExcelJS 는 불러올 때 칸 단위로 풀어 버린다). */
function readValidations(sheetXml: string): XlsxValidation[] {
  const out: XlsxValidation[] = [];
  for (const m of sheetXml.matchAll(/<dataValidation\b([^>]*?)(?:\/>|>([\s\S]*?)<\/dataValidation>)/g)) {
    const a = attrs(m[1]);
    if (!a.sqref) continue;
    const body = m[2] ?? '';
    const f1 = body.match(/<formula1>([\s\S]*?)<\/formula1>/);
    const v: XlsxValidation = { range: a.sqref, type: a.type ?? 'any' };
    if (f1) {
      const formula1 = decodeXml(f1[1]);
      v.formula1 = formula1;
      if (v.type === 'list' && /^".*"$/.test(formula1)) v.list = formula1.slice(1, -1).split(',');
    }
    out.push(v);
  }
  return out;
}

export type OpenedXlsx = { wb: ExcelJS.Workbook; parts: Map<string, Uint8Array>; workload: Workload };

/**
 * 지원 형식 확인 후 xlsx 를 연다. 지원하지 않거나 열 수 없으면 { reason, code } 만 돌린다(예외 없음).
 * ExcelJS 에 넘기기 전에 ①입력 크기 ②zip 실제 해제 누적 상한 ③시트 XML 작업량 사전 스캔을 거친다.
 * inspect·extract·fill 이 같은 판정을 쓰도록 한곳에 둔다.
 * @internal
 */
export async function openXlsx(bytes: Uint8Array, limits: Limits = DEFAULT_LIMITS): Promise<OpenedXlsx | { reason: string; code: OpenFailCode }> {
  const unsupported = (reason: string) => ({ reason, code: 'UNSUPPORTED_INPUT' as const });
  if (!bytes || bytes.length === 0) return unsupported('입력이 비어 있습니다.');
  if (bytes.length > limits.maxInputBytes) return { reason: `입력이 ${limits.maxInputBytes} 바이트를 넘습니다.`, code: 'INPUT_TOO_LARGE' };
  if (bytes.length >= 8 && OLE_SIGNATURE.every((b, i) => bytes[i] === b)) {
    return unsupported('.xls(BIFF)·암호화 문서(OLE 컨테이너)는 지원하지 않습니다. xlsx 로 저장해 주세요.');
  }
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return unsupported('xlsx(zip) 형식이 아닙니다.');

  const z = readZipGuarded(bytes, limits);
  if (!z.ok) return z.code === 'ZIP_TOO_LARGE' ? { reason: z.message, code: 'ZIP_TOO_LARGE' } : unsupported(`zip 을 열 수 없습니다: ${z.message}`);
  const parts = z.parts;
  if (!parts.has('xl/workbook.xml')) return unsupported('xl/workbook.xml 이 없습니다(xlsx 가 아님).');
  if (parts.has('xl/vbaProject.bin')) return unsupported('매크로(xlsm)가 든 문서는 지원하지 않습니다.');
  const scan = scanXlsxWorkload(parts, limits.maxCells);
  if (!scan.ok) return scan.code === 'WORKLOAD_TOO_LARGE' ? { reason: scan.message, code: 'WORKLOAD_TOO_LARGE' } : unsupported(scan.message);

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  } catch (e) {
    return unsupported(`ExcelJS 가 문서를 열지 못했습니다: ${(e as Error).message}`);
  }
  return { wb, parts, workload: scan.workload };
}

export async function inspectXlsx(bytes: Uint8Array, limits: Limits = DEFAULT_LIMITS): Promise<InspectXlsxResult> {
  const opened = await openXlsx(bytes, limits);
  if ('reason' in opened) return review(opened.reason, opened.code);
  return inspectOpened(opened);
}

/** @internal 이미 연 문서를 검사한다(fill 이 같은 바이트를 두 번 열지 않게) */
export function inspectOpened(opened: OpenedXlsx): InspectXlsxResult {
  const { wb, parts } = opened;
  const paths = sheetPaths(parts);
  const sheets: XlsxSheetInfo[] = [];
  const inputCandidates: XlsxInputCandidate[] = [];

  for (const ws of wb.worksheets) {
    let formulaCells = 0;
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (cell.type === ExcelJS.ValueType.Formula) formulaCells++;
      });
    });
    const model = ws.model as unknown as { merges?: string[] };
    const cfs = (ws as unknown as { conditionalFormattings?: { rules?: unknown[] }[] }).conditionalFormattings ?? [];
    const path = paths.get(ws.name);
    const sheetXml = path ? partText(parts, path) : undefined;
    const validations = sheetXml ? readValidations(sheetXml) : [];
    const ps = ws.pageSetup ?? {};
    const dims = ws.actualRowCount > 0 ? ws.dimensions.range : '';

    const info: XlsxSheetInfo = {
      name: ws.name,
      dims,
      merges: [...(model.merges ?? [])],
      formulaCells,
      conditionalRules: cfs.reduce((n, cf) => n + (cf.rules?.length ?? 0), 0),
      validations,
      images: ws.getImages().length,
    };
    if (ps.printArea) info.printArea = ps.printArea;
    if (ps.printTitlesRow) info.printTitles = ps.printTitlesRow;
    if (ps.orientation) info.orientation = ps.orientation;
    if (ps.paperSize !== undefined) info.paper = PAPER_NAMES[ps.paperSize] ?? String(ps.paperSize);
    if (ps.fitToPage && ps.fitToWidth !== undefined) info.fitToWidth = ps.fitToWidth;
    const frozen = (ws.views ?? []).find((v) => v.state === 'frozen') as { xSplit?: number; ySplit?: number } | undefined;
    if (frozen && ((frozen.xSplit ?? 0) > 0 || (frozen.ySplit ?? 0) > 0)) {
      info.freeze = `${colLetter((frozen.xSplit ?? 0) + 1)}${(frozen.ySplit ?? 0) + 1}`;
    }
    sheets.push(info);
    for (const v of validations) inputCandidates.push({ sheet: ws.name, range: v.range, reason: 'validation' });
  }

  const definedNames = (wb.definedNames.model as { name: string; ranges: string[] }[]).map((d) => ({
    name: d.name,
    ranges: [...d.ranges],
  }));

  return { ok: true, sheets, definedNames, inputCandidates };
}
