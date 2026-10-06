/** Whole-result selection never changes IDs outside the current result. */
export function toggleResultSelection(selected: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  const next = new Set(selected);
  const all = ids.length > 0 && ids.every(id => next.has(id));
  for (const id of ids) { if (all) next.delete(id); else next.add(id); }
  return next;
}
export function selectionCounts(selected: ReadonlySet<string>, visibleIds: readonly string[]) {
  const visible = new Set(visibleIds);
  const shown = [...selected].filter(id => visible.has(id)).length;
  return { shown, hidden: selected.size - shown, all: visible.size > 0 && shown === visible.size };
}
