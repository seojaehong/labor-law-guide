// Safe static SSR extraction. Never evaluates Next/React scripts or fetches URLs.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parse, serialize } = require('parse5');
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const children = node => node.childNodes || [];
const walk = function* (node) { yield node; for (const child of children(node)) yield* walk(child); };
const dropTags = new Set(['script', 'noscript', 'iframe', 'object', 'embed', 'base', 'link', 'meta', 'title', 'style']);
const urlAttributes = new Set(['src', 'srcset', 'href', 'action', 'formaction', 'poster', 'ping', 'background', 'data', 'manifest']);

// Next may stream HTML even for HTML-limited bot user-agents. Resolve only the
// literal ID-to-ID placements emitted by React ($RC/$RS); never evaluate any JS.
// Unrecognized/incomplete boundaries fail closed rather than inventing a page.
function materializeStream(document) {
  const scripts = [...walk(document)].filter(node => node.tagName === 'script');
  const find = id => [...walk(document)].find(node => attr(node, 'id') === id);
  const remove = node => {
    const parent = node.parentNode;
    if (!parent) throw new Error('Detached streamed segment');
    parent.childNodes.splice(parent.childNodes.indexOf(node), 1); node.parentNode = null;
  };
  let placements = 0;
  for (const script of scripts) {
    const text = children(script).map(node => node.value || '').join('');
    for (const [, kind, first, second] of text.matchAll(/\$(RC|RS)\("([BSP]:\d+)","([BSP]:\d+)"\)/g)) {
      const segmentId = kind === 'RC' ? second : first, targetId = kind === 'RC' ? first : second;
      const segment = find(segmentId), target = find(targetId);
      if (!segment || !target) throw new Error(`Missing streamed placement ${kind}: ${first}, ${second}`);
      // Fizz wraps streamed table children in context-specific containers.
      if (!['div', 'table', 'tbody', 'thead', 'tfoot', 'tr', 'colgroup'].includes(segment.tagName) || target.tagName !== 'template')
        throw new Error('Unexpected streamed placement elements');
      const parent = target.parentNode, index = parent.childNodes.indexOf(target);
      let count = 1;
      if (kind === 'RC') {
        let depth = 0, foundEnd = false;
        for (let i = index + 1; i < parent.childNodes.length; i++) {
          const node = parent.childNodes[i];
          if (node.nodeName === '#comment') {
            if (['/$', '/&'].includes(node.data)) {
              if (depth === 0) { count = i - index; foundEnd = true; break; }
              depth--;
            } else if (['$', '$?', '$~', '$!', '&'].includes(node.data)) depth++;
          }
        }
        if (!foundEnd) throw new Error('Unterminated streamed Suspense boundary');
      }
      const content = [...children(segment)];
      remove(segment);
      for (const node of content) node.parentNode = parent;
      parent.childNodes.splice(index, count, ...content);
      segment.childNodes = [];
      placements++;
    }
  }
  if ([...walk(document)].some(node => node.tagName === 'template' && /^[BP]:/.test(attr(node, 'id') || '')))
    throw new Error('Unresolved streamed Suspense boundary; no safe literal placement was found.');
  return placements;
}

export function inspectSsr(html) {
  const document = parse(html);
  const streamPlacements = materializeStream(document);
  const nodes = [...walk(document)];
  const css = nodes.filter(node => node.tagName === 'link' && attr(node, 'rel') === 'stylesheet')
    .map(node => attr(node, 'href')).filter(Boolean);
  const body = nodes.find(node => node.tagName === 'body');
  if (!body) throw new Error('SSR response has no body');
  const report = { streamPlacements, removedElements: 0, removedAttributes: 0, removedImages: 0 };
  const clean = node => {
    node.childNodes = children(node).filter(child => {
      const remove = child.nodeName === '#comment' || dropTags.has(child.tagName) || child.tagName === 'template';
      if (remove) report.removedElements++;
      return !remove;
    });
    for (const child of node.childNodes) {
      if (child.attrs) {
        child.attrs = child.attrs.filter(item => {
          // Keep local SVG fragment references, but all navigation/request
          // attributes and form submission targets are removed.
          const remove = item.name.startsWith('on') || item.name === 'srcdoc' ||
            (urlAttributes.has(item.name) && !(item.name === 'href' && item.value.startsWith('#') && child.namespaceURI?.includes('svg')));
          if (remove) report.removedAttributes++;
          return !remove;
        });
        const style = child.attrs.find(item => item.name === 'style');
        if (style && /url\s*\(|@import|expression\s*\(/i.test(style.value))
          throw new Error('Unexpected resource-bearing inline style');
        if (child.tagName === 'img') report.removedImages++;
        if (child.tagName === 'form') child.attrs.push({ name: 'data-qa-form-disabled', value: 'true' });
      }
      clean(child);
    }
  };
  clean(body);
  return { body: serialize(body), css, report };
}

export function safeCss(css) {
  // Compiled Tailwind may use embedded SVGs. Those are local data, never a fetch.
  if (/@import\s/i.test(css)) throw new Error('Unexpected CSS import in compiled stylesheet');
  for (const match of css.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)) {
    if (!/^data:image\//i.test(match[2]) && !match[2].startsWith('#'))
      throw new Error(`Unexpected compiled CSS resource: ${match[2].slice(0, 100)}`);
  }
  return css.replace(/\/\*[#@]\s*sourceMappingURL=[\s\S]*?\*\//g, '');
}

export function snapshotHtml({ body, stylesheets, title, label }) {
  const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  return `<!doctype html><html lang="ko" data-qa-synthetic="true" data-qa-version="${escape(label)}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">
<title>${escape(title)} | SYNTHETIC STATIC QA</title>
${stylesheets.map(href => `<link rel="stylesheet" href="${escape(href)}">`).join('\n')}
<link rel="stylesheet" href="../../assets/qa-font.css"></head><body>${body}</body></html>`;
}
