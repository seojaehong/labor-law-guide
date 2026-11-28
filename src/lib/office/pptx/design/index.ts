// 덱 디자인 프리셋 — 「디자인 = 제목 영역 모양 + 색·글자 토큰 + 장 코드별 부품 배치」를 데이터로 둔다.
// 값의 정본은 같은 폴더 presets/*.json(1920×1080px 시안 좌표). 슬라이드 인치 환산은 designScale 한 곳에서만 한다.
// 시안 5종(quiet·field·app·report·story)은 2026-11-28 채택본(deck_comps c1~c5)에서 옮겼다.
// 원리 참고: 장 배치 「부품 + 규격 데이터」 분리 · 제목 영역 분리 · 넘침 순서 고정 · needs 거르기(벤치마킹 보고서 §6 1·2·3·14).
// fs·네트워크 없음.
import QUIET from './presets/quiet.json';
import FIELD from './presets/field.json';
import APP from './presets/app.json';
import REPORT from './presets/report.json';
import STORY from './presets/story.json';
import { capacityOf, textUnits } from '../text-units';
import type { MeetingSnapshot } from '../meeting';
import type { TbmSnapshot } from '../tbm';
import type { EducationSnapshot } from '../education';
import { b3LongFields } from './b3-geometry';

export const DESIGN_IDS = Object.freeze(['quiet', 'field', 'app', 'report', 'story'] as const);
export type DesignId = (typeof DESIGN_IDS)[number];

export type HeadShape = 'plain' | 'left-band' | 'pill-meta' | 'ribbon' | 'capsule';
export type B1Part = 'kpi-hero-list' | 'tile-grid' | 'chip-grid' | 'summary-table' | 'before-after';
export type B3Part = 'hairline-table' | 'row-cards' | 'checklist-cards' | 'report-grid' | 'deadline-timeline';
/** 넘침 처리 순서 — 축약 표시(경고만, 글자는 자르지 않음) → 한 번만 축소 → 「외 N건」 → 다음 장 */
export type OverflowStep = 'abbreviate' | 'shrink-once' | 'more-count' | 'next-slide';
export const OVERFLOW_ORDER: readonly OverflowStep[] = Object.freeze(['abbreviate', 'shrink-once', 'more-count', 'next-slide']);

// positive·caution·negative = 상태 글자색(완료·변경/재조치·미완료). 프리셋 바탕에서 대비 4.5:1 을 넘는 값(회의 덱 의미색은 프리셋 바탕에서 모자란다)
export const COLOR_KEYS = ['bg', 'surface', 'band', 'ink', 'ink2', 'line', 'rule', 'accent', 'accentText', 'onAccent', 'risk', 'positive', 'caution', 'negative'] as const;
export type DesignColorKey = (typeof COLOR_KEYS)[number] | 'headBand' | 'onHeadBand';

/** 좌표·크기는 모두 1920×1080 시안 px */
export interface DesignHead {
  shape: HeadShape;
  left: number;
  right: number;
  metaY: number;
  metaH: number;
  titleY: number;
  titleH: number;
  /** 제목을 한 번 줄일 때의 하한(px). 실제 하한은 이 값과 20pt 중 큰 것 */
  titleMinPx: number;
  titleColor: DesignColorKey;
  titleSerif?: boolean;
  leadY: number;
  leadH: number;
  bodyTop: number;
  bodyTopWithLead: number;
  bandW?: number;
  bandNumberPx?: number;
  bandNumberY?: number;
  ribbonH?: number;
  headlineY?: number;
  headlineH?: number;
}

export interface DesignSlotB1 {
  part: B1Part;
  x: number; y: number; w: number; h: number;
  minW: number; minH: number;
  /** 이 부품이 담는 요약 수 최대 개수 */
  maxItems: number;
  needs: string[];
  /** 분수(「1/2」) 같은 요약 수가 들어가는 칸 폭과 글자 크기(px) */
  valueBoxW: number;
  valuePx: number;
  valueMinPx: number;
  noteY: number;
}

