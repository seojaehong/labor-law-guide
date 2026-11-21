// 판례·판정례·행정해석 상세의 복사·내려받기 글자를 만든다.
// 본문은 서버가 그린 화면(data-export 표지)에서 클릭 시점에 모은다 — 여기 함수는 DOM 을 직접 만지지 않는다.
// AI 정리는 어떤 형식으로 나가든 「AI 정리 · 원문 아님」 표시를 달고, 인용부호로 원문처럼 싸지 않는다.

export type ExportKind = 'court' | 'nlrc' | 'interpretation';
export type TextKind = '원문' | '정리본';

export interface ExportMeta {
  id: string;
  kind: ExportKind;
  title: string;
  /** 법원·위원회·기관 이름 */
  court: string | null;
  /** YYYY-MM-DD (decisionDate 로 정리한 값) */
  date: string | null;
  caseNumber: string | null;
  /** publicSourceUrl 을 거친 공식 출처만 */
  sourceUrl: string | null;
  pageUrl: string;
  textKind: TextKind;
}

export interface ExportBlock {
  title: string;
  text: string;
  isAi: boolean;
  /** 판결문 머리(사건·당사자 표시) — 제목 줄 없이 쓴다 */
  head?: boolean;
}

export interface ExportSummary {
  label: string;
  text: string;
  isAi: boolean;
}

export type RoledExportBlock = ExportBlock & { roles: readonly string[] };

export type ExportRole = 'section' | 'summary' | 'section summary';

/** 서버 화면에 다는 복사·내려받기 표지. 본문 글자를 담는 가장 안쪽 상자에 단다(제목·안내 문구는 밖에 둔다). */
export function exportAttrs(role: ExportRole, title: string, isAi: boolean, head = false): {
  'data-export': ExportRole;
  'data-export-title': string;
  'data-export-ai': 'true' | 'false';
  'data-export-kind'?: 'head';
} {
  return {
    'data-export': role,
    'data-export-title': title,
    'data-export-ai': isAi ? 'true' : 'false',
    ...(head ? { 'data-export-kind': 'head' as const } : {}),
  };
}

const DOC_NAME: Record<ExportKind, string> = { court: '판결문', nlrc: '판정문', interpretation: '행정해석' };
const DATE_WORD: Record<ExportKind, string> = { court: '선고', nlrc: '판정', interpretation: '회신' };

export function aiNotice(kind: ExportKind): string {
  return `(AI 정리 · ${DOC_NAME[kind]} 원문 아님)`;
}

/** 2020-01-05 → 2020. 1. 5. (읽을 수 없으면 빈 문자열) */
export function citationDate(date: string | null | undefined): string {
  const m = typeof date === 'string' ? date.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
  return m ? `${m[1]}. ${Number(m[2])}. ${Number(m[3])}.` : '';
}

function clean(value: string | null | undefined): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

/** 사무소 인용 형식의 첫 줄 */
export function citationHeader(meta: ExportMeta): string {
  const court = clean(meta.court);
  const number = clean(meta.caseNumber);
  const date = citationDate(meta.date);
  if (meta.kind === 'interpretation') {
    return `[관련 행정해석] ${number || clean(meta.title)}${date ? ` (${date})` : ''}`;
  }
  if (meta.kind === 'nlrc') {
    return ['[관련 판정]', court, date, number, '판정'].filter(Boolean).join(' ');
  }
  if (!court && !number) return `[관련 판결] ${clean(meta.title)}`.trim();
  return ['[관련 판결]', court, date ? `${date} 선고` : '', number, '판결'].filter(Boolean).join(' ');
}

export function blockLabel(block: Partial<ExportBlock> & { title: string }): string {
  return clean(block.title) || (block.head ? '머리' : '본문');
}

export function metaHeaderLines(meta: ExportMeta): string[] {
  const date = citationDate(meta.date);
  const line = [clean(meta.court), date ? `${date} ${DATE_WORD[meta.kind]}` : '', clean(meta.caseNumber)].filter(Boolean).join(' · ');
  return [
    clean(meta.title),
    line,
    meta.sourceUrl ? `원문 출처: ${meta.sourceUrl}` : '',
    `페이지: ${meta.pageUrl}`,
  ].filter(Boolean);
}

function blockText(block: ExportBlock, kind: ExportKind): string {
  if (block.head && !clean(block.title)) return block.text;
  return `[${blockLabel(block)}]${block.isAi ? ` ${aiNotice(kind)}` : ''}\n${block.text}`;
}

