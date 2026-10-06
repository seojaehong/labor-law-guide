import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import {
  prepareSelectedLawExport, selectedLawsDocx, selectedLawsXlsx, selectedLawExportStats, isLargeSelectedLawExport,
  LARGE_SELECTED_LAW_EXPORT_LIMITS, SELECTED_LAWS_CHARACTER_COUNT_NOTE, type SelectedLawExportStats,
  SELECTED_LAWS_DISCLAIMER, SELECTED_LAWS_DOCX_MIME, SELECTED_LAWS_XLSX_MIME,
} from '@/lib/laws/export-selected';
import { lawGoUrl, type LawDetail, type LawEvent, type LawIndex, type StepChange } from '@/lib/laws/format';

const change: StepChange = {
  key: '0001001', article: '제1조', title: '목적', kind: '개정',
  before: '제1조(목적)\n① "갑" & <을>의 권리\n\n② 줄바꿈과 공백  보존',
  after: '=제1조(목적)\n① <개정 2026.1.1> & "갑"\n② 새 조문',
};
const event: LawEvent = {
  id: 'law-20261006', lawId: 'law', law: '시험법 시행령', short: '시험령', group: 'parent',
  level: '시행령', lawKind: '대통령령', scope: null, date: '20261006',
  promulgations: [
    { date: '20260101', no: '00123', kind: '일부개정', mst: '101' },
    { date: '20260915', no: '00456', kind: '타법개정', mst: '102' },
  ],
  kinds: ['일부개정', '타법개정'], cause: null, headline: '제목 <검수 전>', summary: '개정 요약 & 원문 확인',
  counts: { 신설: 0, 개정: 1, 삭제: 0 }, changes: [{ ...change, rule: '취업규칙 검토' }], rules: [],
};
function fixture(changes: StepChange[] = [change], target: LawEvent = event): LawDetail {
  return {
    lawId: target.lawId, name: target.law, short: target.short,
    steps: [{ id: target.id, date: target.date, base: '20250901', mst: '103', changes,
      addenda: [{ 부칙: '부칙 <대통령령 제00456호>', 내용: ['제1조 시행일', '제2조 경과조치 & 특례'] }],
      reason: '개정 이유 <보존> & "원문"', rules: [] }],
  };
}
const prepare = (changes: StepChange[] = [change]) => prepareSelectedLawExport([event], async () => fixture(changes));
const sheetRows = (workbook: XLSX.WorkBook, name: string) => XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[name], { header: 1, defval: '' });
async function workbook(changes: StepChange[] = [change]) {
  const blob = await selectedLawsXlsx(await prepare(changes));
  expect(blob.type).toBe(SELECTED_LAWS_XLSX_MIME);
  return XLSX.read(await blob.arrayBuffer(), { type: 'array' });
}
const unescapeXml = (text: string) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function cellText(xml: string): string {
  return [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:br\s*\/>/g)]
    .map(match => match[1] === undefined ? '\n' : unescapeXml(match[1])).join('');
}

describe('selected law detail resolution', () => {
  it('deduplicates selections and loads one detail per law, retaining selected order', async () => {
    const second = { ...event, id: 'law-20261201', date: '20261201' };
    const detail = fixture();
    detail.steps.push(fixture([change], second).steps[0]);
    const loader = vi.fn(async () => detail);
    const data = await prepareSelectedLawExport([second, event, second], loader);
    expect(data.events.map(item => item.event.id)).toEqual([second.id, event.id]);
    expect(data.changeCount).toBe(2);
    expect(loader).toHaveBeenCalledExactlyOnceWith('law');
  });

  it('rejects an empty selection without loading details', async () => {
    const loader = vi.fn();
    await expect(prepareSelectedLawExport([], loader)).rejects.toThrow('선택');
    expect(loader).not.toHaveBeenCalled();
  });

  it('rejects the whole selection when any detail step is missing, rather than skipping it', async () => {
    const missing = { ...event, id: 'law-missing' };
    await expect(prepareSelectedLawExport([event, missing], async () => fixture())).rejects.toThrow('파일을 만들지 않았습니다');
  });

  it('reports a failed detail load with the law name', async () => {
    await expect(prepareSelectedLawExport([event], async () => { throw new Error('503'); })).rejects.toThrow('시험법 시행령 상세 정보를 불러오지 못했습니다');
  });

  it('rejects details for another law', async () => {
    await expect(prepareSelectedLawExport([event], async () => ({ ...fixture(), lawId: 'wrong' }))).rejects.toThrow('상세 정보');
  });

  it.each(['date', 'duplicate'] as const)('rejects mismatched or ambiguous steps: %s', async issue => {
    const detail = fixture();
    if (issue === 'date') detail.steps[0].date = '20270101';
    else detail.steps.push({ ...detail.steps[0] });
    await expect(prepareSelectedLawExport([event], async () => detail)).rejects.toThrow('상세 개정');
  });

  it('rejects missing indexed clauses and undefined legal text', async () => {
    await expect(prepare([])).rejects.toThrow('조문 상세');
    await expect(prepare([{ ...change, after: undefined } as unknown as StepChange])).rejects.toThrow('조문 상세');
  });

  it('does not mutate selection or detail data', async () => {
    const detail = fixture();
    const original = JSON.stringify({ event, detail });
    await prepareSelectedLawExport([event, event], async () => detail);
    expect(JSON.stringify({ event, detail })).toBe(original);
  });
});

