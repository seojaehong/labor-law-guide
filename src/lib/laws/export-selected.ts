import { compareDocx, type CompareDocxSection } from './doc-io';
import { fmtDate, lawGoUrl, type LawDetail, type LawEvent } from './format';

export const SELECTED_LAWS_XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const SELECTED_LAWS_DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const SELECTED_LAWS_DISCLAIMER = '법령 검수 전 · 개정 제목과 취업규칙 문안은 원문 대조와 공인노무사 검토가 필요합니다. 법적 효력은 관보·국가법령정보센터 원문을 따릅니다.';
const SOURCE = '출처: 국가법령정보센터(법제처) Open API';
const EXCEL_CELL_LIMIT = 32767;

type LawStep = LawDetail['steps'][number];
export interface SelectedLawExportEvent {
  event: LawEvent;
  step: LawStep;
}
export interface SelectedLawExport {
  events: SelectedLawExportEvent[];
  changeCount: number;
}

export interface SelectedLawExportStats {
  eventCount: number;
  /** Distinct law IDs, including statutes, decrees and regulations individually. */
  lawCount: number;
  changeCount: number;
  /** Unicode code points in original before + after strings, including whitespace. Null is zero. */
  textCharacterCount: number;
}

export const SELECTED_LAWS_CHARACTER_COUNT_NOTE = '개정 전·후 원문의 유니코드 코드 포인트 수 합계(공백·줄바꿈 포함)입니다. 별도로 붙이는 제목·출처·부칙과 신설·삭제 표시 문구는 제외합니다.';

/** Advisory limits, not file-size or page estimates. The 401-event baseline has a 43,655-char p95;
 *  16 individual events exceed 50,000 chars, while its largest has 344,414 chars. */
export const LARGE_SELECTED_LAW_EXPORT_LIMITS = { eventCount: 20, changeCount: 50, textCharacterCount: 50000, byteLimit: 5000000 } as const;

/** Count the resolved originals once, unaffected by generated continuation rows or placeholders. */
export function selectedLawExportStats(data: SelectedLawExport): SelectedLawExportStats {
  const events = [...new Map(data.events.map(item => [item.event.id, item])).values()];
  let changeCount = 0;
  let textCharacterCount = 0;
  for (const { step } of events) {
    changeCount += step.changes.length;
    for (const change of step.changes) for (const text of [change.before, change.after]) {
      if (text !== null) textCharacterCount += Array.from(text).length;
    }
  }
  return { eventCount: events.length, lawCount: new Set(events.map(item => item.event.lawId)).size, changeCount, textCharacterCount };
}

/** Ask the user whether to continue; do not truncate or block an explicitly confirmed selection. */
export function isLargeSelectedLawExport(stats: SelectedLawExportStats, fileBytes = 0): boolean {
  return stats.eventCount >= LARGE_SELECTED_LAW_EXPORT_LIMITS.eventCount ||
    stats.changeCount >= LARGE_SELECTED_LAW_EXPORT_LIMITS.changeCount ||
    stats.textCharacterCount >= LARGE_SELECTED_LAW_EXPORT_LIMITS.textCharacterCount ||
    fileBytes >= LARGE_SELECTED_LAW_EXPORT_LIMITS.byteLimit;
}

/** Resolve the entire selection before making a file. Never silently skip unavailable details. */
export async function prepareSelectedLawExport(
  events: LawEvent[],
  loadDetail: (lawId: string) => Promise<LawDetail>,
): Promise<SelectedLawExport> {
  const unique = [...new Map(events.map(event => [event.id, event])).values()];
  if (!unique.length) throw new Error('내려받을 개정을 선택하세요.');
  const details = new Map<string, LawDetail>();
  await Promise.all([...new Set(unique.map(event => event.lawId))].map(async lawId => {
    try {
      const detail = await loadDetail(lawId);
      if (!detail || detail.lawId !== lawId || !Array.isArray(detail.steps)) throw new Error('법령 상세 정보가 일치하지 않습니다.');
      details.set(lawId, detail);
    } catch (error) {
      const law = unique.find(event => event.lawId === lawId)!.law;
      throw new Error(`${law} 상세 정보를 불러오지 못했습니다. 다시 시도하세요.`, { cause: error });
    }
  }));
  const resolved = unique.map(event => {
    const matches = details.get(event.lawId)!.steps.filter(step => step.id === event.id);
    const step = matches[0];
    if (matches.length !== 1 || step.date !== event.date || !Array.isArray(step.changes)) {
      throw new Error(`${event.law} (${fmtDate(event.date)} 시행) 상세 개정을 확인할 수 없습니다. 파일을 만들지 않았습니다.`);
    }
    const keys = new Set(step.changes.map(change => change.key));
    if (event.changes.some(change => !keys.has(change.key)) || step.changes.some(change =>
      !change || typeof change.article !== 'string' || typeof change.title !== 'string' || typeof change.kind !== 'string' ||
      !(typeof change.before === 'string' || change.before === null) || !(typeof change.after === 'string' || change.after === null))) {
      throw new Error(`${event.law} (${fmtDate(event.date)} 시행) 조문 상세가 빠져 있습니다. 파일을 만들지 않았습니다.`);
    }
    return { event, step };
  });
  return { events: resolved, changeCount: resolved.reduce((sum, item) => sum + item.step.changes.length, 0) };
}