export interface DesignSlotB3 {
  part: B3Part;
  x: number; w: number;
  minW: number; minH: number;
  /** 한 장에 싣는 대책 수(보통 크기) */
  maxItems: number;
  /** 한 번 축소했을 때 한 장에 싣는 대책 수 */
  shrunkMaxItems: number;
  needs: string[];
  itemH: number;
  itemHShrunk: number;
  gap?: number;
  textPx: number;
  textPxShrunk: number;
  cols: number[];
  measureW: number;
  measureMaxLines: number;
  dateBoxW: number;
  datePx: number;
}

export interface DeckDesign {
  id: DesignId;
  name: string;
  source: string;
  head: DesignHead;
  foot: { y: number; h: number; rule: boolean; rulePx: number; color: DesignColorKey };
  tokens: {
    /** # 없는 6자리 hex */
    colors: Record<(typeof COLOR_KEYS)[number], string> & Partial<Record<'headBand' | 'onHeadBand', string>>;
    /** px */
    type: { meta: number; title: number; label: number; body: number; table: number; num: number; hero: number; note: number };
    lines: { hair: number; rule: number; heavy: number };
    radius: { card: number };
  };
  /** 글자–바탕 짝(대비 4.5:1 이상이어야 하는 것만). 위험 점처럼 글자가 아닌 표시는 넣지 않는다 */
  textPairs: [DesignColorKey, DesignColorKey][];
  slots: { B1: DesignSlotB1; B3: DesignSlotB3 };
  overflowOrder: OverflowStep[];
  unverified?: string[];
}

const PRESETS: Record<DesignId, DeckDesign> = {
  quiet: QUIET as unknown as DeckDesign,
  field: FIELD as unknown as DeckDesign,
  app: APP as unknown as DeckDesign,
  report: REPORT as unknown as DeckDesign,
  story: STORY as unknown as DeckDesign,
};

export function isDesignId(v: unknown): v is DesignId {
  return typeof v === 'string' && (DESIGN_IDS as readonly string[]).includes(v);
}

/** 프리셋 하나(복사본). 없는 이름이면 throw */
export function getDeckDesign(id: DesignId): DeckDesign {
  if (!isDesignId(id)) throw new Error(`design ${String(id)} 은 ${DESIGN_IDS.join('·')} 중 하나`);
  return structuredClone(PRESETS[id]);
}

const HEX6 = /^[0-9A-F]{6}$/;
const HEADS: HeadShape[] = ['plain', 'left-band', 'pill-meta', 'ribbon', 'capsule'];
const B1_PARTS: B1Part[] = ['kpi-hero-list', 'tile-grid', 'chip-grid', 'summary-table', 'before-after'];
const B3_PARTS: B3Part[] = ['hairline-table', 'row-cards', 'checklist-cards', 'report-grid', 'deadline-timeline'];