describe('exact selected export volume', () => {
  it('counts deduplicated amendments, distinct law IDs and raw before/after Unicode code points', async () => {
    const second = { ...event, id: 'law-20261201', date: '20261201' };
    const other = { ...event, id: 'other-20261006', lawId: 'other' };
    const detail = fixture([{ ...change, before: '가 😀\n', after: 'e\u0301' }]);
    detail.steps.push(fixture([{ ...change, before: null, after: '' }], second).steps[0]);
    const data = await prepareSelectedLawExport([event, second, event, other], async id =>
      id === 'law' ? detail : fixture([{ ...change, before: '甲', after: '乙' }], other));
    expect(selectedLawExportStats(data)).toEqual({ eventCount: 3, lawCount: 2, changeCount: 3, textCharacterCount: 8 });
    // Result is computed from original detail, not a supplied aggregate or formatted placeholders.
    expect(selectedLawExportStats({ events: [...data.events, data.events[0]], changeCount: 999 })).toEqual(selectedLawExportStats(data));
    expect(SELECTED_LAWS_CHARACTER_COUNT_NOTE).toContain('공백·줄바꿈 포함');
  });

  it('counts long original text once regardless of export continuation rows', async () => {
    const long = '가😀\n'.repeat(20000);
    const data = await prepare([{ ...change, before: long, after: long }]);
    const before = selectedLawExportStats(data);
    await selectedLawsXlsx(data);
    await selectedLawsDocx(data);
    expect(selectedLawExportStats(data)).toEqual(before);
    expect(before.textCharacterCount).toBe(120000);
  });

  it('returns zero counts for empty resolved data', () => {
    expect(selectedLawExportStats({ events: [], changeCount: 0 })).toEqual({ eventCount: 0, lawCount: 0, changeCount: 0, textCharacterCount: 0 });
  });

  it.each(['eventCount', 'changeCount', 'textCharacterCount'] as const)('flags %s at the inclusive advisory threshold', field => {
    const stats: SelectedLawExportStats = { eventCount: 1, lawCount: 1, changeCount: 1, textCharacterCount: 1 };
    const limit = LARGE_SELECTED_LAW_EXPORT_LIMITS[field];
    expect(isLargeSelectedLawExport({ ...stats, [field]: limit - 1 })).toBe(false);
    expect(isLargeSelectedLawExport({ ...stats, [field]: limit })).toBe(true);
    expect(isLargeSelectedLawExport({ ...stats, [field]: limit + 1 })).toBe(true);
  });

  it('uses only supplied actual file bytes for the inclusive byte threshold', () => {
    const small: SelectedLawExportStats = { eventCount: 1, lawCount: 1, changeCount: 1, textCharacterCount: 1 };
    const limit = LARGE_SELECTED_LAW_EXPORT_LIMITS.byteLimit;
    expect(isLargeSelectedLawExport(small)).toBe(false);
    expect(isLargeSelectedLawExport(small, limit - 1)).toBe(false);
    expect(isLargeSelectedLawExport(small, limit)).toBe(true);
    expect(isLargeSelectedLawExport(small, limit + 1)).toBe(true);
  });
});

