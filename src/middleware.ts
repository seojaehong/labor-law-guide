import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const response = NextResponse.next()
  const accept = request.headers.get('accept') || ''

  // Content Signals header
  response.headers.set('Content-Signal', 'ai-train=yes, search=yes, ai-input=yes')

  // Markdown content negotiation
  if (accept.includes('text/markdown')) {
    response.headers.set('X-Markdown-Available', 'true')
    response.headers.set('Vary', 'Accept')
  }

  // Agent discovery
  response.headers.set('X-Robots-Tag', 'all')

  return response
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
