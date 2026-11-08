// 근로계약서 작성 ↔ 최근 입력(tool-history) — 순수 TS(시험이 tsx 를 import 하지 않게 컴포넌트와 나눈다).
// 남기는 칸 = WriteState 전부에서 작성일(writtenDate)만 뺀 것. 불러오면 작성일은 비어(= 오늘) 다시 적힌다.
// 계산 결과는 남기지 않는다 — 불러오면 지금 규칙으로 다시 계산된다.
// 🔒 서버로 보내는 코드가 없다(시험으로 고정).

import { ITEM_LABEL, type ItemKey } from '@/lib/contract-write/design';
import { cleanInput } from '@/lib/contract-write/text';
import { stripIdNumbers } from '@/lib/leave/leave-workspaces';

import { INITIAL, WEEK_DAYS, type WriteState } from './formState';

export const HISTORY_TOOL = 'contract-write';

/** 최근 입력 영역 화면 문구 — 금지어 시험이 여기를 본다 */
export const HISTORY_COPY = {
  summary: '최근 입력 (선택)',
  intro: '계약서 파일을 내려받을 때의 입력을 최근 5건까지 둡니다. 작성일은 두지 않아, 불러오면 작성일이 오늘로 적힙니다. 서버로 보내지 않습니다.',
  load: (label: string) => `${label} 입력 불러오기`,
  loaded: (label: string) => `「${label}」 입력을 불러왔습니다. 작성일은 오늘로 적힙니다.`,
  remember: '이 브라우저에 최근 입력 기억하기',
  rememberOff: '이 탭을 닫으면 최근 입력이 사라집니다.',
  rememberOn: '이 브라우저에만 남습니다. 서버로 보내지 않습니다.',
  clear: '최근 입력 지우기',
} as const;

export type HistoryState = Omit<WriteState, 'writtenDate'>;
type HistoryKey = keyof HistoryState;

/** 남길 칸 — INITIAL 의 칸 순서 그대로, 작성일만 뺀다 */
const HISTORY_KEYS = (Object.keys(INITIAL) as (keyof WriteState)[]).filter((k): k is HistoryKey => k !== 'writtenDate');

/** 선택지 칸(문자열 리터럴 합집합)은 허용 값만 받는다. WriteState 에 선택지 칸이 늘면 여기에 넣으라고 tsc 가 멈춘다 */
type ChoiceKey = { [K in keyof WriteState]: string extends WriteState[K] ? never : WriteState[K] extends string ? K : never }[keyof WriteState];
const CHOICES: { [K in ChoiceKey]: readonly WriteState[K][] } = {
  fivePlus: ['yes', 'no'],
  probation: ['none', 'yes'],
  probationReduced: ['no', 'yes'],
  simpleLabor: ['no', 'yes'],
  weeklyRestDay: WEEK_DAYS,
  payType: ['monthly', 'hourly'],
  amountMode: ['gross', 'net'],
  absentWeekHoliday: ['deduct', 'keep'],
  rounding: ['won', 'ceil10', 'ceil100'],
  absorbInto: Object.keys(ITEM_LABEL) as ItemKey[],
};

const isWeekDay = (v: unknown): v is string => typeof v === 'string' && (WEEK_DAYS as readonly string[]).includes(v);

/** 남길 값 — 화이트리스트 칸만 옮긴다(입력 객체에 다른 칸이 섞여 있어도 남기지 않는다) */
export function toHistoryState(s: WriteState): HistoryState {
  const out: Record<string, unknown> = {};
  for (const k of HISTORY_KEYS) {
    const v = s[k];
    out[k] = Array.isArray(v) ? [...v] : stripIdNumbers(v);
  }
  return out as HistoryState;
}

/** 목록에 보일 이름표 */
export function historyLabel(s: WriteState): string {
  return stripIdNumbers(`${cleanInput(s.employeeName) || '이름 없음'} · ${s.startDate} · ${cleanInput(s.workplaceName)}`);
}

/** 저장 시각(ISO) → 한국 시각 「YYYY-MM-DD HH:mm」. 읽을 수 없으면 빈 문자열 */
export function savedAtText(iso: string): string {
  const kst = new Date(Date.parse(iso) + 9 * 3_600_000);
  return Number.isNaN(kst.getTime()) ? '' : kst.toISOString().slice(0, 16).replace('T', ' ');
}

/**
 * 남긴 값을 입력으로 되살린다 — INITIAL 위에 저장된 칸만 덮는다.
 * 모르는 칸은 무시하고, 타입이 틀리거나 선택지 밖인 칸은 버린다(INITIAL 값이 남는다). 작성일은 언제나 비운다.
 */
export function fromHistoryState(saved: unknown): WriteState {
  const next: WriteState = { ...INITIAL, workDays: [...INITIAL.workDays] };
  if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) return next;
  const r = saved as Record<string, unknown>;
  const out = next as unknown as Record<string, unknown>;
  const choices = CHOICES as Partial<Record<HistoryKey, readonly string[]>>;
  for (const k of HISTORY_KEYS) {
    const v = r[k];
    if (k === 'workDays') {
      if (Array.isArray(v)) next.workDays = [...new Set(v.filter(isWeekDay))];
      continue;
    }
    const allowed = choices[k];
    if (allowed ? typeof v === 'string' && allowed.includes(v) : typeof v === 'string') out[k] = v;
  }
  return next;
}
