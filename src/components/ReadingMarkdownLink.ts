import { createElement, type AnchorHTMLAttributes } from 'react';

type ReadingLinkProps = Pick<AnchorHTMLAttributes<HTMLAnchorElement>,
  'href' | 'id' | 'title' | 'role' | 'children' | 'aria-label' | 'aria-describedby'
> & {
  variant?: 'blog' | 'snippet';
  'data-footnote-ref'?: boolean | string;
  'data-footnote-backref'?: boolean | string;
};

/** DOM attributes are explicitly allowlisted; never forward node, events or raw styles. */
export default function ReadingMarkdownLink({
  href, id, title, role, children, variant = 'snippet',
  'aria-label': ariaLabel, 'aria-describedby': ariaDescribedBy,
  'data-footnote-ref': footnoteRef, 'data-footnote-backref': footnoteBackref,
}: ReadingLinkProps) {
  const isFootnote = footnoteRef !== undefined || footnoteBackref !== undefined;
  // Blog keeps its existing rehype-sanitize clobber protection. That sanitizer
  // prefixes generated IDs a second time, but not hash hrefs; align only marked
  // footnote references with those protected IDs. Snippets do not run raw HTML.
  const safeHref = variant === 'blog' && isFootnote && href?.startsWith('#user-content-fn')
    ? `#user-content-${href.slice(1)}` : href;
  const isFragment = safeHref?.startsWith('#');
  return createElement('a', {
    href: safeHref, id, title, role,
    'aria-label': ariaLabel, 'aria-describedby': ariaDescribedBy,
    'data-footnote-ref': footnoteRef, 'data-footnote-backref': footnoteBackref,
    target: isFragment ? undefined : '_blank',
    rel: isFragment ? undefined : 'noopener noreferrer',
    className: variant === 'blog' ? 'blog-link' : 'underline underline-offset-[0.2em] decoration-1',
    style: variant === 'snippet' ? { color: 'var(--color-accent-ink)' } : undefined,
  }, children);
}
