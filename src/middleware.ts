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

// 옛 `?category=` 를 현재 `?reason=` 으로 옮긴다 (2026-10-11).
//
// GSC 가 아직 긁고 있는 옛 주소 10개를 받아 확인했다(9/25~9/28 크롤).
//   https://www.노란봉투법.com/search?category=sexual-harassment …
// 종전에는 /search → /decisions 로만 넘겨 쿼리가 `category=` 인 채 따라붙었고,
// /decisions 는 `reason=` 만 읽으므로 **필터가 통째로 날아갔다**(실측: 200 이지만 전체 목록).
//
// 🔴 next.config 의 redirects 로 하면 Next 가 원래 질의를 덧붙여
//    `/decisions?category=…&reason=…` 가 된다. 죽은 파라미터가 색인에 남아서 여기로 옮겼다.
//    미들웨어에서는 최종 URL 을 그대로 만들 수 있다.
//
// 이름을 짐작하지 않고 src/lib/types.ts 의 REASON_LABELS 와 하나씩 대조했다.
// 대응하는 reason 이 없는 둘(retirement · industrial-accident)은 여기 넣지 않는다 —
// next.config 의 포괄 규칙이 필터 없는 /decisions 로 보낸다. 홈으로 보내지 않는다.
const LEGACY_CATEGORY_TO_REASON: Record<string, string> = {
  'sexual-harassment': 'sexual_harassment',   // 성희롱
  'renewal-expectation': 'contract_expiry',   // 갱신기대권/계약만료
  'management-dismissal': 'redundancy',       // 경영상해고
  'dismissal-nonexistence': 'no_dismissal',   // 해고부존재/사직
  misconduct: 'misconduct',                   // 비위행위
  probation: 'probation',                     // 수습해고
  embezzlement: 'embezzlement',               // 횡령/배임
  discrimination: 'discrimination',           // 차별시정
}

export function middleware(request: NextRequest) {
  // Local-only document harness: gate before streaming and markdown negotiation.
  if ((request.nextUrl.pathname === '/ai/workspace' || request.nextUrl.pathname.startsWith('/ai/workspace/')) &&
      (process.env.NODE_ENV === 'production' || process.env.AI_WORKSPACE_DEMO !== 'true')) {
    return new NextResponse('Not found', { status: 404 });
  }
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

  // 옛 /search?category=… 는 호스트 정규화 뒤, 다른 처리보다 먼저 보낸다.
  if (request.nextUrl.pathname === '/search') {
    const legacy = request.nextUrl.searchParams.get('category')
    const reason = legacy ? LEGACY_CATEGORY_TO_REASON[legacy] : undefined
    const target = request.nextUrl.clone()
    target.pathname = '/decisions'
    if (reason) {
      target.search = ''                       // 죽은 category 를 버린다
      target.searchParams.set('reason', reason)
    } else if (legacy) {
      // 대응하는 reason 이 없는 옛 값(retirement · industrial-accident 등).
      // 억지로 끼워 맞추지 않고 필터 없는 허브로 보낸다. 홈으로 보내지 않는다.
      target.search = ''
    }
    // q= 같은 다른 질의는 그대로 둔다 — /decisions 가 읽는다(실측: /database?q= 44건이 이 경로다).
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