function summaryBlockText(summary: ExportSummary, kind: ExportKind): string {
  return `[${summary.label}]${summary.isAi ? ` ${aiNotice(kind)}` : ''}\n${summary.text}`;
}

/** 전문 복사 — 메타 머리줄 + 모든 절 */
export function buildFullText(meta: ExportMeta, blocks: ExportBlock[]): string {
  return [metaHeaderLines(meta).join('\n'), ...blocks.map((b) => blockText(b, meta.kind))].join('\n\n');
}

/** 요지 복사 — AI 정리면 맨 앞에 표시를 붙인다 */
export function buildSummaryText(meta: ExportMeta, summary: ExportSummary): string {
  return `${summary.isAi ? `${aiNotice(meta.kind)} ` : ''}${summary.label}\n${summary.text}`;
}

/** 인용 형식 복사 — 선택이 비었으면 null */
export function buildCitationText(meta: ExportMeta, selection: string, containsAi: boolean): string | null {
  const text = normalizeExportText(selection);
  if (!text) return null;
  return [citationHeader(meta), containsAi ? aiNotice(meta.kind) : '', text].filter(Boolean).join('\n');
}

export function buildSelectedText(
  meta: ExportMeta,
  { includeMeta, blocks, summary }: { includeMeta: boolean; blocks: ExportBlock[]; summary: ExportSummary | null },
): string {
  return [
    includeMeta ? metaHeaderLines(meta).join('\n') : '',
    ...blocks.map((b) => blockText(b, meta.kind)),
    summary ? summaryBlockText(summary, meta.kind) : '',
  ].filter(Boolean).join('\n\n');
}

export function combineSummaries(blocks: ExportBlock[]): ExportSummary | null {
  if (blocks.length === 0) return null;
  if (blocks.length === 1) return { label: blockLabel(blocks[0]), text: blocks[0].text, isAi: blocks[0].isAi };
  return {
    label: '요지',
    text: blocks.map((b) => `[${blockLabel(b)}]\n${b.text}`).join('\n\n'),
    isAi: blocks.some((b) => b.isAi),
  };
}

/** 화면 표지(section·summary 역할)를 절 목록과 요지로 나눈다. summaryOnly = 절에 이미 없는 요지 */
export function splitExportBlocks(blocks: RoledExportBlock[]): {
  sections: ExportBlock[];
  summary: ExportSummary | null;
  summaryOnly: ExportSummary | null;
} {
  const strip = (b: RoledExportBlock): ExportBlock => ({ title: b.title, text: b.text, isAi: b.isAi, ...(b.head ? { head: true } : {}) });
  const sections = blocks.filter((b) => b.roles.includes('section')).map(strip);
  const summaries = blocks.filter((b) => b.roles.includes('summary'));
  return {
    sections,
    summary: combineSummaries(summaries.map(strip)),
    summaryOnly: combineSummaries(summaries.filter((b) => !b.roles.includes('section')).map(strip)),
  };
}

/** 2026-11-21T12:04:05+09:00 */
export function kstIsoString(now: Date): string {
  return `${new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 19)}+09:00`;
}

const yaml = (value: string | null) => (value === null ? 'null' : JSON.stringify(value));

export function toMarkdown(meta: ExportMeta, blocks: ExportBlock[], summary: ExportSummary | null, now: Date): string {
  const front = [
    '---',
    `title: ${yaml(meta.title)}`,
    `court: ${yaml(meta.court)}`,
    `date: ${yaml(meta.date)}`,
    `case_number: ${yaml(meta.caseNumber)}`,
    `source_url: ${yaml(meta.sourceUrl)}`,
    `page_url: ${yaml(meta.pageUrl)}`,
    `text_kind: ${yaml(meta.textKind)}`,
    `exported_at: ${yaml(kstIsoString(now))}`,
    '---',
  ].join('\n');
  const parts = [`# ${clean(meta.title)}`];
  for (const block of blocks) {
    if (block.head && !clean(block.title)) {
      parts.push(block.text);
      continue;
    }
    parts.push(`## ${blockLabel(block)}`);
    if (block.isAi) parts.push(aiNotice(meta.kind));
    parts.push(block.text);
  }
  if (summary) {
    parts.push(`## ${summary.label}`);
    if (summary.isAi) parts.push(aiNotice(meta.kind));
    parts.push(summary.text);
  }
  return `${front}\n\n${parts.join('\n\n')}\n`;
}

