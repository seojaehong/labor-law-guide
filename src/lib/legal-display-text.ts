/** Remove confirmed source annotation wrappers, never their legal text.
 * Entity decoding is only a scanning view: non-wrapper source bytes stay intact.
 * This returns text, not trusted HTML, and does not manufacture citation links.
 */
export function unwrapSourceAnnotations(input: string): string {
  if (!input || !/law_cite/i.test(input)) return input;
  type Unit = { char: string; start: number; end: number; depth: number };
  let units: Unit[] = input.split('').map((char, index) => ({ char, start: index, end: index + 1, depth: 0 }));
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  // Bounded decoding recognizes raw, escaped, and double-escaped annotation syntax.
  for (let pass = 0; pass < 3; pass++) {
    const view = units.map(unit => unit.char).join('');
    const next: Unit[] = [];
    let cursor = 0;
    for (const match of view.matchAll(/&(?:amp|lt|gt|quot|apos|#(?:\d{1,7}|x[0-9a-f]{1,6}));/gi)) {
      const body = match[0].slice(1, -1).toLowerCase();
      const number = body.startsWith('#x') ? parseInt(body.slice(2), 16) : body.startsWith('#') ? parseInt(body.slice(1), 10) : NaN;
      const char = named[body] ?? (Number.isFinite(number) && [34, 38, 39, 47, 60, 62].includes(number) ? String.fromCharCode(number) : undefined);
      if (!char) continue;
      const start = match.index!;
      for (let index = cursor; index < start; index++) next.push(units[index]);
      next.push({ char, start: units[start].start, end: units[start + match[0].length - 1].end, depth: 1 + Math.max(...units.slice(start, start + match[0].length).map(unit => unit.depth)) });
      cursor = start + match[0].length;
    }
    if (!cursor) break;
    for (let index = cursor; index < units.length; index++) next.push(units[index]);
    units = next;
  }
  const view = units.map(unit => unit.char).join('');
  // Quotes introduced by a deeper entity layer are attribute data, not syntax.
  function tokenEnd(start: number): number {
    const depth = units[start].depth;
    let quote = '';
    let quoteDepth = -1;
    for (let index = start + 1; index < view.length; index++) {
      const unit = units[index];
      if (quote) {
        if (unit.char === quote && unit.depth === quoteDepth) quote = '';
      } else if (unit.depth <= depth) {
        if (unit.char === '"' || unit.char === "'") { quote = unit.char; quoteDepth = unit.depth; }
        else if (unit.char === '<') return -1;
        else if (unit.char === '>') return index;
      }
    }
    return -1;
  }
  function isOpening(start: number, end: number): boolean {
    let index = start + '<law_cite'.length;
    const depth = units[start].depth;
    while (index < end) {
      const beforeSpace = index;
      while (/\s/.test(view[index] || '') && index < end) index++;
      if (index === end) return true;
      if (view[index] === '/' && index + 1 === end) return true;
      if (index === beforeSpace) return false;
      const name = /^[A-Za-z_:][\w:.-]*/.exec(view.slice(index, end));
      if (!name) return false;
      index += name[0].length;
      const afterName = index;
      while (/\s/.test(view[index] || '') && index < end) index++;
      if (view[index] !== '=') { index = afterName; continue; }
      index++;
      while (/\s/.test(view[index] || '') && index < end) index++;
      if (index === end) return false;
      const quote = view[index];
      if ((quote === '"' || quote === "'") && units[index].depth <= depth) {
        const quoteDepth = units[index++].depth;
        while (index < end && !(view[index] === quote && units[index].depth === quoteDepth)) index++;
        if (index === end) return false;
        index++;
      } else {
        const valueStart = index;
        while (index < end && !/\s/.test(view[index])) {
          if (units[index].depth <= depth && /["'=<>`]/.test(view[index])) return false;
          index++;
        }
        if (index === valueStart) return false;
      }
    }
    return true;
  }
  let result = '';
  let sourceCursor = 0;
  for (let index = 0; index < view.length; index++) {
    if (view[index] !== '<') continue;
    const end = tokenEnd(index);
    if (end < 0) continue;
    const token = view.slice(index, end + 1);
    const known = /^<\/law_cite\s*>$/i.test(token)
      || (/^<law_cite(?=[\s/>])/i.test(token) && isOpening(index, end));
    if (known) {
      result += input.slice(sourceCursor, units[index].start);
      sourceCursor = units[end].end;
    }
    // Also skip unknown tag attributes; their quoted text is not an annotation.
    index = end;
  }
  return result + input.slice(sourceCursor);
}
