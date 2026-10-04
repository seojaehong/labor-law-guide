import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import "@/components/editorial-navigation.css";
import GlassNav from "@/components/GlassNav";
import { SITE_URL, BRAND_NAME, BRAND_DESCRIPTION } from "@/lib/constants";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${BRAND_NAME} | 노동법·판례·실무 가이드`,
    // 접미사 없음 (2026-08-30).
    // 이전 값: '%s | 노란봉투법 가이드' — 모든 페이지 제목에 10자를 강제로 덧붙였다.
    // 한글 검색결과에서 실제로 보이는 제목은 약 35자인데, seo_title 평균 39자에
    // 접미사 10자가 더해져 SERP 제목이 평균 51자가 됐고 99%가 잘렸다.
    // 잘리는 구간이 하필 브랜드명이라 브랜드 노출 효과도 없이 말줄임표만 남았다.
    // GSC 실측: 평균순위 6.2인데 CTR 0.9% — 순위는 나오는데 클릭이 안 되는 전형적 신호.
    // 브랜드는 sitelink/도메인으로 이미 노출되므로 제목에서는 뺀다.
    template: '%s',
  },
  description: BRAND_DESCRIPTION,
  keywords: [
    '노란봉투법', '노란봉투법 뜻', '노란봉투법 뜻 쉽게', '노란봉투법이란', '노란봉투법이란 무엇인가',
    '노란봉투법 내용', '노란봉투법 정리', '노란봉투법 요약', '노란봉투법 대응',
    '노란봉투법 시행', '노란봉투법 시행일', '노란봉투법 시행령',
    '노란봉투법 하도급', '노란봉투법 공공기관', '노란봉투법 손해배상', '노란봉투법 폐지',
    '노란봉투법 자가진단', '노란봉투법 체크리스트', '노란봉투법 교섭',
    '개정 노동조합법', '사용자 범위 확대', '원하청 교섭', '노동쟁의', '사용자성 판단',
    '교섭창구 단일화', '위장도급', '불법파견', '교섭절차', '하청 교섭',
    '노동조합법 2026', '계약외사용자', '부당노동행위', '노무법인 위너스',
    '원청 교섭 의무', '교섭단위 분리', '사내하청 교섭',
  ],
  alternates: {
    canonical: SITE_URL,
    // 네이버 서치어드바이저는 RSS를 사이트맵보다 적극적으로 수집한다.
    // <link rel="alternate" type="application/rss+xml">로 노출시켜 자동 발견을 돕는다.
    types: { 'application/rss+xml': `${SITE_URL}/rss.xml` },
  },
  openGraph: {
    title: BRAND_NAME,
    description: BRAND_DESCRIPTION,
    type: 'website',
    url: SITE_URL,
    locale: 'ko_KR',
    siteName: BRAND_NAME,
  },
  twitter: {
    card: 'summary_large_image',
    title: BRAND_NAME,
    description: BRAND_DESCRIPTION,
  },
  robots: { index: true, follow: true, 'max-snippet': -1, 'max-image-preview': 'large' as const },
  verification: {
    google: 'LBQPkEpc1Dd33Z69iOtHpXKmdIyaR1yFmyDpS0StKhM',
    other: {
      // 네이버는 **속성마다 다른 토큰**을 준다. 배열로 주면 메타가 두 개 렌더된다.
      //   9d48c445… = 기존 www 속성 (지우면 그쪽 확인이 깨진다)
      //   43d700b6… = non-www 속성 (2026-10-01 신설)
      // 네이버가 색인해 결과에 띄우는 URL 은 전부 non-www 인데 등록된 속성은 www 뿐이었다.
      // 그래서 사이트맵을 www 에 제출해도 안쪽 1,089개가 전부 non-www 라
      // 「피드 내 모든 URL 은 소유확인된 사이트와 동일 도메인」 조건에 걸린다.
      'naver-site-verification': [
        '9d48c445a2470f46da348a2399fb24fbb041ee03',
        '43d700b6ebbfd8bafd3f24c7b675e0e561a881d9',
      ],
    },
  },
  other: {
    'geo.region': 'KR-11',
    'geo.placename': 'Seoul, Seocho-gu',
    'geo.position': '37.4969;127.0073',
    'ICBM': '37.4969, 127.0073',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // suppressHydrationWarning: 아래 pre-hydration 스크립트가 SSR HTML에 없는 .dark를 <html>에 붙이므로 속성 불일치가 정상 동작이다
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* pre-hydration 테마 선반영 — 다크 사용자 FOUC 제거. 판정식은 ThemeToggle.tsx와 동일해야 한다. DESIGN.md §9 P0-3 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var s=localStorage.getItem('theme');if(s==='dark'||(!s&&matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}`,
          }}
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* §9 P6-1 브라우저 크롬 색 — 종전 #1d4ed8은 팔레트에 없는 제3의 파랑이었다.
            "크롬 색 = 페이지 최상단에 보이는 것"으로 맞춘다: 라이트는 glass 네비가 흰색으로 렌더되므로
            --color-bg-surface(#ffffff), 다크는 페이지 바탕 --color-bg-primary(#0f1117).
            ★ theme-color는 리터럴만 받으므로 var() 불가. 또 media는 OS의 prefers-color-scheme만 타고
              이 사이트의 테마 축(.dark 클래스 + localStorage)은 못 읽는다 — 토글로만 다크인 방문자는 라이트 크롬을 본다. */}
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0f1117" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="preload"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />
        <link
          rel="stylesheet"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-GKKFCZ235H" strategy="lazyOnload" />
        <Script id="gtag-init" strategy="lazyOnload">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-GKKFCZ235H');`}</Script>
        <Script id="webmcp-init" strategy="afterInteractive">{`
          if (typeof navigator !== 'undefined' && navigator.modelContext) {
            navigator.modelContext.provideContext({
              tools: [
                {
                  name: 'search-labor-law',
                  description: '노동법 관련 정보를 검색합니다. 노란봉투법, 부당해고, 임금체불, 직장내괴롭힘, 4대보험 등.',
                  inputSchema: { type: 'object', properties: { query: { type: 'string', description: '검색 키워드' } }, required: ['query'] },
                  execute: async (input) => { window.location.href = '/decisions?q=' + encodeURIComponent(input.query); return { success: true }; }
                },
                {
                  name: 'ai-consultation',
                  description: 'AI 노동법 상담을 시작합니다.',
                  inputSchema: { type: 'object', properties: { question: { type: 'string', description: '질문 내용' } }, required: ['question'] },
                  execute: async (input) => { window.location.href = '/ai?q=' + encodeURIComponent(input.question); return { success: true }; }
                }
              ]
            });
          }
        `}</Script>
      </head>
      <body>
        {/* WebSite + Organization JSON-LD */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@graph': [
                {
                  '@type': 'WebSite',
                  '@id': `${SITE_URL}/#website`,
                  name: BRAND_NAME,
                  description: BRAND_DESCRIPTION,
                  url: SITE_URL,
                  inLanguage: 'ko',
                  publisher: { '@id': `${SITE_URL}/#organization` },
                  potentialAction: {
                    '@type': 'SearchAction',
                    target: `${SITE_URL}/decisions?q={search_term_string}`,
                    'query-input': 'required name=search_term_string',
                  },
                },
                {
                  '@type': 'Organization',
                  '@id': `${SITE_URL}/#organization`,
                  name: '노무법인 위너스',
                  url: 'https://winhr.co.kr',
                  address: {
                    '@type': 'PostalAddress',
                    streetAddress: '나루터로 61, 402호(태승빌딩)',
                    addressLocality: '서초구',
                    addressRegion: '서울특별시',
                    postalCode: '06653',
                    addressCountry: 'KR',
                  },
                  areaServed: { '@type': 'Country', name: 'KR' },
                  contactPoint: [
                    {
                      '@type': 'ContactPoint',
                      contactType: 'customer support',
                      availableLanguage: ['Korean'],
                      url: `${SITE_URL}/contact`,
                    },
                  ],
                },
              ],
            }),
          }}
        />
        <a className="editorial-skip-link" href="#site-main">본문 바로가기</a>
        <GlassNav />
        <main id="site-main" tabIndex={-1}>{children}</main>
        <footer className="editorial-footer border-t py-10" style={{ borderColor: 'var(--color-border)' }}>
          {/* 2026-09-12 — 메뉴를 3개로 줄이면서 내려온 것들이 여기 산다.
              지운 게 아니라 자리를 옮긴 것이고, 크롤러가 들어갈 내부 링크도 여기서 유지된다.
              메뉴에 올릴 만큼은 아니지만 닿을 수 없으면 안 되는 것들이다. */}
          <div className="layout-wide layout-wide--chrome editorial-footer-brand">
            <p className="font-semibold">{BRAND_NAME}</p>
            <p className="text-sm">노무법인 위너스</p>
          </div>
          <div className="layout-wide layout-wide--chrome mb-8 grid grid-cols-2 gap-x-6 gap-y-7 text-left sm:grid-cols-4">
            {[
              { title: '읽고 찾기', links: [
                { href: '/blog', label: '글' },
                { href: '/decisions', label: '판례·행정해석' },
                { href: '/decisions?type=court', label: '법원 판례' },
                { href: '/decisions?type=admin', label: '행정해석' },
              ] },
              { title: '실무도구·문의', links: [
                { href: '/tools/holiday-pay', label: '공휴일·노동절 수당 참고 계산' },
                { href: '/contact', label: '전문서비스 문의' },
              ] },
              { title: '검토 중 자료', links: [
                { href: '/guide', label: '핵심 가이드' },
                { href: '/manual', label: '교섭절차' },
                { href: '/faq', label: 'FAQ' },
                { href: '/cases', label: '핵심 판례 해설' },
                { href: '/news', label: '노동 뉴스' },
              ] },
              { title: '검토 중 기능', links: [
                { href: '/checklist', label: '자가진단' },
                { href: '/tools/contract-check', label: '근로계약서 점검' },
                { href: '/tools/severance.html', label: '퇴직금 계산' },
                { href: '/subsidy', label: '지원금 안내' },
                { href: '/ai', label: 'AI 상담' },
              ] },
            ].map((col) => (
              <div key={col.title}>
                <p className="mb-2.5 text-xs font-semibold" style={{ color: 'var(--grey-700)' }}>
                  {col.title}
                </p>
                {col.title.startsWith('검토 중') && <p className="mb-3 text-xs" style={{ color: 'var(--grey-700)' }}>내용과 적용 조건을 확인 중입니다. 이용 전 원문과 전문가 확인이 필요합니다.</p>}
                <ul className="space-y-1.5">
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <a href={l.href} className="text-[13px]" style={{ color: 'var(--grey-700)' }}>
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="layout-wide layout-wide--chrome text-center">
            <p className="text-sm" style={{ color: 'var(--grey-700)' }}>
              © 2026 {BRAND_NAME}. 본 사이트는 법률 자문이 아닌 정보 제공 목적입니다.
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--grey-700)' }}>
              {/* §6.8 — 산문 링크는 상시 밑줄 + --color-accent-ink. 이 푸터는 전 라우트에 뜨므로
                  hover-only 밑줄 + --color-accent(3.55:1)는 사이트 전체에서 1.4.1·1.4.3을 어긴다. */}
              <a href="https://winhr.co.kr" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" style={{ color: 'var(--color-accent-ink)' }}>노무법인 위너스</a>
              {' '}| 서울시 서초구 나루터로 61, 402호 |{' '}
              <a href="/contact" className="underline underline-offset-2" style={{ color: 'var(--color-accent-ink)' }}>온라인 상담 접수</a>
              {' '}| <a href="/privacy" className="underline underline-offset-2" style={{ color: 'var(--color-accent-ink)' }}>개인정보처리방침</a>
              {' '}| <a href="/terms" className="underline underline-offset-2" style={{ color: 'var(--color-accent-ink)' }}>이용약관</a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
