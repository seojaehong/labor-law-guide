// 덱 테마 계약 — 색 역할·글꼴·크기 위계·하한·줄간격·표 모양·제목 유형·용지를 한 객체로.
// ★ 규칙 값의 정본은 같은 폴더 rules.json 하나다. deckkit(로컬 PPT 생성기)·회의 덱·검사가 모두 이 값을 읽는다.
// ★ 고객 테마(회사 색·글꼴)는 엔진에 두지 않는다. 부르는 쪽이 getDeckTheme(kind, { theme }) 로 주입한다.
// ★ fs·네트워크 없음. json 은 번들에 들어간다.
import RULES_JSON from './rules.json';

export type DeckKind = 'proposal' | 'report' | 'analysis' | 'briefing' | 'diagnosis' | 'lecture';
export type TitleStyle = 'label' | 'label_lead' | 'action';
export type TypeProfile = 'reading' | 'presentation';
export type TableStyleName = 'line' | 'report' | 'dark_head' | 'navy_striped';
export type PaperName = '16:9' | 'A4';
/** 색 역할 이름. 값은 # 없는 6자리 hex(대문자) */
export type ColorRole =
  | 'primary' | 'accent' | 'accent2' | 'deep' | 'light' | 'on_dark' | 'ink' | 'body'
  | 'muted' | 'muted2' | 'subtle' | 'line' | 'band' | 'band2' | 'band3' | 'faint' | 'paper' | 'danger';

export const DECK_KINDS: readonly DeckKind[] = Object.freeze(['proposal', 'report', 'analysis', 'briefing', 'diagnosis', 'lecture']);
export const COLOR_ROLES: readonly ColorRole[] = Object.freeze([
  'primary', 'accent', 'accent2', 'deep', 'light', 'on_dark', 'ink', 'body',
  'muted', 'muted2', 'subtle', 'line', 'band', 'band2', 'band3', 'faint', 'paper', 'danger',
]);

export interface TableStyle {
  bodyFill: ColorRole | null;
  stripes: boolean;
  headFill: ColorRole;
  headText: ColorRole;
  /** 안쪽 선 pt */
  innerPt: number;
  /** 머리행 아래 선 pt. null = 진한 머리행이 경계라 선 없음 */
  headRulePt: number | null;
  /** 맨 아래 선 pt */
  bottomPt: number;
  innerColor: ColorRole;
  ruleColor: ColorRole;
  innerVertical: boolean;
  outerVertical: boolean;
  /** stripes 일 때 짝수 행 바탕 */
  stripeFill?: ColorRole;
}

export interface DeckFonts {
  latin: string;
  eastAsia: string;
  title?: string;
  bold?: string;
  heavy?: string;
  mono: string;
  /** 글꼴이 설치돼 있지 않을 때 차례로 쓸 이름 */
  fallback: string[];
}

/** pt */
export interface DeckTypeScale {
  kicker: number; title: number; subtitle: number; h2: number; h3: number;
  body: number; small: number; caption: number; footer: number;
}

export interface DeckTheme {
  name: string;
  colors: Record<ColorRole, string>;
  fonts: DeckFonts;
  /** 목표 크기(pt) */
  typeScale: DeckTypeScale;
  /** 프로필 하한(pt). 검사(L12p)는 이 값을 본다. chart null = 하한 없음 */
  minimums: { title: number; body: number; chart: number | null; table: number; note: number };
  lineSpacing: { multiline: { default: number; min: number; max: number }; single: { min: number; max: number } };
  table: TableStyle & { style: TableStyleName };
  titleStyle: TitleStyle;
  profile: TypeProfile;
  paper: { name: PaperName; wIn: number; hIn: number };
}

export interface DeckThemeOverride {
  colors?: Partial<Record<ColorRole, string>>;
  fonts?: Partial<DeckFonts>;
  typeScale?: Partial<DeckTypeScale>;
  name?: string;
}

export interface DeckThemeOptions {
  profile?: TypeProfile;
  table?: TableStyleName;
  paper?: PaperName;
  titleStyle?: TitleStyle;
  theme?: DeckThemeOverride;
}

type RawTable = {
  body_fill: string | null; stripes: boolean; stripe_fill?: string; head_fill: string; head_text: string;
  inner_pt: number; head_rule_pt: number | null; bottom_pt: number; inner_color: string; rule_color: string;
  inner_vertical: boolean; outer_vertical: boolean;
};

/** rules.json 모양. ★ typeof json 으로 두면 d.ts 가 './rules.json' 을 참조해 받는 쪽 타입이 깨진다 — 손으로 적는다 */
export interface DeckRulesData {
  version: string;
  note: string;
  lint_rules: { default: boolean };
  papers: Record<PaperName, { w_in: number; h_in: number; label: string; default?: boolean }> & { _note?: string };
  deck_kinds: Record<DeckKind, { label: string; title_style: TitleStyle }>;
  default_profile: TypeProfile;
  profiles: Record<TypeProfile, {
    label: string;
    min: { title: number; body: number; chart: number | null; table: number; note: number };
    target: { title: number; body: number | number[] };
    how: string;
  }>;
  small_roles: { roles: string[]; label: string };
  title_styles: Record<TitleStyle, { label: string; check: string | null } & Record<string, unknown>>;
  line_spacing: {
    auto: boolean;
    multiline_body: { default: number; min: number; max: number };
    single: { min: number; max: number; applies_to: string };
    lint_est_lines: number;
    lint_how: string;
  };
  tables: {
    default_style: TableStyleName;
    styles: Record<TableStyleName, RawTable & { label: string; legacy?: boolean }>;
    lint: Record<string, unknown>;
  };
  citations: { formal: string; normalize: boolean; example: string; court_alias: Record<string, string>; decision_infixes: string[]; abbrev_re: string };
  grades: Record<string, string>;
  default_theme: { name: string; colors: Record<ColorRole, string>; fonts: DeckFonts; type_scale: DeckTypeScale };
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
}

