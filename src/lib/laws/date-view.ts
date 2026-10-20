/** Validate URL date values before using Date.UTC or rendering a calendar. */
export function validLawMonth(value: string | null): value is string {
  return !!value && /^\d{6}$/.test(value) && +value.slice(0, 4) >= 1900 && +value.slice(0, 4) <= 2200 && +value.slice(4) >= 1 && +value.slice(4) <= 12;
}
export function validLawDate(value: string | null): value is string {
  if (!value || !/^\d{8}$/.test(value) || !validLawMonth(value.slice(0, 6))) return false;
  const d = new Date(Date.UTC(+value.slice(0, 4), +value.slice(4, 6) - 1, +value.slice(6)));
  return d.toISOString().slice(0, 10).replace(/-/g, '') === value;
}
export function moveLawMonth(month: string, step: number): string {
  const d = new Date(Date.UTC(+month.slice(0, 4), +month.slice(4) - 1 + step, 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The calendar and result list share one effective-date predicate. */
export function lawDateResults<T extends { date: string }>(events: readonly T[], month: string | null, day: string | null, chronological = false): T[] {
  const result = events.filter(event => (!month || event.date.startsWith(month)) && (!day || event.date === day));
  return chronological ? result.sort((a, b) => a.date.localeCompare(b.date)) : result;
}
