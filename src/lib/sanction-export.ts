// 양정 판결 골라 내려받기(261123) — 사용자가 고른 판결 몇 건을 의견서에 바로 쓰는 꼴로 묶는다.
// md·jsonl·AI 붙여넣기는 MCP 도구와 같은 형식(tools/k-labor/lib/sanction-format.mjs 한 벌).
// hwpx 는 한글 엔진(md-hwpx) S4 인용 블록 = 태광 정본 [관련 판결] 서식(휴먼고딕 11pt·줄간격 180%·머리줄 굵게). 글꼴만 고를 수 있다.
// ★ 판결 원문(block_body·long_text)은 한 글자도 바꾸지 않는다. 우리 문구(안내 한 줄)는 인용 밖 문단에 둔다.
import { blockHeader, toAiPaste, toJsonl, toMarkdown } from '../../tools/k-labor/lib/sanction-format.mjs';

export type SanctionRow = {
  id: string;
  court: string;
  case_number: string;
  decided_on?: string | null;
  type: string;
  disposition?: string | null;
  sanction?: string | null;
  block_status?: string | null;
  block_body?: string | null;
  long_text?: string | null;
  quote?: string | null;
  [k: string]: unknown;
};

export type SanctionFormat = 'hwpx' | 'md' | 'jsonl' | 'ai';

export const SANCTION_FONTS = [
  { id: 'canon', label: '우리 정본 서식(휴먼고딕)', face: '휴먼고딕' },
  { id: 'myeongjo', label: '휴먼명조', face: '휴먼명조' },
  { id: 'hamchorom', label: '함초롬바탕', face: '함초롬바탕' },
  { id: 'malgun', label: '맑은 고딕', face: '맑은 고딕' },
] as const;
export type SanctionFontId = (typeof SANCTION_FONTS)[number]['id'];

const isBlock = (r: SanctionRow) => r.block_status === 'pass' && !!r.block_body;
const isLong = (r: SanctionRow) => r.block_status === 'long_judgment' && !!r.long_text;

/** 고를 수 있는 판결 = 검수 통과 블록 또는 긴 판단(원문 전체) */
export const selectable = (r: SanctionRow) => isBlock(r) || isLong(r);

export const LONG_NOTE = '※ 아래 판결은 양정 판단이 한 문장으로 길어 10줄 블록에 싣지 않고 판단 원문 전체를 실었습니다.';

/** hwpx 원고 — 판결마다 머리줄과 원문 줄을 모두 인용(>)으로. 판결 사이는 빈 인용 문단 하나(md 빈 줄은 엔진이 지운다) */
export function selectionHwpxMd(rows: SanctionRow[]): string {
  const out: string[] = [];
  for (const r of rows.filter(selectable)) {
    if (out.length) out.push('>', '');
    const text = isBlock(r) ? r.block_body! : r.long_text!;
    if (!isBlock(r)) out.push(LONG_NOTE, '');
    out.push(`> ${blockHeader(r)}`, ...text.split('\n').map((l) => (l ? `> ${l}` : '>')));
  }
  return out.join('\n') + '\n';
}

const stamp = () => {
  const d = new Date(Date.now() + 9 * 3600_000);
  return `${d.getUTCFullYear() % 100}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
};

export async function exportSelection(
  rows: SanctionRow[],
  format: SanctionFormat,
  opts: { font?: SanctionFontId } = {},
): Promise<{ filename: string; bytes?: Uint8Array; text?: string; mime: string }> {
  const picked = rows.filter(selectable);
  if (!picked.length) throw new Error('고른 판결이 없습니다.');
  const base = `관련판결_${picked.length}건_${stamp()}`;
  if (format === 'hwpx') {
    const face = (SANCTION_FONTS.find((f) => f.id === (opts.font ?? 'canon')) ?? SANCTION_FONTS[0]).face;
    const { mdToHwpx } = await import('@/lib/md-hwpx');
    const bytes = await mdToHwpx(selectionHwpxMd(picked), { preset: 'internal', pageBreak: false, features: { quote: true, quoteFont: face } });
    return { filename: `${base}.hwpx`, bytes, mime: 'application/hwp+zip' };
  }
  if (format === 'md') return { filename: `${base}.md`, text: toMarkdown(picked), mime: 'text/markdown;charset=utf-8' };
  if (format === 'jsonl') return { filename: `${base}.jsonl`, text: toJsonl(picked), mime: 'application/x-ndjson;charset=utf-8' };
  return { filename: `${base}.txt`, text: toAiPaste(picked), mime: 'text/plain;charset=utf-8' };
}
