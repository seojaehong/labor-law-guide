// 회의 덱(회의 전·후·TBM·전파본·교육 교안) 디자인 값.
// ★ 값의 정본은 테마 모듈 rules.json 이다 — getDeckTheme('report')(report 덱 · reading 프로필 · 표 line)에서 읽는다.
// ★ 단, 덱 겉모습을 바꾸지 않으려고 rules.json 과 값이 다르거나 대응 칸이 없는 것은 아래 「회의 덱 고유값」에 그대로 둔다.
//   rules.json 쪽으로 맞출지는 사람이 덱을 보고 정한다(바꾸면 색·크기가 달라진다).
//   - negative B5473A  ↔ rules danger C0392B (다름)
//   - positive 2E7D5B · caution B7791F (rules 에 대응 역할 없음)
//   - title 22 ↔ rules type_scale.title 26 (다름)
//   - lead 12 ↔ rules subtitle 12.5 (다름) · h2 14 ↔ rules h2 15 (다름)
//   - caption 8 = rules reading 하한 note 8 (목표 크기 caption 9.5 와는 다름) · table 10 = rules reading 하한 table 10
//   - kpi 54 · cover 34 (rules 에 대응 칸 없음)
//   - fonts.fallback '맑은 고딕' ↔ rules fallback [] (다름)
import { getDeckTheme } from './theme/index';
import type { TitleStyle } from './theme/index';

export type { TitleStyle };

export interface MeetingTheme {
  colors: {
    primary: string; // 제목·표 머리 선·다크 패널
    accent: string; // 강조 하나
    negative: string; // 위험·증가·미완료
    positive: string; // 감소·완료
    caution: string; // 기한 임박·결정 필요
    text: string;
    muted: string;
    line: string;
    band: string; // 옅은 바탕(카드·머리행)
    bg: string;
  };
  /** pt — reading 프로필(rules.json profiles.reading: 제목 ≥20, 본문 ≥10, 표 ≥10, 출처·쪽번호 ≥8) */
  typeScale: { kicker: number; title: number; lead: number; h2: number; body: number; table: number; caption: number; kpi: number; cover: number };
  /** rules.json tables.styles.line — 가는 선, 본문 채움 없음, 바깥 세로선 없음 */
  table: { style: 'line'; innerLinePt: number; ruleLinePt: number; headerFill: string };
  titleStyle: TitleStyle;
  fonts: { latin: string; eastAsia: string; fallback: string };
  /** 여러 줄 본문 줄간격 배수(rules.json line_spacing.multiline_body.default) */
  lineSpacing: number;
}

const T = getDeckTheme('report', { profile: 'reading', table: 'line' });

/** 회의 덱 고유값 — rules.json 과 다르거나 대응 칸이 없는 것(위 머리 주석 참조) */
const MEETING_OWN = {
  colors: { negative: 'B5473A', positive: '2E7D5B', caution: 'B7791F' },
  typeScale: { title: 22, lead: 12, h2: 14, caption: 8, kpi: 54, cover: 34 },
  fallbackFont: '맑은 고딕',
} as const;

if (T.table.style !== 'line' || T.table.headRulePt === null) {
  throw new Error('회의 덱 표는 rules.json line 표(머리행 아래 선 있음)를 전제로 한다');
}

export const MEETING_THEME: MeetingTheme = {
  colors: {
    primary: T.colors.primary,
    accent: T.colors.accent,
    negative: MEETING_OWN.colors.negative,
    positive: MEETING_OWN.colors.positive,
    caution: MEETING_OWN.colors.caution,
    text: T.colors.body,
    muted: T.colors.muted,
    line: T.colors.line,
    band: T.colors.band,
    bg: T.colors.paper,
  },
  typeScale: {
    kicker: T.typeScale.kicker,
    title: MEETING_OWN.typeScale.title,
    lead: MEETING_OWN.typeScale.lead,
    h2: MEETING_OWN.typeScale.h2,
    body: T.typeScale.body,
    table: T.minimums.table,
    caption: MEETING_OWN.typeScale.caption,
    kpi: MEETING_OWN.typeScale.kpi,
    cover: MEETING_OWN.typeScale.cover,
  },
  table: {
    style: 'line',
    innerLinePt: T.table.innerPt,
    ruleLinePt: T.table.headRulePt,
    headerFill: T.colors[T.table.headFill],
  },
  // report 덱 = 「라벨 : 요점」 2단(rules.json deck_kinds.report)
  titleStyle: T.titleStyle,
  fonts: { latin: T.fonts.latin, eastAsia: T.fonts.eastAsia, fallback: MEETING_OWN.fallbackFont },
  lineSpacing: T.lineSpacing.multiline.default,
};
