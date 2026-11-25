// engine.bundle.mjs(scripts/build-toego-browser.mjs 가 만드는 브라우저 묶음, 저장소에 올리지 않음)의 타입.
// 원본은 src/lib/toego/entry.mjs — 응답 모양은 엔진 runToego(tools/k-labor/lib/prose/toego.mjs)와 같다.
import type { EngineHit } from './highlight';

export type ToegoGenre = 'legal' | 'consulting' | 'lecture' | 'general' | 'official';

export interface ProseResult {
  ok: boolean;
  error?: string;
  genre?: string;
  requestedGenre?: string;
  counts: { A: number; B: number };
  hits: EngineHit[];
  notes: { kind: string; text: string }[];
  packCount: number;
  packs?: string[];
  truncated?: boolean;
  incomplete?: boolean;
  skipped?: { code: string }[];
}

export interface NormsPart {
  counts: { A: number; B: number };
  hits: EngineHit[];
  truncated?: boolean;
}

export interface NormsResult {
  ok: boolean;
  error?: string;
  spacing: NormsPart;
  punct: NormsPart;
  comma: NormsPart;
}

export interface ToegoResult {
  ok: boolean;
  /** INVALID_ARGS · 주민등록번호 멈춤 문구 */
  error?: string;
  /** 빈 글 · 40만 자 초과 */
  reason?: string;
  rrnLines?: number[];
  /** 멈춤(빈 글·40만 자 초과·주민등록번호 모양)에는 없다 */
  prose?: ProseResult;
  norms?: NormsResult;
}

export const TOEGO_GENRES: ToegoGenre[];
export const GENERIC_INFO: { pack: string; version: string; ruleCount: number; grades: string[] };
export function runToegoBrowser(raw: { text: string; genre?: ToegoGenre }): ToegoResult;
