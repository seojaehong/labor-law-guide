// k-labor office 묶음(stdio) — XLSX 도구 4개를 가짜 서버에 걸고 부른다. 값은 모두 합성.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { officeTools, registerOffice } from '../../tools/k-labor/groups/office.mjs';

type Handler = (a: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
type Cfg = { title?: string; annotations?: Record<string, boolean> };
const tools = new Map<string, Handler>();
const cfgs = new Map<string, Cfg>();
registerOffice({
  registerTool(name: string, cfg: Cfg, handler: Handler) {
    tools.set(name, handler);
    cfgs.set(name, cfg);
  },
});
const call = async (n: string, a: Record<string, unknown>) => JSON.parse((await tools.get(n)!(a)).content[0].text);

const SPEC = {
  sheets: [
    {
      name: '평가표',
      title: '가상 평가표',
      columns: [
        { key: 'id', header: '번호', width: 8 },
        { key: 'hazard', header: '위험요인', width: 30 },
        { key: 'grade', header: '등급', width: 12 },
      ],
      validations: [{ range: 'C3:C20', list: ['낮음', '보통', '높음'] }],
      freeze: 'A3',
      print: { orientation: 'landscape', paper: 'A4', fitToWidth: 1, printTitlesRows: '2:2' },
    },
  ],
};

const withDir = async (fn: (dir: string) => Promise<void>) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'k-labor-office-'));
  try {
    await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

describe('office 묶음 — 등록', () => {
  it('XLSX 도구 4개가 officeTools 와 같고 title·annotations 를 단다', () => {
    expect([...tools.keys()].sort()).toEqual([...officeTools].sort());
    expect(officeTools).toEqual(expect.arrayContaining(['inspect_xlsx', 'extract_xlsx_rows', 'fill_xlsx_template', 'make_xlsx_from_spec']));
    for (const n of officeTools) {
      const c = cfgs.get(n)!;
      expect(c.title).toBeTruthy();
      for (const k of ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint']) expect(typeof c.annotations?.[k]).toBe('boolean');
    }
    expect(cfgs.get('inspect_xlsx')!.annotations!.readOnlyHint).toBe(true);
    expect(cfgs.get('make_xlsx_from_spec')!.annotations!.readOnlyHint).toBe(false);
  });
});

describe('office 묶음 — make → inspect → fill → extract', () => {
  it('사양으로 만든 파일을 검사·채우기·추출한다', () =>
    withDir(async (dir) => {
      const out = path.join(dir, '서식.xlsx');
      const mk = await call('make_xlsx_from_spec', { spec: SPEC, outFile: out });
      expect(mk.ok).toBe(true);
      expect(mk.file.path).toBe(out);
      expect(fs.readFileSync(out).subarray(0, 2).toString('latin1')).toBe('PK');

      const ins = await call('inspect_xlsx', { file: out });
      expect(ins.ok).toBe(true);
      expect(ins.sheets[0].name).toBe('평가표');
      expect(ins.sheets[0].orientation).toBe('landscape');

      const filled = path.join(dir, '채움.xlsx');
      const fl = await call('fill_xlsx_template', {
        file: out,
        outFile: filled,
        rows: { sheet: '평가표', startRow: 3, columns: { A: 'id', B: 'hazard', C: 'grade' }, data: [{ id: 'H1', hazard: '바닥 물기', grade: '높음 (6)' }] },
      });
      expect(fl.ok).toBe(true);
      expect(fl.preserved.allSame).toBe(true);
      expect(fl.fullCalcOnLoad).toBe(true);
      expect(fl.bytes).toBeUndefined();
      expect(fs.existsSync(filled)).toBe(true);

      const ex = await call('extract_xlsx_rows', { file: filled, sheet: '평가표', headerRow: 2 });
      expect(ex.ok).toBe(true);
      expect(ex.rows[0].cells['등급'].raw).toBe('높음 (6)');
    }));
});

describe('office 묶음 — writeNew 거부', () => {
  it('이미 있는 파일에는 make 가 쓰지 않는다', () =>
    withDir(async (dir) => {
      const out = path.join(dir, '있음.xlsx');
      fs.writeFileSync(out, 'old');
      const r = await call('make_xlsx_from_spec', { spec: SPEC, outFile: out });
      expect(r.ok).toBe(false);
      expect(fs.readFileSync(out, 'utf8')).toBe('old');
    }));
  it('fill 은 원본 경로와 이미 있는 파일에 쓰지 않는다', () =>
    withDir(async (dir) => {
      const src = path.join(dir, '원본.xlsx');
      await call('make_xlsx_from_spec', { spec: SPEC, outFile: src });
      const before = fs.readFileSync(src);
      const same = await call('fill_xlsx_template', { file: src, outFile: src, cells: [{ sheet: '평가표', cell: 'B3', value: 'x' }] });
      expect(same.ok).toBe(false);
      const taken = path.join(dir, '있음.xlsx');
      fs.writeFileSync(taken, 'old');
      const ex = await call('fill_xlsx_template', { file: src, outFile: taken, cells: [{ sheet: '평가표', cell: 'B3', value: 'x' }] });
      expect(ex.ok).toBe(false);
      expect(fs.readFileSync(taken, 'utf8')).toBe('old');
      expect(fs.readFileSync(src).equals(before)).toBe(true);
    }));
});

describe('office 묶음 — 주민번호 모양 거부', () => {
  it('make 사양 rows 에 있으면 파일을 만들지 않는다', () =>
    withDir(async (dir) => {
      const out = path.join(dir, 'rrn.xlsx');
      const spec = { sheets: [{ ...SPEC.sheets[0], rows: [{ id: '1', hazard: '900304-1234567', grade: '낮음' }] }] };
      const r = await call('make_xlsx_from_spec', { spec, outFile: out });
      expect(r.ok).toBe(false);
      expect(fs.existsSync(out)).toBe(false);
    }));
  it('fill cells 에 있으면 파일을 만들지 않는다', () =>
    withDir(async (dir) => {
      const src = path.join(dir, '원본.xlsx');
      await call('make_xlsx_from_spec', { spec: SPEC, outFile: src });
      const out = path.join(dir, 'rrn.xlsx');
      const r = await call('fill_xlsx_template', { file: src, outFile: out, cells: [{ sheet: '평가표', cell: 'B3', value: '9003041234567' }] });
      expect(r.ok).toBe(false);
      expect(fs.existsSync(out)).toBe(false);
    }));
});

describe('office 묶음 — 입력 오류', () => {
  it('없는 파일·.xls 바이트는 예외 없이 구조화 결과', () =>
    withDir(async (dir) => {
      const miss = await call('inspect_xlsx', { file: path.join(dir, '없음.xlsx') });
      expect(miss.ok).toBe(false);
      const xls = path.join(dir, '옛.xls');
      fs.writeFileSync(xls, Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]));
      const r = await call('inspect_xlsx', { file: xls });
      expect(r.ok).toBe(false);
      expect(r.needsReview).toBe(true);
    }));
  it('잘못된 사양은 errors 를 돌리고 파일을 만들지 않는다', () =>
    withDir(async (dir) => {
      const out = path.join(dir, 'bad.xlsx');
      const r = await call('make_xlsx_from_spec', { spec: { sheets: [{ name: '', columns: [] }] }, outFile: out });
      expect(r.ok).toBe(false);
      expect(r.errors.length).toBeGreaterThan(0);
      expect(fs.existsSync(out)).toBe(false);
    }));
});