/** 프리셋 형식 검사 — 빈 배열이면 통과 */
export function designErrors(d: unknown): string[] {
  const e: string[] = [];
  const o = d as Partial<DeckDesign> | null;
  if (!o || typeof o !== 'object') return ['design 은 객체여야 한다'];
  if (!isDesignId(o.id)) e.push(`id ${String(o.id)} 은 ${DESIGN_IDS.join('·')} 중 하나`);
  if (typeof o.name !== 'string' || !o.name) e.push('name 없음');
  const num = (v: unknown, path: string, min = 0, max = 1920) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) e.push(`${path} 은 ${min}~${max} 숫자`);
  };
  const h = o.head;
  if (!h || typeof h !== 'object') e.push('head 없음');
  else {
    if (!HEADS.includes(h.shape)) e.push(`head.shape ${String(h.shape)} 은 ${HEADS.join('·')} 중 하나`);
    for (const k of ['left', 'right', 'metaY', 'metaH', 'titleY', 'titleH', 'titleMinPx', 'leadY', 'leadH', 'bodyTop', 'bodyTopWithLead'] as const) num(h[k], `head.${k}`);
    if (h.left >= h.right) e.push('head.left 는 right 보다 작아야 한다');
    if (h.bodyTopWithLead < h.bodyTop) e.push('head.bodyTopWithLead 는 bodyTop 이상');
    if (h.shape === 'left-band' && !(h.bandW && h.bandW < h.left)) e.push('left-band 는 bandW < left');
    if (h.shape === 'ribbon' && !h.ribbonH) e.push('ribbon 은 ribbonH 필요');
  }
  const f = o.foot;
  if (!f || typeof f !== 'object') e.push('foot 없음');
  else num(f.y, 'foot.y', 600, 1080);
  const t = o.tokens;
  if (!t || typeof t !== 'object' || !t.colors || !t.type) e.push('tokens(colors·type) 없음');
  else {
    for (const k of COLOR_KEYS) if (typeof t.colors[k] !== 'string' || !HEX6.test(t.colors[k])) e.push(`tokens.colors.${k} 는 # 없는 대문자 6자리 hex`);
    for (const k of ['meta', 'title', 'label', 'body', 'table', 'num', 'hero', 'note'] as const) num(t.type[k], `tokens.type.${k}`, 16, 400);
    // 표·바닥줄 글자 하한(rules.json reading 하한: 표 10pt·출처 8pt = 16:9 기준 20px·16px)
    if (t.type.table < 20) e.push('tokens.type.table 은 20px(10pt) 이상');
  }
  if (!Array.isArray(o.textPairs) || !o.textPairs.length) e.push('textPairs 없음');
  else for (const p of o.textPairs) if (!Array.isArray(p) || p.length !== 2 || !t?.colors || !(t.colors as Record<string, string>)[p[0]] || !(t.colors as Record<string, string>)[p[1]]) e.push(`textPairs ${JSON.stringify(p)} 는 있는 색 두 개`);
  const s = o.slots as Partial<DeckDesign['slots']> | undefined;
  if (!s || typeof s !== 'object') e.push('slots 없음');
  else {
    if (!s.B1) e.push('slots.B1 없음');
    else {
      if (!B1_PARTS.includes(s.B1.part)) e.push(`slots.B1.part ${String(s.B1.part)} 모름`);
      if (!(s.B1.maxItems >= 4)) e.push('slots.B1.maxItems 는 4 이상(요약 수 4개)');
      if (!Array.isArray(s.B1.needs) || !s.B1.needs.length) e.push('slots.B1.needs 없음');
      for (const k of ['x', 'y', 'w', 'h', 'minW', 'minH', 'valueBoxW', 'valuePx', 'valueMinPx', 'noteY'] as const) num(s.B1[k], `slots.B1.${k}`);
      if (s.B1.w < s.B1.minW || s.B1.h < s.B1.minH) e.push('slots.B1 크기가 minW·minH 보다 작다');
      if (s.B1.valueMinPx > s.B1.valuePx) e.push('slots.B1.valueMinPx 는 valuePx 이하');
    }
    if (!s.B3) e.push('slots.B3 없음');
    else {
      if (!B3_PARTS.includes(s.B3.part)) e.push(`slots.B3.part ${String(s.B3.part)} 모름`);
      if (!(s.B3.maxItems >= 1) || !(s.B3.shrunkMaxItems >= s.B3.maxItems)) e.push('slots.B3 maxItems ≥ 1, shrunkMaxItems ≥ maxItems');
      if (!Array.isArray(s.B3.needs) || !s.B3.needs.length) e.push('slots.B3.needs 없음');
      for (const k of ['x', 'w', 'minW', 'minH', 'itemH', 'itemHShrunk', 'textPx', 'textPxShrunk', 'measureW', 'dateBoxW', 'datePx'] as const) num(s.B3[k], `slots.B3.${k}`);
      if (s.B3.w < s.B3.minW) e.push('slots.B3.w 가 minW 보다 작다');
      if (s.B3.textPxShrunk > s.B3.textPx) e.push('slots.B3.textPxShrunk 는 textPx 이하');
    }
  }
  if (JSON.stringify(o.overflowOrder) !== JSON.stringify(OVERFLOW_ORDER)) e.push(`overflowOrder 는 ${OVERFLOW_ORDER.join(' → ')}`);
  return e;
}