/** rules.json 그대로(읽기 전용) */
export const DECK_RULES: Readonly<DeckRulesData> = deepFreeze(RULES_JSON as unknown as DeckRulesData);

const HEX = /^[0-9A-F]{6}$/;

function pick<K extends string>(what: string, name: string | undefined, table: Record<string, unknown>, dflt: K): K {
  const k = (name ?? dflt) as K;
  if (!Object.prototype.hasOwnProperty.call(table, k) || k.startsWith('_')) {
    throw new Error(`${what} 은 ${Object.keys(table).filter((x) => !x.startsWith('_')).join(', ')} 중 하나: ${String(name)}`);
  }
  return k;
}

function tableOf(raw: RawTable): TableStyle {
  const t: TableStyle = {
    bodyFill: raw.body_fill as ColorRole | null,
    stripes: raw.stripes,
    headFill: raw.head_fill as ColorRole,
    headText: raw.head_text as ColorRole,
    innerPt: raw.inner_pt,
    headRulePt: raw.head_rule_pt,
    bottomPt: raw.bottom_pt,
    innerColor: raw.inner_color as ColorRole,
    ruleColor: raw.rule_color as ColorRole,
    innerVertical: raw.inner_vertical,
    outerVertical: raw.outer_vertical,
  };
  if (raw.stripe_fill) t.stripeFill = raw.stripe_fill as ColorRole;
  return t;
}

/**
 * 덱 종류 하나의 테마. 비운 칸은 rules.json 기본값(덱 종류 → 제목 유형, 기본 프로필·표·용지)으로 채운다.
 * 모르는 이름·잘못된 hex 는 던진다(부르는 쪽 실수라 조용히 넘기지 않는다).
 */
export function getDeckTheme(kind: DeckKind, opts: DeckThemeOptions = {}): DeckTheme {
  const R = DECK_RULES;
  const k = pick<DeckKind>('deck_kind', kind, R.deck_kinds, kind);
  const profile = pick<TypeProfile>('profile', opts.profile, R.profiles, R.default_profile as TypeProfile);
  const titleStyle = pick<TitleStyle>('title_style', opts.titleStyle, R.title_styles, R.deck_kinds[k].title_style as TitleStyle);
  const tableName = pick<TableStyleName>('table', opts.table, R.tables.styles, R.tables.default_style as TableStyleName);
  const defaultPaper = (Object.keys(R.papers) as string[]).find((p) => (R.papers as Record<string, { default?: boolean }>)[p]?.default) as PaperName;
  const paperName = pick<PaperName>('paper', opts.paper, R.papers, defaultPaper);
  const paper = R.papers[paperName];

  const base = R.default_theme;
  const over = opts.theme ?? {};
  const colors = { ...(base.colors as Record<ColorRole, string>) };
  for (const [role, v] of Object.entries(over.colors ?? {})) {
    if (!(COLOR_ROLES as readonly string[]).includes(role)) throw new Error(`색 역할이 아닙니다: ${role}`);
    const hex = String(v).toUpperCase();
    if (!HEX.test(hex)) throw new Error(`색 값은 # 없는 6자리 hex: ${role}=${String(v)}`);
    colors[role as ColorRole] = hex;
  }
  const fonts: DeckFonts = { ...(base.fonts as DeckFonts), fallback: [...base.fonts.fallback] };
  for (const [key, v] of Object.entries(over.fonts ?? {})) {
    if (v === undefined) continue;
    (fonts as unknown as Record<string, unknown>)[key] = Array.isArray(v) ? [...v] : v;
  }
  const typeScale: DeckTypeScale = { ...(base.type_scale as DeckTypeScale) };
  for (const [key, v] of Object.entries(over.typeScale ?? {})) {
    if (v === undefined) continue;
    if (!(key in typeScale) || typeof v !== 'number' || !(v > 0)) throw new Error(`크기 값이 잘못됐습니다: ${key}=${String(v)}`);
    (typeScale as unknown as Record<string, number>)[key] = v;
  }

  const prof = R.profiles[profile];
  const ls = R.line_spacing;
  return {
    name: over.name ?? base.name,
    colors,
    fonts,
    typeScale,
    minimums: { ...prof.min },
    lineSpacing: {
      multiline: { default: ls.multiline_body.default, min: ls.multiline_body.min, max: ls.multiline_body.max },
      single: { min: ls.single.min, max: ls.single.max },
    },
    table: { style: tableName, ...tableOf((R.tables.styles as Record<string, RawTable>)[tableName]) },
    titleStyle,
    profile,
    paper: { name: paperName, wIn: paper.w_in, hIn: paper.h_in },
  };
}
