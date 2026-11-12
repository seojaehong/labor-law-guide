import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import "@/components/editorial-navigation.css";
import GlassNav from "@/components/GlassNav";
import ConnectorBanner from "@/components/ConnectorBanner";
import SiteSurface from "@/components/SiteSurface";
import "@/components/site-refactor.css";
import { SITE_URL, BRAND_NAME, BRAND_DESCRIPTION } from "@/lib/constants";
import { CONTACT_EMAIL } from "@/lib/site-contact";
import { DISMISSED_CLASS as BANNER_DISMISSED_CLASS, STORAGE_KEY as BANNER_STORAGE_KEY } from "@/lib/connector-banner";

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
  // 261112 — 「노란봉투법 사이트」에서 「노동법 도구·정보 사이트」로. 종전 35개 중 노란봉투법 관련이 30개였다.
  // 노란봉투법 페이지(/guide 등)는 그대로 살아 있으니 두 개만 남긴다.
  keywords: [
    '노동법', '근로기준법', '노동법 계산기', '퇴직금 계산', '주휴수당 계산', '연차휴가 계산',
    '최저임금 확인', '실수령액 계산', '해고예고수당', '근로계약서 점검', '취업규칙 점검',
    '판례', '행정해석', '노동위원회 판정', '법령 개정', '4대보험 신고', '퇴사 점검',
    '노란봉투법', '개정 노동조합법',
  ],
  alternates: {
    // 🔴 canonical 은 여기 두지 않는다(261112). 여기 두면 alternates 를 안 적은 페이지가 홈 주소를 물려받아
    //    「홈의 사본」으로 신고된다 — /tools/work-rules 가 그랬다. 홈 canonical 은 src/app/page.tsx 에 있다.
    //    tests/unit/canonical-self.test.ts 가 막는다.
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
        {/* 261112 — 상단 안내 띠를 닫은 사람은 첫 페인트 전에 숨긴다. 서버는 띠를 그려 보내므로(CLS 방지)
            이 스크립트가 없으면 닫은 사람에게 잠깐 보인다. 키·클래스는 src/lib/connector-banner.ts 와 같아야 한다. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('${BANNER_STORAGE_KEY}')==='1'){document.documentElement.classList.add('${BANNER_DISMISSED_CLASS}')}}catch(e){}`,
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
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-GKKFCZ235H" strategy="lazyOnload" />
        <Script id="gtag-init" strategy="lazyOnload">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-GKKFCZ235H');`}</Script>
        <Script id="webmcp-init" strategy="afterInteractive">{`
          if (typeof navigator !== 'undefined' && navigator.modelContext) {
            navigator.modelContext.provideContext({
              tools: [
                {
                  name: 'search-labor-law',
                  description: '노동법 판례·행정해석을 검색합니다. 부당해고, 임금, 퇴직금, 직장 내 괴롭힘, 4대보험, 노동조합 등.',
                  inputSchema: { type: 'object', properties: { query: { type: 'string', description: '검색 키워드' } }, required: ['query'] },
                  execute: async (input) => { window.location.href = '/decisions?q=' + encodeURIComponent(input.query); return { success: true }; }
                },
                {
                  name: 'ask-ai',
                  description: 'AI 질의응답 화면을 열어 노동법 질문을 넣습니다.',
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
                  name: BRAND_NAME,
                  url: SITE_URL,
                  email: CONTACT_EMAIL,
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
        <ConnectorBanner />
        <GlassNav />
        <main id="site-main" tabIndex={-1}><SiteSurface>{children}</SiteSurface></main>
        <footer className="editorial-footer border-t py-10" style={{ borderColor: 'var(--color-border)' }}>
          {/* 2026-09-12 — 메뉴를 3개로 줄이면서 내려온 것들이 여기 산다.
              지운 게 아니라 자리를 옮긴 것이고, 크롤러가 들어갈 내부 링크도 여기서 유지된다.
              메뉴에 올릴 만큼은 아니지만 닿을 수 없으면 안 되는 것들이다. */}
          <div className="layout-wide layout-wide--chrome editorial-footer-brand">
            <p className="font-semibold">{BRAND_NAME}</p>
            <p className="text-sm">{BRAND_DESCRIPTION}</p>
          </div>
          {/* 261112 재홍님 — 「노란봉투법 껍데기는 벗는다」. 노란봉투법 전용 페이지(가이드·교섭절차·체크리스트·
              핵심판례·뉴스) 링크를 푸터에서 뺐다. 페이지와 사이트맵은 그대로 두어 검색 유입은 유지한다. */}
          <div className="layout-wide layout-wide--chrome mb-8 grid grid-cols-2 gap-x-6 gap-y-7 text-left sm:grid-cols-3">
            {[
              { title: '읽고 찾기', links: [
                { href: '/blog', label: '글' },
                { href: '/decisions', label: '판례·행정해석' },
                { href: '/decisions?type=court', label: '법원 판례' },
                { href: '/decisions?type=admin', label: '행정해석' },
              ] },
              { title: '실무도구·문의', links: [
                { href: '/tools/holiday-pay', label: '공휴일·노동절 수당 참고 계산' },
                { href: '/duties', label: '사업장 규모별 사업주 의무' },
                { href: '/contact', label: '서비스 문의' },
                { href: 'https://www.safeclaw.kr', label: '산업안전 점검 — SafeClaw', external: true },
              ] },
              { title: '검토 중 자료·기능', links: [
                { href: '/faq', label: 'FAQ' },
                { href: '/tools/contract-check', label: '근로계약서 점검' },
                { href: '/tools/contract-write', label: '근로계약서 작성' },
                { href: '/tools/severance.html', label: '퇴직금 계산' },
                { href: '/subsidy', label: '지원금 안내' },
                { href: '/ai', label: 'AI 질의응답' },
              ] },
            ].map((col) => (
              <div key={col.title}>
                <p className="mb-2.5 text-[13px] font-semibold" style={{ color: 'var(--grey-700)' }}>
                  {col.title}
                </p>
                {col.title.startsWith('검토 중') && <p className="mb-3 text-xs" style={{ color: 'var(--grey-700)' }}>내용과 적용 조건을 확인 중입니다. 이용 전 원문과 전문가 확인이 필요합니다.</p>}
                <ul className="space-y-1.5">
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <a href={l.href} {...('external' in l && l.external ? { target: '_blank', rel: 'noopener' } : {})} className="text-[13px]" style={{ color: 'var(--grey-700)' }}>
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
              <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-2" style={{ color: 'var(--color-accent-ink)' }}>{CONTACT_EMAIL}</a>
              {' '}|{' '}
              <a href="/contact" className="underline underline-offset-2" style={{ color: 'var(--color-accent-ink)' }}>문의 접수</a>
              {' '}| <a href="/privacy" className="underline underline-offset-2" style={{ color: 'var(--color-accent-ink)' }}>개인정보처리방침</a>
              {' '}| <a href="/terms" className="underline underline-offset-2" style={{ color: 'var(--color-accent-ink)' }}>이용약관</a>
            </p>
            {/* 261112 — 종전 12px · --color-text-tertiary 로 1.89:1 이었다. 푸터는 .public-surface 밖이라
                그쪽의 13px·tertiary 재매핑이 닿지 않는다. 13px · --grey-700 + 상시 밑줄 링크(§6.8)로 올린다. */}
            <p className="mt-2 text-[13px]" style={{ color: 'var(--grey-700)' }}>
              관련 블로그:{' '}
              <a href="https://node.pe.kr" target="_blank" rel="noopener" className="underline underline-offset-2" style={{ color: 'var(--color-accent-ink)' }}>NODE — 노동·HR 딥다이브</a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
