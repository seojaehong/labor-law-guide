export function cleanBlogSummary(summary: string | null | undefined, content?: string | null): string | null {
  const normalizedSummary = normalizeSummary(summary, { maxLength: 220, preferredLength: 180 })

  if (normalizedSummary) {
    return normalizedSummary
  }

  const normalizedContent = normalizeSummary(content, { maxLength: 220, preferredLength: 180 })
  return normalizedContent
}

export function extractBlogLead(content: string | null | undefined): string | null {
  return normalizeSummary(content, { maxLength: 420, preferredLength: 320 })
}

function normalizeSummary(
  source: string | null | undefined,
  options: { maxLength: number; preferredLength: number }
): string | null {
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

  if (stripped.length <= options.maxLength) {
    return stripped
  }

  const sentenceChunks = stripped.match(/[^.!?…。]+[.!?…。]?/g)?.map((chunk) => chunk.trim()).filter(Boolean) ?? []

  if (sentenceChunks.length > 1) {
    let assembled = ''

    for (const chunk of sentenceChunks) {
      const candidate = assembled ? `${assembled} ${chunk}` : chunk
      if (candidate.length > options.maxLength) break
      assembled = candidate
      if (assembled.length >= options.preferredLength) {
        return assembled
      }
    }

    if (assembled.length >= Math.min(140, options.preferredLength)) {
      return assembled
    }
  }

  const fallback = stripped.slice(0, options.maxLength - 3).trimEnd()
  return `${fallback}...`
}