function promulgationsText(event: LawEvent): string {
  return event.promulgations.map(p => `${fmtDate(p.date)} 공포 · ${event.lawKind} 제${p.no}호 · ${p.kind}`).join('\n') || '공포 정보 없음';
}

function sources({ event, step }: SelectedLawExportEvent): string[] {
  return [...new Set([lawGoUrl(step.mst, event.date), ...event.promulgations.map(p => lawGoUrl(p.mst, event.date))])];
}

/** Excel rejects cells above 32,767 UTF-16 code units. Split without losing even a surrogate pair. */
function chunks(text: string): string[] {
  const out: string[] = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + EXCEL_CELL_LIMIT, text.length);
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    out.push(text.slice(start, end));
    start = end;
  }
  return out.length ? out : [''];
}

/** Keep comparison rows short enough to paginate, even with many blank lines or huge annexes. */
function documentChunks(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + 1000, text.length);
    let lines = 0;
    for (let i = start; i < end; i++) if (text[i] === '\n' && ++lines === 28) { end = i + 1; break; }
    // Prefer a complete paragraph, but retain the newline and every other original character.
    if (end < text.length) {
      const newline = text.lastIndexOf('\n', end - 1);
      if (newline >= start + 500) end = newline + 1;
      if (/[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    }
    out.push(text.slice(start, end));
    start = end;
  }
  return out.length ? out : [''];
}

/** Every field is losslessly split; short identifying fields repeat on continuation rows. */
function appendRows(rows: string[][], values: string[], continuousColumns: number[]): void {
  const parts = values.map(chunks);
  const count = Math.max(...parts.map(part => part.length));
  for (let i = 0; i < count; i++) {
    rows.push([...parts.map((part, column) =>
      part.length === 1 && !continuousColumns.includes(column) ? part[0] : part[i] ?? ''), `${i + 1}/${count}`]);
  }
}

