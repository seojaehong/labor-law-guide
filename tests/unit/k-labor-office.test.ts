// k-labor office 묶음(stdio) — XLSX 도구 4개를 가짜 서버에 걸고 부른다. 값은 모두 합성.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { encodeRemoteOutput, officeLocalOnly, officeRemoteSafe, officeTools, registerOffice } from '../../tools/k-labor/groups/office.mjs';
import { REMOTE_OFFICE_LIMITS, REMOTE_OFFICE_MAX_INPUT_BYTES as MAX_REMOTE_INPUT_BYTES, REMOTE_OFFICE_MAX_OUTPUT_BYTES as MAX_REMOTE_OUTPUT_BYTES } from '@/lib/mcp/request-boundary';
const MAX_REMOTE_UNZIPPED_BYTES = REMOTE_OFFICE_LIMITS.maxUnzippedBytes;

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
  it('도구 전부가 officeTools 와 같고 title·annotations 를 단다', () => {
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
      // 조각 6(좁힌 C, §2-6)에서 「수식이 있고 캐시를 지웠을 때만 true」 단언으로 되살린다
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

// ── 원격(base64) 판 — fs 를 쓰지 않는 …_bytes 도구 ──
describe('office 원격판 — base64 입출력', () => {
  const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');

  it('officeRemoteSafe 9개가 등록되고 title·readOnlyHint true', () => {
    expect([...officeRemoteSafe].sort()).toEqual(['extract_pptx_bytes', 'extract_xlsx_rows_bytes', 'fill_xlsx_template_bytes', 'inspect_xlsx_bytes', 'make_broadcast_pptx_bytes', 'make_education_pptx_bytes', 'make_meeting_pptx_bytes', 'make_tbm_pptx_bytes', 'make_xlsx_from_spec_bytes']);
    for (const n of officeRemoteSafe) {
      expect(tools.has(n), n).toBe(true);
      expect(cfgs.get(n)!.title, n).toBeTruthy();
      expect(cfgs.get(n)!.annotations!.readOnlyHint, n).toBe(true);
      expect(cfgs.get(n)!.annotations!.destructiveHint, n).toBe(false);
    }
    for (const n of officeLocalOnly) expect(officeRemoteSafe).not.toContain(n);
  });

  it('make → inspect → fill → extract 를 base64 로 돈다(파일 없이)', async () => {
    const mk = await call('make_xlsx_from_spec_bytes', { spec: SPEC });
    expect(mk.ok).toBe(true);
    expect(Buffer.from(mk.base64, 'base64').subarray(0, 2).toString('latin1')).toBe('PK');
    const ins = await call('inspect_xlsx_bytes', { base64: mk.base64 });
    expect(ins.ok).toBe(true);
    expect(ins.sheets[0].orientation).toBe('landscape');
    const fl = await call('fill_xlsx_template_bytes', {
      base64: mk.base64,
      rows: { sheet: '평가표', startRow: 3, columns: { A: 'id', B: 'hazard', C: 'grade' }, data: [{ id: 'H1', hazard: '바닥 물기', grade: '높음 (6)' }] },
    });
    expect(fl.ok).toBe(true);
    expect(fl.bytes).toBeUndefined();
    expect(fl.preserved.allSame).toBe(true);
    const ex = await call('extract_xlsx_rows_bytes', { base64: fl.base64, sheet: '평가표', headerRow: 2 });
    expect(ex.rows[0].cells['등급'].raw).toBe('높음 (6)');
  });

  it('디코드 5MB 초과 입력은 구조화 오류', async () => {
    const r = await call('inspect_xlsx_bytes', { base64: b64(new Uint8Array(MAX_REMOTE_INPUT_BYTES + 1)) });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('INPUT_TOO_LARGE');
  });

  it('base64 가 아닌 글자는 구조화 오류', async () => {
    const r = await call('inspect_xlsx_bytes', { base64: '이건 base64 가 아님!' });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('BAD_BASE64');
  });

  it('zip 폭탄(풀면 50MB 초과)은 열지 않고 구조화 오류', async () => {
    const zip = new JSZip();
    zip.file('xl/workbook.xml', '<workbook/>');
    zip.file('xl/bomb.bin', new Uint8Array(MAX_REMOTE_UNZIPPED_BYTES + 1024));
    const bomb = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 9 } });
    expect(bomb.length).toBeLessThan(MAX_REMOTE_INPUT_BYTES);
    for (const [n, extra] of [['inspect_xlsx_bytes', {}], ['extract_xlsx_rows_bytes', {}], ['fill_xlsx_template_bytes', { cells: [{ sheet: 'a', cell: 'A1', value: 1 }] }]] as const) {
      const r = await call(n, { base64: b64(bomb), ...extra });
      expect(r.ok, n).toBe(false);
      expect(r.code, n).toBe('ZIP_TOO_LARGE');
    }
  }, 60_000);

  it('출력이 5MB 를 넘으면 base64 를 돌리지 않는다', () => {
    expect(encodeRemoteOutput(new Uint8Array(10))).toEqual({ ok: true, base64: b64(new Uint8Array(10)) });
    const over = encodeRemoteOutput(new Uint8Array(MAX_REMOTE_OUTPUT_BYTES + 1));
    expect(over.ok).toBe(false);
    expect(over.code).toBe('OUTPUT_TOO_LARGE');
  });

  it('원격 fill·make 도 주민번호 모양을 거부한다', async () => {
    const spec = { sheets: [{ ...SPEC.sheets[0], rows: [{ id: '1', hazard: '900304-1234567', grade: '낮음' }] }] };
    const r = await call('make_xlsx_from_spec_bytes', { spec });
    expect(r.ok).toBe(false);
    expect(r.base64).toBeUndefined();
  });

  it('원격 등록 함수 소스에 fs 호출이 없다', () => {
    const src = fs.readFileSync('tools/k-labor/groups/office.mjs', 'utf8');
    const start = src.indexOf('function registerOfficeRemote');
    expect(start).toBeGreaterThan(0);
    const body = src.slice(start);
    expect(body).not.toMatch(/\bfs\.|readInput|checkOut|save\(|writeNew/);
  });
});

