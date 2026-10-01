import { NextRequest, NextResponse } from 'next/server'

const ASSET_FILE_REGEX = /\.[^/]+$/

// www → non-www 301.
//
// 2026-07-16 에 처방이 나왔는데 2.5개월 미뤄진 것이다. www·non-www 가 둘 다 301 없이 200 을
// 내보내서 모든 페이지가 두 주소로 존재했다. 그 결과:
//   · 구글 Search Console 에 사이트맵이 **두 개** 잡혔고(2026-10-01 정리),
//     「적절한 표준 태그가 포함된 대체 페이지」 288건 · 「표준 없는 중복」 112건이 여기서 나왔다
//   · 네이버는 www 속성만 등록돼 있었는데 정작 색인된 URL 은 전부 non-www 라
//     사이트맵 제출이 「피드 내 모든 URL 은 동일 도메인이어야」 조건에 걸렸다
// canonical 은 원래부터 전부 non-www 라 방향이 맞다.
//
// 순서를 지켰다 — 네이버에 non-www 속성을 먼저 등록·소유확인하고 사이트맵·RSS 제출까지
// 끝낸 뒤에 올린다(2026-10-01 완료). 먼저 걸면 www 속성 소유확인이 리다이렉트로 깨진다.
const CANONICAL_HOST = 'yellowenvelope.kr'

export function middleware(request: NextRequest) {
  // Cloudflare 가 앞단에 있으므로 nextUrl.host 가 아니라 Host 헤더를 본다.
  const host = (request.headers.get('host') || '').toLowerCase().split(':')[0]
  if (host === `www.${CANONICAL_HOST}`) {
    const target = request.nextUrl.clone()
    target.host = CANONICAL_HOST
    target.port = ''
    target.protocol = 'https:'
    // 308 이 아니라 301 이다. 검색엔진의 정규화 신호로 쓰는 것이고, 메서드 보존이 필요 없다.
    return NextResponse.redirect(target, 301)
  }

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
