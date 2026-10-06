import { describe, expect, it } from 'vitest';
import { readLawHash, writeLawUrl } from '@/lib/laws/url-state';

const event = '001872-20261008';
const other = '001872-20270101';
const defaults = {
  view: 'upcoming' as const, q: '', laws: [], rulesOnly: false, lawsOnly: false,
  month: null, mode: 'list' as const, day: null, event: null,
};
const write = (path: string, state: Parameters<typeof writeLawUrl>[1] = defaults) => writeLawUrl(new URL(path, 'https://yellowenvelope.kr'), state, [event, other]);

describe('law list URL state', () => {
  it('removes stale event and article anchor when returning to the list', () => {
    expect(write(`/laws?event=${event}#${event}~0107001`)).toBe('/laws');
  });
  it('preserves unrelated repeated query parameters and list anchors', () => {
    expect(write(`/laws?utm_source=chat&tag=a&tag=b&event=${event}#law-list`))
      .toBe('/laws?utm_source=chat&tag=a&tag=b#law-list');
    expect(write(`/laws?event=${event}#unrelated-section`)).toBe('/laws#unrelated-section');
  });
  it('keeps a matching event and article anchor', () => {
    expect(write(`/laws?event=${event}#${event}~0107001`, { ...defaults, event }))
      .toBe(`/laws?event=${event}#${event}~0107001`);
  });
  it('clears the previous event anchor when another event is selected', () => {
    expect(write(`/laws?event=${event}#${event}`, { ...defaults, event: other }))
      .toBe(`/laws?event=${other}`);
  });
  it('replaces all page-owned filter keys without dropping foreign parameters', () => {
    expect(write('/laws?view=recent&q=old&law=old&rules=1&level=law&m=202610&mode=cal&d=20261008&keep=yes'))
      .toBe('/laws?keep=yes');
  });
  it('serializes filters along with the selected event', () => {
    const url = new URL(writeLawUrl(new URL('https://yellowenvelope.kr/laws'), {
      ...defaults, view: 'all', q: '임금 체불', laws: ['001872', '001873'],
      rulesOnly: true, lawsOnly: true, month: '202610', mode: 'cal', day: '20261008', event,
    }, [event]), 'https://yellowenvelope.kr');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      view: 'all', q: '임금 체불', law: '001872,001873', rules: '1', level: 'law',
      m: '202610', mode: 'cal', d: '20261008', event,
    });
  });
  it('decodes legacy anchors and tolerates malformed encoding', () => {
    expect(readLawHash(`#${event}%7E0107001`)).toBe(`${event}~0107001`);
    expect(readLawHash('#%E0%A4%A')).toBe('');
    expect(write('/laws#%E0%A4%A')).toBe('/laws#%E0%A4%A');
  });
});