describe('selected law XLSX', () => {
  it('creates a real readable workbook with original multiline text and safe string cells', async () => {
    const book = await workbook();
    expect(book.SheetNames).toEqual(['신구대조', '선택 개정', '출처·안내']);
    const rows = sheetRows(book, '신구대조');
    expect(rows).toHaveLength(2);
    expect(rows[1][7]).toBe(change.before);
    expect(rows[1][8]).toBe(change.after);
    expect(book.Sheets['신구대조'].I2.t).toBe('s');
    expect(book.Sheets['신구대조'].I2.f).toBeUndefined();
    expect(rows[1][9]).toBe('취업규칙 검토');
  });

  it('includes every promulgation, original source link, law kind, and review disclaimer', async () => {
    const book = await workbook();
    const rows = sheetRows(book, '출처·안내');
    expect(rows[0][0]).toBe(SELECTED_LAWS_DISCLAIMER);
    expect(rows.slice(5).map(row => row[7])).toEqual(['103', '101', '102'].map(mst => lawGoUrl(mst, event.date)));
    expect(rows[6].slice(4, 7)).toEqual(['2026. 1. 1.', '대통령령 제00123호', '일부개정']);
    expect(rows[7].slice(4, 7)).toEqual(['2026. 9. 15.', '대통령령 제00456호', '타법개정']);
    // SheetJS 0.18's reader leaves XML entities encoded in relationship targets.
    expect(unescapeXml(book.Sheets['출처·안내'].H7.l!.Target!)).toBe(lawGoUrl('101', event.date));
    expect(sheetRows(book, '선택 개정')[1][10]).toContain('제2조 경과조치 & 특례');
  });

  it('losslessly splits oversized cells, including surrogate pairs at Excel’s cell boundary', async () => {
    const before = '가'.repeat(32766) + '😀\n' + '긴 원문 <&>\n'.repeat(13000);
    const after = '짧은 개정문\n마지막 문장';
    const book = await workbook([{ ...change, before, after }]);
    const rows = sheetRows(book, '신구대조').slice(1);
    expect(rows.length).toBeGreaterThan(4);
    expect(rows.map(row => row[7]).join('')).toBe(before);
    expect(rows.map(row => row[8]).join('')).toBe(after);
    expect(rows[0][11]).toBe(`1/${rows.length}`);
    expect(rows.at(-1)![11]).toBe(`${rows.length}/${rows.length}`);
    for (const row of rows) for (const value of row) expect(value.length).toBeLessThanOrEqual(32767);
    expect(rows[0][7]).not.toMatch(/[\uD800-\uDBFF]$/);
  });

  it('distinguishes additions and deletions without changing non-null empty text', async () => {
    const book = await workbook([{ ...change, before: null }, { ...change, key: 'other', after: null }, { ...change, key: 'empty', before: '', after: '' }]);
    const rows = sheetRows(book, '신구대조');
    expect(rows[1][7]).toBe('<신설>');
    expect(rows[2][8]).toBe('<삭제>');
    expect(rows[3].slice(7, 9)).toEqual(['', '']);
  });

  it('keeps a valid event with no changed clauses in both formats', async () => {
    const noChanges = { ...event, changes: [] };
    const data = await prepareSelectedLawExport([noChanges], async () => fixture([]));
    expect(data.events).toHaveLength(1);
    expect(data.changeCount).toBe(0);
    const book = XLSX.read(await (await selectedLawsXlsx(data)).arrayBuffer(), { type: 'array' });
    expect(sheetRows(book, '신구대조')[1][4]).toBe('비교 조문 없음');
    const zip = await JSZip.loadAsync(await (await selectedLawsDocx(data)).arrayBuffer());
    expect(await zip.file('word/document.xml')!.async('string')).toContain('비교 조문 없음');
  });
});

