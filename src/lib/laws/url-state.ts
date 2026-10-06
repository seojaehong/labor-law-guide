/** Decode legacy event/article anchors without breaking on malformed URLs. */
export function readLawHash(hash: string): string {
  try { return decodeURIComponent(hash.replace(/^#/, '')); }
  catch { return ''; }
}

type LawUrlState = {
  view: 'upcoming' | 'recent' | 'all';
  q: string;
  laws: string[];
  rulesOnly: boolean;
  lawsOnly: boolean;
  month: string | null;
  mode: 'list' | 'cal';
  day: string | null;
  event: string | null;
};

/** Only replace this page's state; preserve campaign and other unrelated query parameters. */
export function writeLawUrl(url: URL, state: LawUrlState, eventIds: readonly string[]): string {
  const values = {
    view: state.view === 'upcoming' ? null : state.view,
    q: state.q || null,
    law: state.laws.join(',') || null,
    rules: state.rulesOnly ? '1' : null,
    level: state.lawsOnly ? 'law' : null,
    m: state.month,
    mode: state.mode === 'cal' ? 'cal' : null,
    d: state.day,
    event: state.event,
  };
  for (const [key, value] of Object.entries(values)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  const hashEvent = readLawHash(url.hash).split('~')[0];
  if (eventIds.includes(hashEvent) && hashEvent !== state.event) url.hash = '';
  return url.pathname + url.search + url.hash;
}
