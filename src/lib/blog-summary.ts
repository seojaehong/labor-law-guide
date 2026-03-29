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
  // Markdown patterns
  if (/^(#{1,6}\s|[-*]\s|\d+\.\s|>\s|```)/.test(block)) return true
  // HTML block elements (headings, lists, tables, etc.)
  if (/^<(h[1-6]|ul|ol|li|table|blockquote|pre|hr|div|figure|details|summary)[\s>]/i.test(block)) return true
  return false
}

function sanitizeLeadText(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // [텍스트](URL) → 텍스트
    .replace(/<a[^>]*>([^<]*)<\/a>/g, '$1')    // <a href>텍스트</a> → 텍스트
    .replace(/<[^>]+>/g, '')                     // 기타 HTML 태그 제거
    .replace(/\*\*([^*]+)\*\*/g, '$1')          // **굵게** → 굵게
    .replace(/\*([^*]+)\*/g, '$1')              // *기울임* → 기울임
    .replace(/`([^`]+)`/g, '$1')                // `코드` → 코드
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
