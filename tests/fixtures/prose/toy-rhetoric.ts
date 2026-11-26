// AI 수사 검사(check_rhetoric) 장난감 팩 절 — 공개 시험용. 실제 팩의 식·낱말·규칙·결정표와 닮지 않게 일부러 지었다.
// 글자는 뜻 없는 합성 음절(퀩·뷁·쀼·꿿·뛣), 문장 끝은 「;」, 칸·보기·표 이름은 번호(r..·w..·v..·k..·t1~t5)다.
// 코드가 직접 쓰는 칸(RHETORIC_CODE_RE·RHETORIC_CODE_WORDS)은 아래 몇 개만 살리고 나머지는 늘 실패하는 식으로 둔다.
import { RHETORIC_CODE_RE, RHETORIC_CODE_WORDS } from '../../../tools/k-labor/lib/prose/rhetoric.mjs';

export const NEVER = '(?!x)x';
export const NO = ['not', ['1']];

export type ToyRule = {
  id: string;
  family: string;
  re: string;
  flags: string;
  grades: Record<string, string | null>;
  alt: string;
  unit: unknown;
  steps: unknown[];
};

export const toyRule = (o: Partial<ToyRule> = {}): ToyRule => ({
  id: 'k-1', family: 'f-1', re: '퀩뷁', flags: '', grades: { legal: 'A', blog: 'B' }, alt: 'a-1', unit: null, steps: [], ...o,
});

export type ToySection = Record<string, unknown> & {
  re: Record<string, [string, string]>;
  words: Record<string, unknown>;
  rules: ToyRule[];
};

export function toyRhetoric(over: Partial<ToySection> = {}): ToySection {
  const re: Record<string, [string, string]> = {};
  for (const k of RHETORIC_CODE_RE as readonly string[]) re[k] = [NEVER, ''];
  re.r08 = [';\\s*$', '']; // 줄 끝 문장 끝
  re.r09 = ['[;,\\s]+', '']; // 부호만 있는 줄
  re.r29 = [';', '']; // 문장 끝
  re.r39 = ['[^;]+;?', '']; // 문장 조각
  re.r42 = ['#', '']; // 제목 줄
  re.r46 = ['\\{([^{}\\s]{1,4})\\}', '']; // 가림 — 묶음만 남긴다
  re.r47 = ['<<[^<>]{0,40}>>', '']; // 가림 — 같은 길이로 덮는다
  re.r48 = ['~+$', '']; // 끝 장식
  re.r49 = [NEVER, ''];
  const words: Record<string, unknown> = {};
  (RHETORIC_CODE_WORDS as readonly string[]).forEach((k, i) => { words[k] = `z${i + 1}`; });
  words.w01 = '@@';
  return {
    format: 2,
    version: 'v-toy',
    pred: {
      p1: { args: ['a1', 'a2'], cond: NO },
      p2: { args: ['a1', 'a2'], cond: NO },
      p3: { args: ['a1'], cond: ['ew', ['st', 'a1'], ['q', ';']] },
    },
    mask: [['r46', 'grp', 1], ['r47', 'keep', 6]],
    tail: ['r48', 'r49', ' ;'],
    t1: { groups: [1, 2, 3], chars: [', ', ' ;'], chain: [[NO, 'x']] },
    t2: [[NO, 'x']],
    t3: [[NO, 'c']],
    t4: NO,
    t5: 1,
    promote: [],
    ...over,
    re: { ...re, ...(over.re ?? {}) },
    words: { ...words, ...(over.words ?? {}) },
    rules: over.rules ?? [toyRule()],
  } as ToySection;
}