export function toJsonl(meta: ExportMeta, blocks: ExportBlock[], summary: ExportSummary | null): string {
  return `${JSON.stringify({
    id: meta.id,
    title: meta.title,
    court: meta.court,
    date: meta.date,
    case_number: meta.caseNumber,
    source_url: meta.sourceUrl,
    page_url: meta.pageUrl,
    text_kind: meta.textKind,
    sections: blocks.map((b) => ({ title: blockLabel(b), text: b.text, is_ai: b.isAi })),
    summary: summary ? { label: summary.label, text: summary.text, is_ai: summary.isAi } : null,
  })}\n`;
}

function fileNamePart(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._\s]+|[._\s]+$/g, '')
    .slice(0, 80);
}

/** 법원_사건번호.md — 둘 중 없는 것은 문서 id 로 채운다 */
export function exportFileName(meta: ExportMeta, ext: 'md' | 'jsonl'): string {
  const court = fileNamePart(meta.court);
  const number = fileNamePart(meta.caseNumber) || fileNamePart(meta.id) || 'document';
  return `${[court, number].filter(Boolean).join('_')}.${ext}`;
}

export function normalizeExportText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** DOM 노드가 갖춘 것 중 글자 모으기에 쓰는 부분만 (시험에서는 평범한 객체로 흉내 낸다) */
export interface ExportNode {
  nodeType: number;
  nodeName: string;
  nodeValue: string | null;
  childNodes: ArrayLike<ExportNode>;
  getAttribute?: (name: string) => string | null;
}

const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DETAILS', 'DIV', 'DL', 'DT', 'FIGCAPTION', 'FIGURE', 'FOOTER',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'OL', 'P', 'PRE', 'SECTION',
  'TABLE', 'TBODY', 'TFOOT', 'THEAD', 'TR', 'UL',
]);
const SKIP_TAGS = new Set(['BUTTON', 'INPUT', 'NOSCRIPT', 'SCRIPT', 'STYLE', 'SUMMARY', 'SVG', 'TEMPLATE']);

function skipped(node: ExportNode): boolean {
  const attr = (name: string) => node.getAttribute?.(name) ?? null;
  return (
    attr('data-export-skip') !== null ||
    attr('aria-hidden') === 'true' ||
    attr('data-footnote-backref') !== null ||
    (attr('class') ?? '').split(/\s+/).includes('sr-only')
  );
}

/** 화면 글자를 블록 경계(문단·목록·표 행)에서 줄을 바꿔 모은다. textContent 는 형제 문단을 붙여 버린다. */
export function collectNodeText(root: ExportNode): string {
  let out = '';
  const breakLine = () => {
    if (out && !out.endsWith('\n')) out += '\n';
  };
  const walk = (node: ExportNode) => {
    if (node.nodeType === 3) {
      out += node.nodeValue ?? '';
      return;
    }
    if (node.nodeType !== 1) return;
    const name = node.nodeName.toUpperCase();
    if (SKIP_TAGS.has(name) || skipped(node)) return;
    if (name === 'BR') {
      out += '\n';
      return;
    }
    const block = BLOCK_TAGS.has(name);
    if (block) breakLine();
    let cell = 0;
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i];
      if (name === 'TR' && child.nodeType === 1 && /^T[DH]$/i.test(child.nodeName)) {
        if (cell++ > 0) out += '\t';
      }
      walk(child);
    }
    if (block) breakLine();
  };
  walk(root);
  return normalizeExportText(out);
}

export interface HeadLineParts {
  label: string;
  gap: string;
  value: string;
}

/** 판결문 머리 한 줄을 「표제 · 값」으로 나눈다. gap 은 원문 공백 그대로 — 화면 글자를 모으면 원래 줄이 된다. */
export function splitHeadLine(line: string): HeadLineParts | null {
  if (!line.trim()) return null;
  const indented = line.match(/^([ \t　]+)(\S.*)$/);
  if (indented) return { label: '', gap: indented[1], value: indented[2] };
  // 「사       건」「원 고」처럼 한 글자씩 띄운 표제
  const spaced = line.match(/^((?:[가-힣][ 　]+)+[가-힣])([ \t　]+)(\S.*)$/);
  if (spaced) return { label: spaced[1], gap: spaced[2], value: spaced[3] };
  const wide = line.match(/^(\S(?:[^\t]*?\S)?)(\t+|[ 　]{2,})(\S.*)$/);
  if (wide && wide[1].length <= 20) return { label: wide[1], gap: wide[2], value: wide[3] };
  return null;
}