/** A real OOXML workbook; data and legal text stay in the browser. */
export async function selectedLawsXlsx(data: SelectedLawExport): Promise<Blob> {
  const XLSX = await import('xlsx');
  const comparison: string[][] = [['개정 ID', '시행일', '법령', '공포일·번호(전체)', '조문', '제목', '변경', '개정 전', '개정 후', '취업규칙 반영', '법제처 원문', '본문 분할']];
  const selected: string[][] = [['개정 ID', '법령', '법령 구분', '시행일', '비교 기준일', '공포일·번호(전체)', '개정 구분', '제목', '요약', '개정 이유', '부칙', '조문 수', '본문 분할']];
  const sourceRows: string[][] = [
    [SELECTED_LAWS_DISCLAIMER], [SOURCE],
    ['긴 본문은 Excel 셀 제한에 맞춰 여러 행으로 나뉩니다. 동일 개정 ID·조문의 개정 전/후를 본문 분할 순서대로 이어 읽으세요. 줄바꿈과 원문은 생략하지 않았습니다.'],
    [], ['개정 ID', '법령', '시행일', '출처 구분', '공포일', '공포 번호', '개정 구분', '원문 URL'],
  ];
  for (const item of data.events) {
    const { event, step } = item;
    const source = lawGoUrl(step.mst, event.date);
    appendRows(selected, [event.id, event.law, event.level, fmtDate(event.date), step.base ? fmtDate(step.base) : '', promulgationsText(event), event.kinds.join('·'), event.headline ?? '', event.summary, step.reason, step.addenda.map(a => [a.부칙, ...a.내용].join('\n')).join('\n\n'), String(step.changes.length)], [8, 9, 10]);
    for (const change of step.changes) {
      appendRows(comparison, [event.id, fmtDate(event.date), event.law, promulgationsText(event), change.article, change.title, change.kind, change.before ?? '<신설>', change.after ?? '<삭제>', event.changes.find(c => c.key === change.key)?.rule ?? '', source], [7, 8]);
    }
    // Include even a valid zero-change event rather than pretending it was not selected.
    if (!step.changes.length) appendRows(comparison, [event.id, fmtDate(event.date), event.law, promulgationsText(event), '비교 조문 없음', '', '', '', '', '', source], [7, 8]);
    sourceRows.push([event.id, event.law, fmtDate(event.date), '시행 법령', '', '', '', source]);
    for (const p of event.promulgations) sourceRows.push([event.id, event.law, fmtDate(event.date), '공포 법령', fmtDate(p.date), `${event.lawKind} 제${p.no}호`, p.kind, lawGoUrl(p.mst, event.date)]);
  }
  const workbook = XLSX.utils.book_new();
  for (const [name, rows, widths] of [
    ['신구대조', comparison, [24, 15, 30, 40, 14, 24, 10, 70, 70, 24, 50, 12]],
    ['선택 개정', selected, [24, 30, 12, 15, 15, 40, 18, 40, 70, 70, 70, 10, 12]],
    ['출처·안내', sourceRows, [24, 30, 15, 15, 15, 25, 18, 65]],
  ] as const) {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols'] = widths.map(wch => ({ wch }));
    if (name !== '출처·안내') sheet['!autofilter'] = { ref: sheet['!ref']! };
    // Explicit string cells also prevent formula injection from law text beginning with '='.
    for (let row = 0; row < rows.length; row++) for (let column = 0; column < rows[row].length; column++) {
      const value = rows[row][column];
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (cell && /^https:\/\/www\.law\.go\.kr\//.test(value)) cell.l = { Target: value, Tooltip: '국가법령정보센터 원문' };
    }
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  }
  return new Blob([XLSX.write(workbook, { bookType: 'xlsx', type: 'array', compression: true })], { type: SELECTED_LAWS_XLSX_MIME });
}

/** A real landscape DOCX package; never a renamed HWP. */
export async function selectedLawsDocx(data: SelectedLawExport): Promise<Blob> {
  const sections: CompareDocxSection[] = [];
  for (const item of data.events) {
    const { event, step } = item;
    const rows: string[][] = [];
    const foot = [SOURCE, SELECTED_LAWS_DISCLAIMER];
    const context = `${event.law}\n시행: ${fmtDate(event.date)}\n비교 기준: ${step.base ? fmtDate(step.base) : '정보 없음'}`;
    const source = `${promulgationsText(event)}\n${sources(item).join('\n')}`;
    for (const change of step.changes) {
      const before = documentChunks(change.before ?? '<신설>');
      const after = documentChunks(change.after ?? '<삭제>');
      const count = Math.max(before.length, after.length);
      for (let part = 0; part < count; part++) rows.push([
        `${context}\n${change.article}${change.title ? ` (${change.title})` : ''}\n${change.kind}${count > 1 ? `\n본문 ${part + 1}/${count} (이어 읽기)` : ''}`,
        before[part] ?? '', after[part] ?? '', source,
      ]);
    }
    if (!step.changes.length) rows.push([context, '비교 조문 없음', '비교 조문 없음', source]);
    if (event.headline) foot.push(event.headline);
    if (event.summary) foot.push(`요약: ${event.summary}`);
    if (step.reason) foot.push(`개정 이유: ${step.reason}`);
    for (const addendum of step.addenda) foot.push([addendum.부칙, ...addendum.내용].join('\n'));
    foot.push(source);
    sections.push({
      title: `「${event.law}」 · ${fmtDate(event.date)} 시행`,
      intro: [`개정 ID: ${event.id} · 비교 기준: ${step.base ? fmtDate(step.base) : '정보 없음'} · 비교 조문 ${step.changes.length}개`, promulgationsText(event)],
      rows, foot,
    });
  }
  const stats = selectedLawExportStats(data);
  return compareDocx({
    title: '선택 법령 개정 신구대조표',
    intro: [`법령 ${stats.lawCount}개 · 선택 개정 ${stats.eventCount}건 · 비교 조문 ${stats.changeCount}개`, SELECTED_LAWS_DISCLAIMER,
      '긴 조문은 본문 번호 순서대로 이어 읽습니다. 분할된 개정 전·후 열은 각각 원문 순서이며, 같은 행이 문장별 대응을 뜻하지는 않습니다.'],
    head: ['법령·시행일·조문', '개정 전 (원문)', '개정 후 (원문)', '공포·출처'],
    widths: [2300, 4850, 4850, 3000], sections, foot: [],
  });
}
