import { NextRequest, NextResponse } from 'next/server'

const ASSET_FILE_REGEX = /\.[^/]+$/

export function middleware(request: NextRequest) {
  const accept = request.headers.get('accept') || ''
  const { pathname, search } = request.nextUrl

  // Markdown content negotiation: rewrite to dedicated markdown renderer.
  const wantsMarkdown = request.method === 'GET' && accept.includes('text/markdown')
  if (wantsMarkdown && !ASSET_FILE_REGEX.test(pathname)) {
    const rewriteUrl = request.nextUrl.clone()
    rewriteUrl.pathname = '/api/markdown'
    rewriteUrl.search = ''
    rewriteUrl.searchParams.set('path', `${pathname}${search}`)

    const response = NextResponse.rewrite(rewriteUrl)
    response.headers.set('Vary', 'Accept')
    response.headers.set('X-Markdown-Available', 'true')
    response.headers.set('Content-Signal', 'ai-train=yes, search=yes, ai-input=yes')
    response.headers.set('X-Robots-Tag', 'all')
    return response
  }

  const response = NextResponse.next()
  response.headers.set('Content-Signal', 'ai-train=yes, search=yes, ai-input=yes')
  response.headers.set('X-Robots-Tag', 'all')
  response.headers.set('Vary', 'Accept')
  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
}