/** 시안 px → 슬라이드 인치·pt. 가로 폭 기준 한 배율(가로·세로 같음). 16:9(13.333in)에서 1px = 1/144in = 0.5pt */
export interface DesignScale {
  W: number;
  H: number;
  k: number;
  x(px: number): number;
  y(px: number): number;
  pt(px: number): number;
}
export function designScale(wIn: number, hIn: number): DesignScale {
  const k = wIn / 1920;
  return { W: wIn, H: hIn, k, x: (px) => px * k, y: (px) => px * k, pt: (px) => Math.round(px * k * 72 * 10) / 10 };
}

function lum(hex: string): number {
  const c = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
/** WCAG 대비(# 없는 6자리 hex 두 개) */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [lum(a.replace('#', '')), lum(b.replace('#', ''))].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** quiet 히어로(첫 요약 수) 칸 — 폭 600px · 보통 크기 tokens.type.hero · 한 번 줄일 때 하한 200px(c1 시안) */
export const HERO_BOX = Object.freeze({ wPx: 600, minPx: 200 });

/** 폭이 고정된 글자 칸 — 요약 수(「1/2」)와 기한(YYYY-MM-DD). capacityOf 로 한 줄 폭을 잰다. hero 는 kpi-hero-list 일 때만 */
export function fixedTextBoxes(d: DeckDesign, s: DesignScale) {
  return {
    kpiValue: { wIn: s.x(d.slots.B1.valueBoxW), pt: s.pt(d.slots.B1.valuePx) },
    date: { wIn: s.x(d.slots.B3.dateBoxW), pt: s.pt(d.slots.B3.datePx) },
    hero: d.slots.B1.part === 'kpi-hero-list' ? { wIn: s.x(HERO_BOX.wPx), pt: s.pt(d.tokens.type.hero) } : null,
  };
}

/** 한 줄 칸에 글이 들도록 한 번만 줄인 크기. 하한 아래로는 줄이지 않는다(그때 fits=false) */
export function shrinkToFit(text: string, wIn: number, pt: number, minPt: number): { pt: number; shrunk: boolean; fits: boolean } {
  const units = textUnits(text);
  if (capacityOf(wIn, pt, 1) >= units) return { pt, shrunk: false, fits: true };
  const need = Math.max(1, Math.ceil(units));
  const best = Math.floor((((wIn - 0.1) * 72) / need) * 2) / 2;
  const next = Math.max(minPt, Math.min(pt, best));
  return { pt: next, shrunk: true, fits: capacityOf(wIn, next, 1) >= units };
}

/** 장 제목을 한 줄에 — 넘치면 한 번만 줄인다(하한 = titleMinPx 와 20pt 중 큰 것) */
export function fitHeadTitle(d: DeckDesign, s: DesignScale, text: string): { wIn: number; pt: number; fits: boolean } {
  const wIn = s.x(d.head.right - d.head.left);
  const r = shrinkToFit(text, wIn, s.pt(d.tokens.type.title), Math.max(20, s.pt(d.head.titleMinPx)));
  return { wIn, pt: r.pt, fits: r.fits };
}

/** B1 요약 수 4개(전파 덱이 싣는 값) */
export function broadcastKpis(s: MeetingSnapshot, reflected: number, opinionCount: number) {
  const changed = (s.hazards ?? []).filter((h) => h.kind === 'new' || h.kind === 'changed').length;
  return [
    { key: 'changed', label: '새로 생기거나 바뀐 위험', value: `${changed}`, risk: true },
    { key: 'actions', label: '이번에 정한 대책', value: `${(s.actions ?? []).length}`, risk: false },
    { key: 'opinions', label: '근로자 의견 중 결정이 난 것', value: `${reflected}/${opinionCount}`, risk: false },
    { key: 'deferred', label: '다음으로 미룬 것', value: `${(s.deferred ?? []).length}`, risk: false },
  ];
}

export interface DesignFit {
  id: DesignId;
  ok: boolean;
  /** ok=false 일 때 담을 수 없는 이유(여럿이면 「; 」로). ok 면 빈 문자열 */
  reason: string;
}

/**
 * 프리셋마다 이 스냅숏을 「넘침 처리 없이」 담을 수 있는지 — 대책 건수 · needs 빈 값 · 요약 수 폭 · 대책 장 글 길이(위험·대책·담당 줄 수, 그리기와 같은 b3-geometry 로 잰다).
 * ok=false 여도 makeBroadcastPptx 는 만든다 — 넘침 순서(축약 표시 → 한 번만 축소 → 「외 N건」 → 다음 장)로 처리하고 warnings 에 적는다.
 * 고르기 화면은 ok=false 디자인을 빼거나 이유와 함께 흐리게 둔다.
 */
function broadcastFits(snapshot: MeetingSnapshot, ids: readonly DesignId[]): DesignFit[] {
  const s = snapshot ?? ({} as MeetingSnapshot);
  const actions = Array.isArray(s.actions) ? s.actions : [];
  const opinions = Array.isArray(s.opinions) ? s.opinions : [];
  const scale = designScale(13.333, 7.5);
  // 대책 장에 실을 글 — 전파 덱과 같이 대상 위험 원문을 찾는다
  const situation = new Map((Array.isArray(s.hazards) ? s.hazards : []).map((h) => [h.id, h.situation]));
  const prior = new Map((Array.isArray(s.prior) ? s.prior : []).map((p) => [p.id, p.hazard]));
  const texts = actions.map((a) => {
    const target = a.targetId ?? a.id;
    return { id: a.id, risk: a.hazard ?? situation.get(target) ?? prior.get(target) ?? target ?? '-', measure: a.measure || '-', owner: a.owner || '-', due: a.due || '-' };
  });
  return ids.map((id) => {
    const d = PRESETS[id];
    const why: string[] = [];
    const n = actions.length;
    if (n > d.slots.B3.maxItems) why.push(`대책 ${n}건 — 이 디자인의 대책 장(${d.slots.B3.part})은 한 장에 ${d.slots.B3.maxItems}건까지(넘치면 축소·「외 N건」·다음 장으로 나눔)`);
    const lacking = actions.filter((a) => d.slots.B3.needs.some((k) => !String((a as unknown as Record<string, unknown>)[k] ?? '').trim()));
    if (lacking.length) why.push(`대책 ${lacking.map((a) => a.id).join('·')} 에 ${d.slots.B3.needs.join('·')} 중 빈 값이 있어 이 배치를 채울 수 없음`);
    const kpis = broadcastKpis(s, 0, opinions.length).map((k) => (k.key === 'opinions' ? { ...k, value: `${opinions.length}/${opinions.length}` } : k));
    const boxes = fixedTextBoxes(d, scale);
    // 첫 요약 수는 히어로 칸(quiet)에, 나머지는 숫자 칸에 — 그리기(parts.drawB1)와 같은 칸
    const wide = kpis.filter((k, i) => {
      const box = i === 0 && boxes.hero ? boxes.hero : boxes.kpiValue;
      return capacityOf(box.wIn, box.pt, 1) < textUnits(k.value);
    });
    if (wide.length) why.push(`요약 수 ${wide.map((k) => `「${k.value}」`).join('·')} 가 이 디자인의 숫자 칸에 보통 크기로 한 줄에 들지 않음`);
    const long = b3LongFields(d, scale, texts);
    if (long.length) why.push(`대책 장 글이 시안 칸보다 길다 — ${long.map((x) => `${x.id} ${FIELD_LABEL[x.field]} ${x.need}줄(칸 ${x.lines}줄)`).join('·')} — 칸을 늘리거나 다음 장으로 나눔`);
    return { id, ok: why.length === 0, reason: why.join('; ') };
  });
}


/** 프리셋을 고를 수 있는 덱 종류 */
export const DECK_KINDS = ['broadcast', 'meeting-pre', 'meeting-final', 'tbm', 'education'] as const;
export type DeckKind = (typeof DECK_KINDS)[number];

/**
 * 덱 종류별 프리셋 담기 판정. 둘째 인자가 덱 종류(문자열)면 그 덱 기준, 배열이거나 없으면 전파 덱 기준(기존 호출 그대로).
 * ok=false 여도 덱은 만든다 — 제목은 줄 수만큼 머리 칸을 늘리고, 목록은 장을 나누며, 이유는 warnings 에도 남는다.
 */
export function designsFor(snapshot: MeetingSnapshot, ids?: readonly DesignId[]): DesignFit[];
export function designsFor(snapshot: MeetingSnapshot | TbmSnapshot | EducationSnapshot, kind: DeckKind, ids?: readonly DesignId[]): DesignFit[];
export function designsFor(snapshot: unknown, a?: DeckKind | readonly DesignId[], b?: readonly DesignId[]): DesignFit[] {
  const kind: DeckKind = typeof a === 'string' ? a : 'broadcast';
  const ids = (typeof a === 'string' ? b : a) ?? DESIGN_IDS;
  if (kind === 'broadcast') return broadcastFits(snapshot as MeetingSnapshot, ids);
  const scale = designScale(13.333, 7.5);
  const arr = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
  const o = (snapshot ?? {}) as Record<string, unknown>;
  // 덱마다 요약 수(B1 숫자 칸) · 입력 원문이 들어가는 제목
  let values: string[] = [];
  let titles: string[] = [];
  if (kind === 'meeting-pre') {
    const prior = arr<{ status?: string; id: string }>(o.prior);
    const hazards = arr<{ kind?: string }>(o.hazards);
    const done = prior.filter((p) => p.status === '완료');
    values = [String(done.length), String(hazards.filter((h) => h.kind === 'new' || h.kind === 'changed').length), String(arr(o.questions).length)];
    titles = done.map((p) => `조치 전·후 — ${p.id}`);
  } else if (kind === 'education') {
    const hz = arr<{ acceptability?: string }>(o.hazards);
    const n = (k?: string) => String(hz.filter((h) => h.acceptability === k).length);
    values = [n('unacceptable'), n('conditional'), n('acceptable'), ...(hz.some((h) => !h.acceptability) ? [n(undefined)] : [])];
  } else if (kind === 'tbm') {
    // 작업 장 제목 = 작업 이름 · 장소(그리기 tbm.tbmTitle 과 같은 글)
    titles = arr<{ process: string; place?: string }>(o.tasks).map((t) => (t.place ? `${t.process}  ·  ${t.place}` : t.process));
  }
  return ids.map((id) => {
    const d = PRESETS[id];
    const why: string[] = [];
    const boxes = fixedTextBoxes(d, scale);
    const wide = values.filter((v, i) => {
      const box = i === 0 && boxes.hero ? boxes.hero : boxes.kpiValue;
      return capacityOf(box.wIn, box.pt, 1) < textUnits(v);
    });
    if (wide.length) why.push(`요약 수 ${wide.map((v) => `「${v}」`).join('·')} 가 이 디자인의 숫자 칸에 보통 크기로 한 줄에 들지 않음`);
    const longT = titles.filter((t) => !fitHeadTitle(d, scale, t).fits);
    if (longT.length) why.push(`제목 ${longT.map((t) => `「${t}」`).join('·')} 이 한 번 줄여도 한 줄에 들지 않음 — 머리 칸을 줄 수만큼 늘림`);
    return { id, ok: why.length === 0, reason: why.join('; ') };
  });
}

const FIELD_LABEL = { risk: '위험', measure: '대책', owner: '담당' } as const;

// 프리셋 파일이 형식을 어기면 불러올 때 바로 멈춘다(잘못된 배치로 덱을 만들지 않게)
for (const id of DESIGN_IDS) {
  const e = designErrors(PRESETS[id]);
  if (e.length) throw new Error(`디자인 프리셋 ${id} 형식 오류: ${e.join(' / ')}`);
}
