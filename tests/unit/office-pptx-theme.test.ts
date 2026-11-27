import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { getDeckTheme, DECK_RULES, DECK_KINDS, type DeckKind } from '@/lib/office/pptx/theme';
import * as office from '@/lib/office';

// 기대값 = deckkit(claude-setup) rules.resolve(deck_kind=…) 와 theme.DEFAULT 를 로컬에서 실제로 돌린 결과.
// 다시 뽑기: python3 _reviews/261127_office_pptx_docx/gen_theme_contract.py <deckkit> <엔진>
const FX = JSON.parse(fs.readFileSync('tests/fixtures/office/deck-theme-deckkit.json', 'utf8'));

const camelTable = (t: Record<string, unknown>) => ({
  bodyFill: t.body_fill, stripes: t.stripes, headFill: t.head_fill, headText: t.head_text,
  innerPt: t.inner_pt, headRulePt: t.head_rule_pt, bottomPt: t.bottom_pt,
  innerColor: t.inner_color, ruleColor: t.rule_color,
  innerVertical: t.inner_vertical, outerVertical: t.outer_vertical,
});

describe('office/pptx/theme — deckkit 와 같은 값', () => {
  it('덱 종류 6개가 deckkit 과 같다', () => {
    expect([...DECK_KINDS].sort()).toEqual(Object.keys(FX.kinds).sort());
  });

  for (const kind of Object.keys(FX.kinds) as DeckKind[]) {
    it(`getDeckTheme('${kind}') = deckkit resolve + 기본 테마`, () => {
      const want = FX.kinds[kind];
      const t = getDeckTheme(kind);
      expect(t.titleStyle).toBe(want.titleStyle);
      expect(t.profile).toBe(want.profile);
      expect(t.table.style).toBe(want.tableStyle);
      expect(t.minimums).toEqual(want.minimums);
      expect(t.lineSpacing.multiline.default).toBe(want.lineSpacing);
      expect(t.paper).toEqual(want.paper);
      const tableFields: Record<string, unknown> = { ...t.table }; delete tableFields.style;
      expect(tableFields).toEqual(camelTable(want.table));
      expect(t.colors).toEqual(FX.default_theme.colors);
      expect(t.fonts).toEqual(FX.default_theme.fonts);
      expect(t.typeScale).toEqual(FX.default_theme.type_scale);
    });
  }

  it('발표형 프로필 하한 28·16·14·10·8', () => {
    expect(getDeckTheme('lecture', { profile: 'presentation' }).minimums).toEqual(FX.presentation_min);
  });

  it('A4 = PowerPoint 「A4 용지」 10.8333×7.5in', () => {
    expect(getDeckTheme('report', { paper: 'A4' }).paper).toEqual({ name: 'A4', wIn: 10.8333, hIn: 7.5 });
  });

  it('호출자 테마는 주입한 칸만 덮고 원본 데이터는 바뀌지 않는다', () => {
    const t = getDeckTheme('report', { theme: { colors: { primary: '103190' }, fonts: { latin: '맑은 고딕', eastAsia: '맑은 고딕' } } });
    expect(t.colors.primary).toBe('103190');
    expect(t.colors.accent).toBe(FX.default_theme.colors.accent);
    expect(t.fonts.latin).toBe('맑은 고딕');
    expect(t.fonts.mono).toBe(FX.default_theme.fonts.mono);
    expect(getDeckTheme('report').colors.primary).toBe(FX.default_theme.colors.primary);
  });

  it('옵션으로 표 모양·제목 유형을 바꾼다, 모르는 이름은 던진다', () => {
    expect(getDeckTheme('report', { table: 'dark_head' }).table.headFill).toBe('primary');
    expect(getDeckTheme('report', { titleStyle: 'action' }).titleStyle).toBe('action');
    expect(() => getDeckTheme('findings' as DeckKind)).toThrow();
    expect(() => getDeckTheme('report', { table: 'brand' as never })).toThrow();
  });

  it('잘못된 색 hex 는 던진다', () => {
    expect(() => getDeckTheme('report', { theme: { colors: { primary: '#14213D' } } })).toThrow();
  });
});

describe('office/pptx/theme — 공개 저장소 정화', () => {
  it('rules.json 에 고객·법인·사람 이름이 없다', () => {
    const txt = fs.readFileSync('src/lib/office/pptx/theme/rules.json', 'utf8').toLowerCase();
    for (const w of ['롯데', '위너스', '태광', '모비스', '재홍', 'winners', 'lotte', 'taegwang', 'mobis']) {
      expect(txt.includes(w), w).toBe(false);
    }
  });

  it('DECK_RULES 는 얼어 있다', () => {
    expect(Object.isFrozen(DECK_RULES)).toBe(true);
    expect(Object.isFrozen(DECK_RULES.tables.styles)).toBe(true);
  });
});

describe('k-labor/office 입구에서 다시 내보낸다', () => {
  it('getDeckTheme·DECK_RULES', () => {
    expect(typeof office.getDeckTheme).toBe('function');
    expect(office.DECK_RULES.version).toBe(FX.deckkit_version);
  });
});
