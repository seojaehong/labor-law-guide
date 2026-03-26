export function cleanBlogSummary(summary: string | null | undefined, content?: string | null): string | null {
  const normalizedSummary = normalizeSummary(summary, { maxLength: 220, preferredLength: 180 })
  const contentLead = extractLeadFromMarkdown(content, { maxLength: 240, preferredLength: 200 })

  if (shouldPreferContentLead(normalizedSummary, contentLead)) {
    return contentLead
  }

  if (normalizedSummary) {
    return normalizedSummary
  }

  return contentLead
}

export function extractBlogLead(content: string | null | undefined): string | null {
  return extractLeadFromMarkdown(content, { maxLength: 520, preferredLength: 360 })
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

function extractLeadFromMarkdown(
  source: string | null | undefined,
  options: { maxLength: number; preferredLength: number }
): string | null {
  if (!source) return null

  const blocks = source
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .filter((block) => !isNonProseBlock(block))
    .map((block) => sanitizeLeadText(block))

  if (blocks.length === 0) {
    return normalizeSummary(source, options)
  }

  let assembled = ''

  for (const block of blocks) {
    const candidate = assembled ? `${assembled} ${block}` : block
    if (candidate.length > options.maxLength) {
      if (!assembled) {
        return normalizeSummary(block, options)
      }
      break
    }

    assembled = candidate

    if (assembled.length >= options.preferredLength) {
      return assembled
    }
  }

  return assembled || null
}

function isNonProseBlock(block: string): boolean {
  return /^(#{1,6}\s|[-*]\s|\d+\.\s|>\s|```)/.test(block)
}

function sanitizeLeadText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/^["']([^"']+)["']\s*/, '$1 ')
    .trim()
}

function shouldPreferContentLead(summary: string | null, contentLead: string | null): boolean {
  if (!contentLead) return false
  if (!summary) return true
  if (summary.includes('...')) return true
  if (summary.includes('##') || summary.includes('###')) return true
  if (summary.includes('「근로자퇴')) return true
  if (summary.length < 160 && contentLead.length > summary.length + 40) return true
  return false
}