describe('selected law DOCX', () => {
  it('starts each later amendment on a new page with its own comparison and complete metadata', async () => {
    const second = { ...event, id: 'law-20270101', date: '20270101', headline: '두 번째 제목', summary: '두 번째 요약',
      promulgations: [{ date: '20261201', no: '00789', kind: '일부개정', mst: '201' }] };
    const detail = fixture();
    const nextStep = fixture([{ ...change, before: '두 번째 전 <&>\n원문', after: '두 번째 후 <&>\n원문' }], second).steps[0];
    nextStep.reason = '두 번째 개정 이유';
    nextStep.addenda = [{ 부칙: '두 번째 부칙', 내용: ['두 번째 경과조치'] }];
    detail.steps.push(nextStep);
    const data = await prepareSelectedLawExport([event, second], async () => detail);
    const zip = await JSZip.loadAsync(await (await selectedLawsDocx(data)).arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    const sections = xml.split('<w:p><w:pPr>').slice(1);
    expect(sections).toHaveLength(2);
    expect(xml.match(/<w:tbl>/g)).toHaveLength(2);
    expect(xml.match(/<w:pageBreakBefore\/>/g)).toHaveLength(1);
    expect(sections[0]).not.toContain('<w:pageBreakBefore/>');
    expect(sections[1]).toMatch(/^<w:pageBreakBefore\/><w:keepNext\/>/);
    expect(cellText(sections[0])).toContain('「시험법 시행령」 · 2026. 10. 6. 시행');
    expect(cellText(sections[1])).toContain('「시험법 시행령」 · 2027. 1. 1. 시행');
    expect(cellText(sections[0])).toContain(event.summary);
    expect(cellText(sections[0])).toContain(detail.steps[0].reason);
    expect(cellText(sections[0])).toContain('제2조 경과조치 & 특례');
    expect(cellText(sections[0])).not.toContain('두 번째');
    for (const text of ['두 번째 요약', '두 번째 개정 이유', '두 번째 부칙', '두 번째 경과조치', nextStep.changes[0].before!, nextStep.changes[0].after!]) expect(cellText(sections[1])).toContain(text);
    expect(cellText(sections[1])).toContain('대통령령 제00789호');
    expect(cellText(sections[1])).toContain(lawGoUrl('201', second.date));
    expect(xml.slice(0, xml.indexOf('<w:p><w:pPr>'))).not.toContain('2027. 1. 1.');
  });

  it('creates a real landscape OOXML package and preserves XML-special, multiline legal text exactly', async () => {
    const blob = await selectedLawsDocx(await prepare());
    expect(blob.type).toBe(SELECTED_LAWS_DOCX_MIME);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(zip.file('[Content_Types].xml')).not.toBeNull();
    expect(zip.file('_rels/.rels')).not.toBeNull();
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('w:orient="landscape"');
    expect(xml).toContain('<w:tblHeader/>');
    expect(xml).not.toContain('<을>');
    const rows = [...xml.matchAll(/<w:tr>([\s\S]*?)<\/w:tr>/g)];
    const cells = [...rows[1][1].matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map(match => cellText(match[1]));
    expect(cells).toHaveLength(4);
    expect(cells[0]).toContain('시험법 시행령\n시행: 2026. 10. 6.');
    expect(cells[1]).toBe(change.before);
    expect(cells[2]).toBe(change.after);
    for (const p of event.promulgations) {
      expect(cells[3]).toContain(`대통령령 제${p.no}호`);
      expect(cells[3]).toContain(lawGoUrl(p.mst, event.date));
    }
    expect(cellText(xml)).toContain(SELECTED_LAWS_DISCLAIMER);
    expect(cellText(xml)).toContain('제2조 경과조치 & 특례');
  });

  it('does not truncate long clauses in the comparison table', async () => {
    const long = '① 근로자는 <원문> & "인용"을 확인한다.\n'.repeat(6000);
    const blob = await selectedLawsDocx(await prepare([{ ...change, before: long, after: long + '끝' }]));
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    const rows = [...xml.matchAll(/<w:tr>([\s\S]*?)<\/w:tr>/g)].slice(1)
      .map(row => [...row[1].matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map(match => cellText(match[1])));
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.map(cells => cells[1]).join('')).toBe(long);
    expect(rows.map(cells => cells[2]).join('')).toBe(long + '끝');
    expect(rows[0][0]).toContain(`본문 1/${rows.length}`);
    for (const cells of rows) {
      expect(cells[1].length).toBeLessThanOrEqual(1000);
      expect(cells[2].length).toBeLessThanOrEqual(1000);
    }
  });

  it('paginates line-heavy text losslessly, including empty lines and surrogate pairs', async () => {
    const before = '\n'.repeat(200) + '가'.repeat(999) + '😀끝';
    const data = await prepare([{ ...change, before, after: '짧은 글' }]);
    const zip = await JSZip.loadAsync(await (await selectedLawsDocx(data)).arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    const rows = [...xml.matchAll(/<w:tr>([\s\S]*?)<\/w:tr>/g)].slice(1)
      .map(row => [...row[1].matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map(match => cellText(match[1])));
    expect(rows.map(cells => cells[1]).join('')).toBe(before);
    expect(rows.map(cells => cells[2]).join('')).toBe('짧은 글');
    for (const cells of rows) {
      expect(cells[1].split('\n').length).toBeLessThanOrEqual(29);
      expect(cells[1]).not.toMatch(/[\uD800-\uDBFF]$/);
    }
  });
});

describe('production selection structural regression (not legal verification)', () => {
  it('resolves every indexed event and preserves the longest existing clause in XLSX', async () => {
    const index: LawIndex = JSON.parse(readFileSync('public/data/laws/index.json', 'utf8'));
    const all = await prepareSelectedLawExport(index.events, async lawId => JSON.parse(readFileSync(`public/data/laws/${lawId}.json`, 'utf8')));
    expect(all.events).toHaveLength(index.events.length);
    const largest = all.events.reduce((best, item) => {
      const max = Math.max(...item.step.changes.map(c => Math.max(c.before?.length ?? 0, c.after?.length ?? 0)));
      return max > best.max ? { item, max } : best;
    }, { item: all.events[0], max: 0 }).item;
    const book = XLSX.read(await (await selectedLawsXlsx({ events: [largest], changeCount: largest.step.changes.length })).arrayBuffer(), { type: 'array' });
    const rows = sheetRows(book, '신구대조').slice(1);
    for (const c of largest.step.changes) {
      const matching = rows.filter(row => row[4] === c.article && row[5] === c.title && row[6] === c.kind);
      expect(matching.map(row => row[7]).join('')).toBe(c.before ?? '<신설>');
      expect(matching.map(row => row[8]).join('')).toBe(c.after ?? '<삭제>');
    }
  });
});
