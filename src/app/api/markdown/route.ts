import { NextRequest, NextResponse } from 'next/server'

const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8'

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
  }

  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&(nbsp|amp|lt|gt|quot);|&#39;/g, (entity) => named[entity] ?? entity)
}

function cleanWhitespace(value: string): string {
  return value
    .replace(/\r/g, '')
    .replace(/\t/g, ' ')
    .replace(/[ \u00A0]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function htmlToMarkdown(html: string, sourcePath: string): string {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch ? cleanWhitespace(decodeHtmlEntities(titleMatch[1].replace(/<[^>]+>/g, ''))) : null

  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
  let content = mainMatch ? mainMatch[1] : html

  content = content
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '')
    .replace(/<img\b[^>]*>/gi, '')

  content = content
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n')
    .replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n')
    .replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
    .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/(strong|b)>/gi, '**$2**')
    .replace(/<(em|i)[^>]*>([\s\S]*?)<\/(em|i)>/gi, '*$2*')
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|header|footer|nav|ul|ol|table|tr|blockquote)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')

  content = cleanWhitespace(decodeHtmlEntities(content))

  const parts = [
    title ? `# ${title}` : null,
    `> Source: ${sourcePath}`,
    '',
    content,
  ].filter(Boolean)

  return cleanWhitespace(parts.join('\n')) + '\n'
}

function markdownResponse(markdown: string, status = 200): NextResponse {
  const tokenCount = markdown.split(/\s+/).filter(Boolean).length
  return new NextResponse(markdown, {
    status,
    headers: {
      'Content-Type': MARKDOWN_CONTENT_TYPE,
      Vary: 'Accept',
      'X-Markdown-Tokens': String(tokenCount),
    },
  })
}

function normalizePath(path: string | null): string {
  if (!path) return '/'
  try {
    const decoded = decodeURIComponent(path)
    if (!decoded.startsWith('/')) return '/'
    return decoded
  } catch {
    return '/'
  }
}

export async function GET(request: NextRequest) {
  const requestedPath = normalizePath(request.nextUrl.searchParams.get('path'))
  const host = request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto') ?? 'https'

  if (!host) {
    return markdownResponse('# Markdown unavailable\n\nHost header is missing.\n', 400)
  }

  const targetUrl = `${proto}://${host}${requestedPath}`

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'AEO-Markdown-Renderer/1.0',
      },
      cache: 'no-store',
    })

    if (!upstream.ok) {
      return markdownResponse(`# Markdown unavailable\n\nCould not fetch ${requestedPath} (status ${upstream.status}).\n`, upstream.status)
    }

    const html = await upstream.text()
    const markdown = htmlToMarkdown(html, requestedPath)
    if (!markdown.trim()) {
      return markdownResponse(`# Markdown unavailable\n\n${requestedPath} produced empty content.\n`, 502)
    }

    return markdownResponse(markdown)
  } catch (error) {
    return markdownResponse(`# Markdown unavailable\n\nFailed to render ${requestedPath}.\n\n${String(error)}\n`, 500)
  }
}
