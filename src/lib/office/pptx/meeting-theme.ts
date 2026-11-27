// 회의 덱 디자인 값 — 임시 상수. deckkit(claude-setup edf0736) rules.json·theme.py 기본 테마에서 옮겼다.
// 필드 이름은 엔진 테마 모듈(src/lib/office/pptx/theme, onedrive-f5 이관 중)의 DeckTheme 가안에 맞췄다 —
// 그 모듈이 들어오면 MEETING_THEME 를 getDeckTheme('report') 로 바꿔 끼운다.

export type TitleStyle = 'label' | 'label_lead' | 'action';

export interface DeckTheme {
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

export const MEETING_THEME: DeckTheme = {
  colors: {
    primary: '14213D',
    accent: '3F6CC4',
    negative: 'B5473A',
    positive: '2E7D5B',
    caution: 'B7791F',
    text: '363636',
    muted: '5A5A5A',
    line: 'C4CDD8',
    band: 'F1F5FA',
    bg: 'FFFFFF',
  },
  typeScale: { kicker: 10, title: 22, lead: 12, h2: 14, body: 11, table: 10, caption: 8, kpi: 54, cover: 34 },
  table: { style: 'line', innerLinePt: 0.5, ruleLinePt: 1.25, headerFill: 'F3F7FC' },
  // report 덱 = 「라벨 : 요점」 2단(rules.json deck_kinds.report)
  titleStyle: 'label_lead',
  fonts: { latin: 'Pretendard', eastAsia: 'Pretendard', fallback: '맑은 고딕' },
  lineSpacing: 1.2,
};
