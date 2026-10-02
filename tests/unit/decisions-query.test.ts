import { describe, expect, it } from 'vitest';
import { parse, categoryHref, pageHref, tabHref } from '@/lib/decisions-query';
import { REASON_LABELS } from '@/lib/types';

describe('decision navigation', () => {
  it.each(Object.keys(REASON_LABELS))('accepts %s', reason => expect(parse({ reason }).reason).toBe(reason));
  it.each(['', 'unknown', 'constructor', '__proto__'])('rejects %s', reason => {
    expect(parse({ reason })).toMatchObject({ reason: null, reasonProvided: true });
  });
  it.each(['0', '-1', '1.5', '2abc', 'NaN', 'Infinity', '9007199254740992', '450359962737050'])('normalizes invalid page %s', page => expect(parse({page}).page).toBe(1));
  it('handles arrays and preserves the first value', () => expect(parse({reason:['no_dismissal','other'],page:['2','3'],q:['','x']})).toMatchObject({reason:'no_dismissal',page:2,q:''}));
  it('preserves ordinary and legacy searches', () => {
    expect(parse({q:' 해고부존재/사직 ',tab:'cases'})).toMatchObject({q:'해고부존재/사직',type:'court',reason:null});
    expect(parse({tab:'admin'}).type).toBe('admin');
    expect(parse({q:'x'.repeat(61)}).q).toHaveLength(60);
  });
  it('rejects mixed modes', () => {
    for (const extra of [{q:'해고'}, {type:'court'}, {tab:'admin'}]) expect(parse({reason:'no_dismissal',...extra}).invalidCombination).toBe(true);
    expect(parse({reason:'no_dismissal',q:' '}).invalidCombination).toBe(false);
  });
  it('builds canonical parameter sets', () => {
    expect(categoryHref('no_dismissal')).toBe('/decisions?reason=no_dismissal');
    expect(categoryHref('no_dismissal',2)).toBe('/decisions?reason=no_dismissal&page=2');
    expect(pageHref('성희롱','court',2)).toContain('&type=court&page=2');
    expect(tabHref('성희롱','admin')).not.toContain('page');
  });
});
