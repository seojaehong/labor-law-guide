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

  // 🔴 HTML 을 먼저 벗긴다 (2026-10-26). 종전에는 벗기지 않아서, content 가 한 덩이 HTML 이라
  // extractLeadFromMarkdown 이 블록을 못 나누고 여기로 되돌아오면 `<h2>오늘의 한 줄</h2> <p>…`
  // 가 그대로 화면에 찍혔다. 31일치 데일리 표본 가운데 8건이 그 경로였다.
  const tagless = /<[a-z!/][^>]*>/i.test(source) ? sanitizeLeadText(source) : source

  // Strip markdown heading lines entirely (# 도입부 → removed, not just marker)
  const headingStripped = tagless.replace(/^#{1,6}\s+.*$/gm, '').trim()
  const beforeHeading = headingStripped.split(/\n(?=#{1,6}\s)/, 1)[0] ?? headingStripped
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

  // 🔴 소수점을 문장 끝으로 읽지 않는다 (2026-10-26). 종전에는 「14.7%」가 「14.」/「7%…」로 갈려
  // 다시 이어 붙을 때 공백이 들어가 **「14. 7%」**로 찍혔다. 가려 두고 나중에 되돌린다.
  const DOT = '\u0001'
  const guarded = stripped.replace(/(\d)\.(\d)/g, `$1${DOT}$2`)
  const unguard = (text: string) => text.split(DOT).join('.')

  const sentenceChunks = guarded.match(/[^.!?…。]+[.!?…。]?/g)?.map((chunk) => chunk.trim()).filter(Boolean) ?? []

  if (sentenceChunks.length > 1) {
    let assembled = ''

    for (const chunk of sentenceChunks) {
      const candidate = assembled ? `${assembled} ${chunk}` : chunk
      if (candidate.length > options.maxLength) break
      assembled = candidate
      if (assembled.length >= options.preferredLength) {
        return unguard(assembled)
      }
    }

    if (assembled.length >= Math.min(140, options.preferredLength)) {
      return unguard(assembled)
    }
  }

  const fallback = unguard(guarded.slice(0, options.maxLength - 3)).trimEnd()
  return `${fallback}...`
}

function extractLeadFromMarkdown(
  source: string | null | undefined,
  options: { maxLength: number; preferredLength: number }
): string | null {
  if (!source) return null

  // 🔴 한 덩이로 온 HTML 도 블록으로 나눈다 (2026-10-26). 우리 본문은 빈 줄 없이
  // `<h2>…</h2><p>…</p>` 로 붙어 오는 일이 잦아서, 종전에는 전체가 한 블록이 되고
  // 그 블록이 `<h2`로 시작한다는 이유로 통째로 걸러져 블록이 0개가 됐다.
  const blocks = source
    .replace(/\r/g, '')
    .replace(/<\/(?:h[1-6]|p|ul|ol|li|table|blockquote|pre|div|figure|details)>\s*/gi, '$&\n\n')
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
    .replace(/^#{1,6}\s+/gm, '')                 // # 제목 → 제목
    .replace(/\s+/g, ' ')
    .replace(/^["']([^"']+)["']\s*/, '$1 ')
    .trim()
}

function shouldPreferContentLead(summary: string | null, contentLead: string | null): boolean {
  if (!contentLead) return false
  if (!summary) return true
  if (summary.includes('...')) return true
  if (/(?:^|\n)#{1,6}\s/.test(summary)) return true
  if (summary.includes('「근로자퇴')) return true
  if (summary.length < 160 && contentLead.length > summary.length + 40) return true
  return false
}
