export function cleanBlogSummary(summary: string | null | undefined, content?: string | null): string | null {
  const normalizedSummary = normalizeSummary(summary)

  if (normalizedSummary) {
    return normalizedSummary
  }

  const normalizedContent = normalizeSummary(content)
  return normalizedContent
}

function normalizeSummary(source: string | null | undefined): string | null {
  if (!source) return null

  const beforeHeading = source.split(/\n(?=#+\s)/, 1)[0] ?? source
  const firstParagraph = beforeHeading
    .split(/\n\s*\n/, 1)[0]
    ?.replace(/\r/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!firstParagraph) return null

  const stripped = firstParagraph
    .replace(/^["']+/, '')
    .replace(/\s*[-–—:]\s*$/, '')
    .trim()

  if (!stripped) return null

  return stripped.length > 220 ? `${stripped.slice(0, 217).trimEnd()}...` : stripped
}
