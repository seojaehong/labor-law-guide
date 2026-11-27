// 조각 1(설계 v2.1 §2-0) — 접두를 아는 원문 판독기.
// .NET 생성기 서식은 SpreadsheetML 부품을 `x:` 접두로 쓰고 BOM 을 붙인다(실서식 안전집 3종).
// 합성 반례만 쓴다 — 실서식은 저장소에 두지 않는다.
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { inspectXlsx } from '@/lib/office/xlsx/inspect';
import { extractXlsxRows } from '@/lib/office/xlsx/extract';
import { spreadsheetPrefix, normalizeSpreadsheetParts } from '@/lib/office/xlsx/ooxml';

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const STRICT = 'http://purl.oclc.org/ooxml/spreadsheetml/main';
const BOM = '﻿';

async function plainTemplate(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('평가표');
  ws.getRow(1).values = ['위험요인', '빈도'];
  ws.getCell('A2').value = '바닥 미끄러짐';
  ws.getCell('B2').value = 2;
  ws.mergeCells('C1:D1');
  (ws as unknown as { dataValidations: { add(range: string, v: unknown): void } }).dataValidations.add('B2:B10', {
    type: 'list',
    allowBlank: true,
    formulae: ['"1,2,3"'],
  });
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** 접두 없는 SpreadsheetML 원소에 x: 를 붙이고 BOM 을 단다(.NET 생성기 모양). */
function toPrefixed(xml: string, ns = MAIN): string {
  const body = xml
    .replace(/<(\/?)([A-Za-z]\w*)(?=[\s/>])/g, '<$1x:$2')
    .replace(`xmlns="${MAIN}"`, `xmlns:x="${ns}"`);
  return BOM + body;
}

async function rewrite(bytes: Uint8Array, names: string[], fn: (xml: string) => string): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes);
  for (const n of names) zip.file(n, fn(await zip.file(n)!.async('string')));
  return new Uint8Array(await zip.generateAsync({ type: 'uint8array' }));
}

const SPREADSHEET_PARTS = ['xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/sharedStrings.xml', 'xl/styles.xml'];

describe('spreadsheetPrefix — 루트에서 주 네임스페이스에 묶인 접두', () => {
  it('기본 네임스페이스면 빈 접두', () => {
    expect(spreadsheetPrefix(`<worksheet xmlns="${MAIN}"><sheetData/></worksheet>`)).toEqual({ ok: true, prefix: '' });
  });
  it('x: 접두와 BOM', () => {
    expect(spreadsheetPrefix(`${BOM}<?xml version="1.0"?><x:worksheet xmlns:x="${MAIN}"/>`)).toEqual({ ok: true, prefix: 'x:' });
  });
  it('Strict 네임스페이스는 거절', () => {
    const r = spreadsheetPrefix(`<worksheet xmlns="${STRICT}"/>`);
    expect(r.ok).toBe(false);
  });
});

describe('normalizeSpreadsheetParts — ExcelJS 2차 판독용 사본', () => {
  it('접두·BOM 을 걷어 내고 원본 Map 은 건드리지 않는다', async () => {
    const enc = new TextEncoder();
    const raw = `${BOM}<x:worksheet xmlns:x="${MAIN}" xmlns:r="urn:r"><x:sheetData><x:row r="1"><x:c r="A1" t="s"><x:v>0</x:v></x:c></x:row></x:sheetData><x:mergeCells count="1"><x:mergeCell ref="A1:B1"/></x:mergeCells></x:worksheet>`;
    const parts = new Map([['xl/worksheets/sheet1.xml', enc.encode(raw)]]);
    const r = normalizeSpreadsheetParts(parts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const out = new TextDecoder('utf-8', { ignoreBOM: true }).decode(r.parts.get('xl/worksheets/sheet1.xml'));
    expect(out).toBe(`<worksheet xmlns="${MAIN}" xmlns:r="urn:r"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData><mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells></worksheet>`);
    expect(r.changed).toEqual(['xl/worksheets/sheet1.xml']);
    expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(parts.get('xl/worksheets/sheet1.xml'))).toBe(raw);
  });
});

describe('x: 접두 서식 열기 (안전집 모양)', () => {
  it('inspect — 시트·병합·유효성을 읽는다', async () => {
    const bytes = await rewrite(await plainTemplate(), SPREADSHEET_PARTS, (x) => toPrefixed(x));
    const r = await inspectXlsx(bytes);
    expect(r.reason).toBeUndefined();
    expect(r.ok).toBe(true);
    expect(r.sheets.map((s) => s.name)).toEqual(['평가표']);
    expect(r.sheets[0].merges).toContain('C1:D1');
    expect(r.sheets[0].validations.map((v) => v.range)).toEqual(['B2:B10']);
  });

  it('extract — 값을 읽는다', async () => {
    const bytes = await rewrite(await plainTemplate(), SPREADSHEET_PARTS, (x) => toPrefixed(x));
    const r = await extractXlsxRows(bytes);
    expect(r.ok).toBe(true);
    expect(r.headers.slice(0, 2)).toEqual(['위험요인', '빈도']);
    expect(r.rows[0].cells['위험요인'].raw).toBe('바닥 미끄러짐');
  });

  it('Strict OOXML 은 UNSUPPORTED_INPUT', async () => {
    const bytes = await rewrite(await plainTemplate(), ['xl/workbook.xml'], (x) => x.replace(`xmlns="${MAIN}"`, `xmlns="${STRICT}"`));
    const r = await inspectXlsx(bytes);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('UNSUPPORTED_INPUT');
    expect(r.reason).toMatch(/Strict/);
  });
});
