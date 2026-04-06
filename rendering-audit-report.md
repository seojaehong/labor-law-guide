# Rendering Audit Report - 노란봉투법.com

**Date**: 2026-04-03
**Auditor**: Claude Opus 4.6
**Scope**: All pages on production (https://www.xn--o80bk8isxeinax68f.com) + dev server (localhost:3000)

---

## Summary

Total issues found: **5** (1 CRITICAL, 2 HIGH, 1 MEDIUM, 1 LOW)

Production site overall renders well. Blog articles with HTML content (`<p>`, `<h2>`, `<strong>`) are correctly processed by ReactMarkdown + rehypeRaw + rehypeSanitize. However, 2 blog articles have raw markdown headings (`#`) leaking into the summary display box, and the `cleanBlogSummary` function has a gap in handling summaries that start with single `#` headings.

---

## Issues

### 1. [CRITICAL] Blog summary box shows raw `#` markdown headings

**Pages affected**:
- `/blog/20260402-2`
- `/blog/20260402-3`

**Description**: The blue summary box at the top of these blog articles displays raw markdown `# 서론` and `# 도입부` as literal text instead of being stripped or converted.

**Root cause**: `cleanBlogSummary()` in `src/lib/blog-summary.ts` has two gaps:
1. `normalizeSummary()` splits on `\n(?=#+\s)` (newline before heading), but if the summary **starts** with `#` (no preceding newline), the heading is included in the output.
2. `shouldPreferContentLead()` only checks for `##` and `###`, not single `#`. So summaries starting with `# heading` are not redirected to the content lead.

**Affected file**: `src/lib/blog-summary.ts`

**Suggested fix**:
```typescript
// In normalizeSummary(), add stripping of leading # headings:
const beforeHeading = source
  .replace(/^#{1,6}\s+[^\n]*/m, '')  // Strip leading heading
  .split(/\n(?=#+\s)/, 1)[0] ?? source;

// In shouldPreferContentLead(), also check for single #:
if (summary.includes('#') && /(?:^|\s)#\s/.test(summary)) return true;
```

---

### 2. [HIGH] Dev server Supabase connection broken (Invalid API key)

**Pages affected**: ALL pages on dev server (localhost:3000)

**Description**: The `supabaseServer` client returns "Invalid API key" for all server-side data fetches on localhost. This causes:
- Home page shows 0 for all stats (판례 0건, 행정해석 0건, 뉴스 0건)
- Blog list page shows empty (no articles)
- Blog article pages return 404
- Database page loads but server-side counts fail

**Root cause**: The `.env.local` anon key appears valid (works via direct REST API with service role key), but the server-side Next.js process rejects it. This may be a Supabase project API key rotation issue or an environment variable loading problem in Next.js 16 dev mode.

**Note**: Production (Vercel) works correctly, suggesting Vercel has different/correct env vars.

**Affected files**: `src/lib/supabase-server.ts`, `.env.local`

**Suggested fix**: Verify the anon key in `.env.local` matches the current Supabase project dashboard. If keys have been rotated, update `.env.local`. Also check if `SUPABASE_SERVICE_ROLE_KEY` should be used for server components instead of the anon key.

---

### 3. [HIGH] `cleanBlogSummary` doesn't strip `#` headings from start of summary

**Pages affected**: Any future blog articles where the `summary` field starts with markdown headings.

**Description**: The `cleanBlogSummary` function is designed to clean raw markdown from blog summaries before display. However, it misses the case where a summary **begins** with a `#` heading (no preceding paragraph).

**Affected file**: `src/lib/blog-summary.ts`

**Details**:
- `normalizeSummary()` line: `source.split(/\n(?=#+\s)/, 1)[0]` -- only splits at `\n#`, not at leading `#`
- `isNonProseBlock()` correctly filters `#` blocks, but `extractLeadFromMarkdown()` falls back to `normalizeSummary()` when all blocks are filtered, re-introducing the heading text
- `shouldPreferContentLead()` checks for `##` and `###` but not `#`
- `sanitizeLeadText()` strips `**bold**` and links but not `#` headings

**Suggested fix**: Add heading stripping to `normalizeSummary()`:
```typescript
// At the start of normalizeSummary, strip markdown headings
const cleaned = source.replace(/^#{1,6}\s+/gm, '').trim();
const beforeHeading = cleaned.split(/\n(?=#{1,6}\s)/, 1)[0] ?? cleaned;
```

---

### 4. [MEDIUM] News briefing `renderMarkdown` uses naive regex-based HTML conversion

**Page affected**: `/news` (briefing section)

**Description**: The `renderMarkdown()` function in `NewsClient.tsx` uses simple regex replacements to convert markdown to HTML. While it works for the current briefing data format, it has edge cases:
- Nested bold/list combinations may break
- Multi-line list items aren't handled
- No `<ul>` wrapper around `<li>` elements (invalid HTML)
- Single `\n` between list items is replaced with space, which can merge list items

**Current behavior**: For the current briefing content (simple `##`, `**bold**`, `- list`), this works correctly. But it's fragile.

**Affected file**: `src/app/news/NewsClient.tsx` (lines 36-44)

**Suggested fix**: Replace `renderMarkdown` with `ReactMarkdown` component (already imported in the file's dependencies) for consistent rendering with the database page's `MarkdownSnippet`.

---

### 5. [LOW] Missing `<ul>` wrapper in news briefing rendered HTML

**Page affected**: `/news` (briefing section)

**Description**: The `renderMarkdown` function generates `<li>` elements without wrapping them in a `<ul>` or `<ol>` parent element. While browsers handle this gracefully, it's technically invalid HTML and may cause accessibility issues with screen readers.

**Affected file**: `src/app/news/NewsClient.tsx` line 41

**Suggested fix**: Add `<ul>` wrapper detection after the list item replacement.

---

## Pages Checked - No Issues Found

| Page | Status | Notes |
|------|--------|-------|
| `/` (home) | OK | Production shows correct stats. Dev shows 0 (Issue #2) |
| `/blog` (list) | OK | Article cards render properly on production |
| `/blog/20260403-4` | OK | HTML content renders correctly via ReactMarkdown |
| `/blog/daily-20260403-01` | OK | Headings, bold, lists all render properly |
| `/blog/20260403-5` | OK | No rendering issues |
| `/database` | OK | Search interface, tabs, cards render properly |
| `/database?q=...` | OK | MarkdownSnippet renders case summaries correctly |
| `/cases` | OK | Key cases data is clean, renders properly |
| `/checklist` | OK | Interactive checklists render properly |
| `/guide` | OK | 3-panel layout, sections, comparison tables render |
| `/manual` | OK | Step diagram, checklists, callouts render properly |
| `/ai` | OK | Chat interface, FAQ, glossary tabs render |
| `/contact` | OK | Contact form, FAQ, sidebar render properly |
| `/admin` | OK | Admin interface renders |

## Data Quality Check

| Data Source | Records | Bold (`**`) | Headings (`##`) | Spacing Issues |
|-------------|---------|-------------|-----------------|----------------|
| Blog summaries | 100 checked | 0 issues | 2 articles (20260402-2, 20260402-3) | 1 double space |
| Blog content (HTML) | 20 checked | Clean (uses `<strong>`) | Clean (uses `<h2>`) | No real issues |
| Case holding_points | 5 checked | Clean | Clean | Clean |
| NLRC holding_points | 5 with `##` found | N/A | Handled by `normalizeSnippetMarkdown` | Clean |
| News briefings | Latest checked | Clean (rendered by `renderMarkdown`) | Clean (rendered) | Clean |

## Architecture Notes

- **Blog content format**: All blog articles store content as HTML (`<p>`, `<h2>`, `<strong>`), not markdown. The ReactMarkdown + rehypeRaw + rehypeSanitize pipeline correctly handles this.
- **Database snippets**: NLRC decisions may contain markdown headings (`#`, `##`), which are properly converted by `normalizeSnippetMarkdown()` before rendering with `MarkdownSnippet`.
- **News briefings**: Briefing content is stored as markdown, converted to HTML by the `renderMarkdown()` regex function. Works for current data but is fragile.
- **Blog summaries**: Stored as plain text, displayed directly in `<p>` tags (not through ReactMarkdown). Any markdown artifacts in the summary field will show as raw text.

---

## Priority Fix Order

1. **Fix `cleanBlogSummary`** to strip `#` headings from summaries (affects 2 live articles)
2. **Update env vars** for dev server Supabase connection
3. **Consider replacing `renderMarkdown`** in NewsClient with ReactMarkdown for robustness