// ── 회의 PPTX — stdio(경로)·원격(base64) ──
const MEETING = {
  kind: 'pre',
  site: '합성 사업장',
  cycle: '2026년 1회차',
  basisDate: '2026-11-20',
  status: { label: '초안' },
  scaleId: 'scale-v1',
  scaleName: '빈도×강도 3×3',
  prior: [{ id: 'R-01', hazard: '합성 위험요인', status: '완료', scaleId: 'scale-v1', frequency: 1, severity: 2, anchors: ['A-1'] }],
  hazards: [{ id: 'R-01', situation: '상황', cause: '원인', consequence: '결과', frequency: 1, severity: 1, anchors: ['A-1'] }],
  photos: [],
  opinions: [],
  questions: [],
  anchors: [{ id: 'A-1', source: '합성 평가표', location: '시트1!B5' }],
};

describe('office 묶음 — 회의 PPTX', () => {
  it('PPTX 도구 4개가 등록되고 원격판 둘은 readOnlyHint true', () => {
    for (const n of ['make_meeting_pptx', 'extract_pptx']) {
      expect(officeLocalOnly, n).toContain(n);
      expect(tools.has(n), n).toBe(true);
    }
    for (const n of ['make_meeting_pptx_bytes', 'extract_pptx_bytes']) {
      expect(officeRemoteSafe, n).toContain(n);
      expect(cfgs.get(n)!.title, n).toBeTruthy();
      expect(cfgs.get(n)!.annotations!.readOnlyHint, n).toBe(true);
    }
    expect(cfgs.get('extract_pptx')!.annotations!.readOnlyHint).toBe(true);
    expect(cfgs.get('make_meeting_pptx')!.annotations!.readOnlyHint).toBe(false);
  });

  it('stdio make_meeting_pptx → extract_pptx, 같은 이름은 덮어쓰지 않는다', () =>
    withDir(async (dir) => {
      const out = path.join(dir, '회의.pptx');
      const mk = await call('make_meeting_pptx', { snapshot: MEETING, outFile: out });
      expect(mk.ok).toBe(true);
      expect(mk.bytes).toBeUndefined();
      expect(mk.file.path).toBe(out);
      expect(mk.slides[0].code).toBe('P1');
      expect(fs.readFileSync(out).subarray(0, 2).toString('latin1')).toBe('PK');
      const ex = await call('extract_pptx', { file: out });
      expect(ex.ok).toBe(true);
      expect(ex.slides[0].shapes.find((s: { name: string }) => s.name === 'badge').text).toBe('초안');
      const again = await call('make_meeting_pptx', { snapshot: MEETING, outFile: out });
      expect(again.ok).toBe(false);
      const xlsx = await call('make_meeting_pptx', { snapshot: MEETING, outFile: path.join(dir, 'x.xlsx') });
      expect(xlsx.ok).toBe(false);
    }));

  it('주민번호 모양이 있으면 덱을 만들지 않는다', () =>
    withDir(async (dir) => {
      const out = path.join(dir, 'rrn.pptx');
      const r = await call('make_meeting_pptx', { snapshot: { ...MEETING, site: '900304-1234567' }, outFile: out });
      expect(r.ok).toBe(false);
      expect(fs.existsSync(out)).toBe(false);
      const rb = await call('make_meeting_pptx_bytes', { snapshot: { ...MEETING, site: '900304-1234567' } });
      expect(rb.ok).toBe(false);
      expect(rb.base64).toBeUndefined();
    }));

  it('원격 make_tbm_pptx_bytes — 작업별 카드, 실은 것·뺀 것(picks), 주민번호 모양은 멈춘다', async () => {
    const TBM = {
      site: '합성 사업장', workDate: '2026-12-02', basisDate: '2026-12-01',
      tasks: [{ id: 'T-1', process: '합성 작업', hazards: [
        { id: 'H-1', situation: '합성 위험 1', measures: ['대책 1'], acceptability: 'acceptable' },
        { id: 'H-2', situation: '합성 위험 2', measures: ['대책 2'], acceptability: 'unacceptable' },
      ] }],
    };
    const mk = await call('make_tbm_pptx_bytes', { snapshot: TBM, maxHazards: 1 });
    expect(mk.ok).toBe(true);
    expect(Buffer.from(mk.base64, 'base64').subarray(0, 2).toString('latin1')).toBe('PK');
    expect(mk.picks).toEqual([{ taskId: 'T-1', shown: ['H-2'], omitted: ['H-1'] }]);
    const rr = await call('make_tbm_pptx_bytes', { snapshot: { ...TBM, site: '900304-1234567' } });
    expect(rr.ok).toBe(false);
    expect(officeLocalOnly).toContain('make_tbm_pptx');
    expect(cfgs.get('make_tbm_pptx')!.annotations!.readOnlyHint).toBe(false);
  });

  it('원격 make_broadcast_pptx_bytes — 확정 스냅숏만, 7장', async () => {
    const FIN = { ...MEETING, kind: 'final', status: { label: '확정', version: 1 } };
    const mk = await call('make_broadcast_pptx_bytes', { snapshot: FIN });
    expect(mk.ok).toBe(true);
    expect(mk.slides.map((s: { code: string }) => s.code)).toEqual(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7']);
    const draft = await call('make_broadcast_pptx_bytes', { snapshot: { ...MEETING, status: { label: '초안' } } });
    expect(draft.ok).toBe(false);
    expect(cfgs.get('make_broadcast_pptx')!.annotations!.readOnlyHint).toBe(false);
    const designed = await call('make_broadcast_pptx_bytes', { snapshot: FIN, design: 'report' });
    expect(designed.ok).toBe(true);
    const zip = await JSZip.loadAsync(Buffer.from(designed.base64, 'base64'));
    expect(await zip.file('ppt/slides/slide1.xml')!.async('string')).toContain('name="part:summary-table"');
  });

  it('원격 회의·TBM·교안 bytes 도구 — design 을 넘기면 프리셋 머리(field 왼쪽 띠)·16:9, 없는 이름은 입력 오류', async () => {
    const TBM = { site: '합성', workDate: '2026-12-02', basisDate: '2026-12-01', tasks: [{ id: 'T-1', process: '합성 작업', hazards: [{ id: 'H-1', situation: '합성 위험', measures: ['대책'] }] }] };
    const ED = { site: '합성', basisDate: '2026-11-20', educationDate: '2026-12-01', course: 'regular', hazards: [{ id: 'H-1', situation: '합성 위험', measures: ['합성 대책'] }] };
    const FIN = { ...MEETING, kind: 'final', status: { label: '확정', version: 1 } };
    for (const [tool, snapshot, extra] of [
      ['make_meeting_pptx_bytes', MEETING, { kind: 'pre' }],
      ['make_meeting_pptx_bytes', FIN, { kind: 'final' }],
      ['make_tbm_pptx_bytes', TBM, {}],
      ['make_education_pptx_bytes', ED, {}],
    ] as const) {
      const r = await call(tool, { snapshot, ...extra, design: 'field' });
      expect(r.ok, `${tool} ${JSON.stringify(r).slice(0, 300)}`).toBe(true);
      const zip = await JSZip.loadAsync(Buffer.from(r.base64, 'base64'));
      expect(await zip.file('ppt/presentation.xml')!.async('string'), tool).toMatch(/<p:sldSz cx="12192000" cy="6858000"/);
      expect(await zip.file('ppt/slides/slide1.xml')!.async('string'), tool).toContain('name="head:left-band"');
      const bad = await call(tool, { snapshot, ...extra, design: 'neon' });
      expect(bad.ok, tool).toBe(false);
    }
  });

  it('회의·TBM·교안 도구 설명도 design 을 주면 16:9 임을 말한다', () => {
    for (const n of ['make_meeting_pptx', 'make_meeting_pptx_bytes', 'make_tbm_pptx', 'make_tbm_pptx_bytes', 'make_education_pptx', 'make_education_pptx_bytes']) {
      const d = (cfgs.get(n) as { description: string }).description;
      expect(d, n).toMatch(/design[^.]*16:9/);
    }
  });

  it('전파본 도구 설명은 design 을 주면 16:9 임을 말한다(「기본 A4 가로」만 말하지 않음)', () => {
    for (const n of ['make_broadcast_pptx', 'make_broadcast_pptx_bytes']) {
      const d = (cfgs.get(n) as { description: string }).description;
      expect(d, n).toMatch(/design[^.]*16:9/);
    }
  });

  it('원격 make_education_pptx_bytes — 정기교육 교안, 입력 오류는 ok false', async () => {
    const ED = { site: '합성', basisDate: '2026-11-20', educationDate: '2026-12-01', course: 'regular', hazards: [{ id: 'H-1', situation: '합성 위험', measures: ['합성 대책'] }], quiz: [{ question: '합성 질문' }] };
    const mk = await call('make_education_pptx_bytes', { snapshot: ED });
    expect(mk.ok).toBe(true);
    expect(mk.slides.map((s: { code: string }) => s.code)).toEqual(['E1', 'E2', 'E3', 'E5', 'E6']);
    const bad = await call('make_education_pptx_bytes', { snapshot: { ...ED, hazards: [] } });
    expect(bad.ok).toBe(false);
    expect(cfgs.get('make_education_pptx')!.annotations!.readOnlyHint).toBe(false);
  });

  it('원격 make_meeting_pptx_bytes → extract_pptx_bytes', async () => {
    const mk = await call('make_meeting_pptx_bytes', { snapshot: MEETING });
    expect(mk.ok).toBe(true);
    expect(mk.bytes).toBeUndefined();
    expect(Buffer.from(mk.base64, 'base64').subarray(0, 2).toString('latin1')).toBe('PK');
    // 원격 공개 입구는 고객 파일 처리 대상이 아니다 — 만든 덱(수십 KB 이상)은 원격 입력 상한을 넘어 정직하게 거절된다(G4 Act on 1)
    expect(mk.outputBytes).toBeGreaterThan(MAX_REMOTE_INPUT_BYTES);
    const ex = await call('extract_pptx_bytes', { base64: mk.base64 });
    expect(ex.ok).toBe(false);
    expect(ex.code).toBe('INPUT_TOO_LARGE');
    expect(ex.error).toContain('고객 파일 처리용이 아니다');
  });

  it('원격 도구 설명은 정책 상수(request-boundary)에서 계산한 상한과 「고객 파일 처리용 아님」 을 말한다', () => {
    for (const n of ['inspect_xlsx_bytes', 'extract_xlsx_rows_bytes', 'fill_xlsx_template_bytes', 'extract_pptx_bytes']) {
      const d = (cfgs.get(n) as { description: string }).description;
      expect(d, n).toContain('고객 파일 처리용이 아니다');
      expect(d, n).toContain(String(MAX_REMOTE_INPUT_BYTES));
      expect(d, n).not.toMatch(/5MB, 압축을 푼 합계 50MB/);
    }
  });

  it('원격 extract_pptx_bytes 는 5MB 초과·zip 폭탄을 구조화 오류로', async () => {
    const big = await call('extract_pptx_bytes', { base64: Buffer.from(new Uint8Array(MAX_REMOTE_INPUT_BYTES + 1)).toString('base64') });
    expect(big.code).toBe('INPUT_TOO_LARGE');
    const zip = new JSZip();
    zip.file('ppt/bomb.bin', new Uint8Array(MAX_REMOTE_UNZIPPED_BYTES + 1024));
    const bomb = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 9 } });
    const r = await call('extract_pptx_bytes', { base64: Buffer.from(bomb).toString('base64') });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('ZIP_TOO_LARGE');
  }, 60_000);

  it('잘못된 스냅숏은 errors 를 돌리고 파일을 만들지 않는다', () =>
    withDir(async (dir) => {
      const out = path.join(dir, 'bad.pptx');
      const r = await call('make_meeting_pptx', { snapshot: { ...MEETING, site: '' }, outFile: out });
      expect(r.ok).toBe(false);
      expect(fs.existsSync(out)).toBe(false);
    }));
});
