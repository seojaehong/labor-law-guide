// k-labor/office 라이브러리 입구(최소판) — Result 모양·한도 주입·PRESERVATION_LOSS·출처. 자료는 모두 합성.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import * as office from '@/lib/office';
import { DEFAULT_LIMITS, ENGINE, OFFICE_OPS, extractPptx, extractXlsxRows, fillXlsxTemplate, inspectXlsx, makeMeetingPptx, makeXlsxFromSpec, type Limits, type Result } from '@/lib/office';

const L = { limits: DEFAULT_LIMITS };

async function book(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('평가표');
  ws.getRow(1).values = ['번호', '위험요인'];
  ws.getCell('A2').value = 1;
  return new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

function shapeOk<T>(r: Result<T>) {
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(r.message);
  expect(Array.isArray(r.warnings)).toBe(true);
  expect(r.meta.engine.name).toBe('k-labor/office');
  return r;
}

describe('k-labor/office — Result 모양', () => {
  it('성공은 {ok,data,files?,warnings,meta}, 실패는 {ok:false,code,message,warnings,meta}', async () => {
    const mk = shapeOk(await makeXlsxFromSpec({ sheets: [{ name: '평가표', columns: [{ key: 'id', header: 'ID' }] }] }, L));
    expect(mk.meta.op).toBe('xlsx.make');
    expect(mk.files).toHaveLength(1);
    const f = mk.files![0];
    expect(f.mime).toContain('spreadsheetml');
    expect(f.size).toBe(f.bytes.length);
    expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
    const ins = shapeOk(await inspectXlsx(f.bytes, L));
    expect(ins.data.sheets[0].name).toBe('평가표');
    expect(ins.files).toBeUndefined();

    const bad = await inspectXlsx(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), L);
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.code).toBe('UNSUPPORTED_INPUT');
    expect(bad.details).toEqual({ needsReview: true });
    expect(typeof bad.message).toBe('string');
    expect(bad.meta.op).toBe('xlsx.inspect');
  });

  it('한도는 호출자가 전부 준다 — 없거나 칸이 빠지면 던지지 않고 INVALID_ARGS', async () => {
    const bytes = await book();
    // @ts-expect-error limits 필수
    const none = await inspectXlsx(bytes, {});
    expect(none.ok ? '' : none.code).toBe('INVALID_ARGS');
    const partial = await inspectXlsx(bytes, { limits: { maxInputBytes: 1e6 } as unknown as Limits });
    expect(partial.ok ? '' : partial.message).toMatch(/maxUnzippedBytes/);
  });

  it('주입한 한도가 실제로 걸린다(입력·출력·작업량)', async () => {
    const bytes = await book();
    const small = await inspectXlsx(bytes, { limits: { ...DEFAULT_LIMITS, maxInputBytes: 100 } });
    expect(small.ok ? '' : small.code).toBe('INPUT_TOO_LARGE');
    const out = await makeXlsxFromSpec({ sheets: [{ name: 's', columns: [{ key: 'a', header: 'A' }] }] }, { limits: { ...DEFAULT_LIMITS, maxOutputBytes: 10 } });
    expect(out.ok ? '' : out.code).toBe('OUTPUT_TOO_LARGE');
    const work = await extractXlsxRows(bytes, { limits: { ...DEFAULT_LIMITS, maxCells: 1 } });
    expect(work.ok ? '' : work.code).toBe('WORKLOAD_TOO_LARGE');
  });

  it('열 숨김 요청도 칸 패치 경로라 주인 없는 차트 부품을 잃지 않는다 — 손실 경고 없음, strict 도 성공(조각 6)', async () => {
    const zip = await JSZip.loadAsync(await book());
    zip.file('xl/charts/chart1.xml', '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"/>');
    const tpl = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    const cells = [{ sheet: '평가표', cell: 'B2', value: '합성' }];
    const hide = { hiddenColumns: [{ sheet: '평가표', columns: ['Z'] }] };
    const loose = shapeOk(await fillXlsxTemplate(tpl, { ...L, cells, ...hide }));
    expect(loose.warnings.find((w) => w.code === 'PRESERVATION_LOSS')).toBeFalsy();
    expect(loose.data.preserved.allSame).toBe(true);
    const strict = await fillXlsxTemplate(tpl, { ...L, cells, ...hide, strict: true });
    expect(strict.ok).toBe(true);
  });

  it('경고는 {code,message,at?} — 병합 종속 칸 경고에 at 이 있다', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('표');
    ws.getRow(1).values = ['a', 'b'];
    ws.mergeCells('A2:B2');
    const r = shapeOk(await fillXlsxTemplate(new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer), { ...L, cells: [{ sheet: '표', cell: 'B2', value: 1 }] }));
    expect(r.warnings).toContainEqual(expect.objectContaining({ code: 'MERGED_CELL_SKIPPED', at: '표!B2' }));
  });

  it('회의 덱 → pptx 읽기, 잘못된 스냅숏은 INVALID_ARGS + details.errors', async () => {
    const snap = {
      site: '합성 사업장', cycle: '1회차', basisDate: '2026-11-20', status: { label: '초안' as const }, scaleId: 's', scaleName: '합성 척도',
      prior: [], hazards: [], photos: [], opinions: [], questions: [], anchors: [],
    };
    const mk = shapeOk(await makeMeetingPptx(snap, { ...L, kind: 'pre' }));
    expect(mk.data.slides[0].code).toBe('P1');
    const ex = shapeOk(await extractPptx(mk.files![0].bytes, L));
    expect(ex.data.slides.length).toBe(mk.data.slides.length);
    const bad = await makeMeetingPptx({ ...snap, site: 1 } as unknown as typeof snap, L);
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.code).toBe('INVALID_ARGS');
    expect((bad.details as { errors: string[] }).errors.join()).toMatch(/site/);
  });

  it('바이트 자리에 다른 것이 오거나 엔진이 던져도 Result 로', async () => {
    const r = await inspectXlsx('not bytes' as unknown as Uint8Array, L);
    expect(r.ok ? '' : r.code).toBe('INVALID_ARGS');
  });

  it('출처는 {name,version,commit,dirty}, op 목록은 고정 이름(별칭 없음)', () => {
    expect(Object.keys(ENGINE).sort()).toEqual(['commit', 'dirty', 'name', 'version']);
    expect(OFFICE_OPS).toEqual(['xlsx.inspect', 'xlsx.extract', 'xlsx.fill', 'xlsx.make', 'pptx.meeting', 'pptx.extract', 'pptx.tbm', 'pptx.broadcast']);
    expect(Object.keys(office).filter((k) => /alias/i.test(k))).toEqual([]);
  });
});

describe('k-labor/office — 의존 경계', () => {
  it('src/lib/office 는 MCP SDK·popbill·tesseract·zod·fs 를 들이지 않는다', () => {
    const dir = path.resolve('src/lib/office');
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(d, e.name));
        else if (/\.ts$/.test(e.name)) files.push(path.join(d, e.name));
      }
    };
    walk(dir);
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      const imports = [...src.matchAll(/^\s*import\s[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1]);
      for (const i of imports) {
        expect(i, `${f}: ${i}`).not.toMatch(/modelcontextprotocol|popbill|tesseract|^zod$|^node:fs|^fs$|^@\//);
      }
    }
  });
});

describe('MCP 도구가 라이브러리 입구를 부른다', () => {
  it('office.mjs 는 엔진 파일이 아니라 @/lib/office 입구만 들인다', () => {
    const src = fs.readFileSync('tools/k-labor/groups/office.mjs', 'utf8');
    expect(src).toMatch(/from '@\/lib\/office'/);
    expect(src).not.toMatch(/from '@\/lib\/office\/(xlsx|pptx)\//);
  });
});
