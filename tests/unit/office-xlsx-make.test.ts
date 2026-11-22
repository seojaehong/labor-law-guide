import { describe, it, expect } from 'vitest';
import { makeXlsxFromSpec, type XlsxSpec } from '@/lib/office/xlsx/make';
import { inspectXlsx } from '@/lib/office/xlsx/inspect';
import { fillXlsxTemplate } from '@/lib/office/xlsx/fill';
import { extractXlsxRows } from '@/lib/office/xlsx/extract';

// 합성 사양: 시트 3개. 실명·실주소 없음.
const SPEC: XlsxSpec = {
  sheets: [
    {
      name: '평가표',
      title: '위험성평가표(합성)',
      columns: [
        { key: 'id', header: 'ID', width: 8 },
        { key: 'hazard', header: '위험요인', width: 40, wrap: true },
        { key: 'freq', header: '빈도' },
        { key: 'sev', header: '강도' },
        { key: 'grade', header: '등급' },
      ],
      merges: ['A20:B20'],
      validations: [
        { range: 'C3:C20', list: ['1', '2', '3'] },
        { range: 'E3:E20', list: ['높음', '보통', '낮음'] },
      ],
      freeze: 'B3',
      print: { orientation: 'landscape', paper: 'A4', fitToWidth: 1, printTitlesRows: '1:2' },
      rows: [
        { id: 'H1', hazard: '바닥 물기', freq: 2, sev: 3, grade: '높음 (6)' },
        { id: 'H2', hazard: '선반 낙하', freq: 1, sev: 2, grade: '보통 (2)' },
      ],
    },
    {
      name: '조치계획',
      columns: [
        { key: 'id', header: 'ID' },
        { key: 'action', header: '조치' },
        { key: 'due', header: '기한' },
      ],
      headerRows: [['조치 계획', null, '일정']],
      merges: ['A1:B1'],
      freeze: 'A3',
      print: { orientation: 'portrait', paper: 'A4', fitToWidth: 1, printTitlesRows: '1:2' },
    },
    {
      name: '척도',
      columns: [
        { key: 'level', header: '단계' },
        { key: 'desc', header: '설명' },
      ],
      rows: [{ level: 1, desc: '낮음' }],
    },
  ],
};

const strip = (s?: string) => (s ?? '').replace(/\$/g, '');

describe('makeXlsxFromSpec — 사양으로 서식 만들기', () => {
  it('시트 3개 사양을 inspectXlsx 로 읽으면 사양과 같다', async () => {
    const r = await makeXlsxFromSpec(SPEC);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const info = await inspectXlsx(r.bytes);
    expect(info.ok).toBe(true);
    expect(info.sheets.map((s) => s.name)).toEqual(['평가표', '조치계획', '척도']);

    const [a, b, c] = info.sheets;
    // 제목 행 병합(열 수만큼) + 사양 병합
    expect([...a.merges].sort()).toEqual(['A1:E1', 'A20:B20']);
    expect(a.validations.map((v) => v.range)).toEqual(['C3:C20', 'E3:E20']);
    expect(a.validations[1].list).toEqual(['높음', '보통', '낮음']);
    expect(a.freeze).toBe('B3');
    expect(a.orientation).toBe('landscape');
    expect(a.paper).toBe('A4');
    expect(a.fitToWidth).toBe(1);
    expect(strip(a.printTitles)).toBe('1:2');

    expect(b.merges).toEqual(['A1:B1']);
    expect(b.freeze).toBe('A3');
    expect(b.orientation).toBe('portrait');
    expect(b.paper).toBe('A4');
    expect(b.fitToWidth).toBe(1);
    expect(strip(b.printTitles)).toBe('1:2');

    expect(c.merges).toEqual([]);
    expect(c.freeze).toBeUndefined();
    expect(c.printTitles).toBeUndefined();
  });

  it('머리행·자료 행이 제자리에 들어간다(문자 등급 보존)', async () => {
    const r = await makeXlsxFromSpec(SPEC);
    if (!r.ok) throw new Error('make 실패');
    const ex = await extractXlsxRows(r.bytes, { sheet: '평가표', headerRow: 2 });
    expect(ex.ok).toBe(true);
    expect(ex.headers).toEqual(['ID', '위험요인', '빈도', '강도', '등급']);
    expect(ex.rows[0].rowNumber).toBe(3);
    expect(ex.rows[0].cells['등급'].raw).toBe('높음 (6)');
    expect(ex.rows[1].cells['위험요인'].raw).toBe('선반 낙하');

    const ex2 = await extractXlsxRows(r.bytes, { sheet: '척도', headerRow: 1 });
    expect(ex2.headers).toEqual(['단계', '설명']);
    expect(ex2.rows[0].cells['설명'].raw).toBe('낮음');
  });

  it('만든 파일을 fillXlsxTemplate 템플릿으로 다시 써도 preserved 가 모두 같다', async () => {
    const r = await makeXlsxFromSpec(SPEC);
    if (!r.ok) throw new Error('make 실패');
    const f = await fillXlsxTemplate(r.bytes, {
      rows: {
        sheet: '평가표',
        startRow: 5,
        columns: { A: 'id', B: 'hazard' },
        data: [{ id: 'H3', hazard: '전선 걸림' }],
        overflow: 'error',
      },
    });
    expect(f.reason).toBeUndefined();
    expect(f.ok).toBe(true);
    const diff = Object.entries(f.preserved ?? {}).filter(
      ([k, v]) => k !== 'allSame' && !(v as { same: boolean }).same,
    );
    expect(diff).toEqual([]);
    expect(f.preserved?.allSame).toBe(true);
    const after = await inspectXlsx(f.bytes!);
    expect(after.sheets[0].freeze).toBe('B3');
  });

  it('잘못된 사양은 {ok:false, errors[]}', async () => {
    const bad = await makeXlsxFromSpec({
      sheets: [
        {
          name: '',
          columns: [
            { key: 'a', header: 'A' },
            { key: 'a', header: 'A2' },
          ],
        },
        { name: '중복', columns: [{ key: 'x', header: 'X' }] },
        { name: '중복', columns: [] },
        { name: '나쁜/이름', columns: [{ key: 'y', header: 'Y' }], merges: ['A1-B2'], validations: [{ range: 'C3', list: [] }] },
      ],
    });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    const all = bad.errors.join('\n');
    expect(all).toMatch(/시트 이름이 비어/);
    expect(all).toMatch(/열 key 중복: a/);
    expect(all).toMatch(/시트 이름 중복: 중복/);
    expect(all).toMatch(/열이 없/);
    expect(all).toMatch(/쓸 수 없는 글자/);
    expect(all).toMatch(/병합 범위.*A1-B2/);
    expect(all).toMatch(/목록이 비어/);

    const empty = await makeXlsxFromSpec({ sheets: [] });
    expect(empty.ok).toBe(false);
  });
});
