import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import GlassNav from "@/components/GlassNav";
import BetaBanner from "@/components/BetaBanner";
import { SITE_URL } from "@/lib/constants";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: '노란봉투법 완벽 가이드 | 2026 개정 노동조합법 해석지침·교섭절차',
    template: '%s | 노란봉투법 가이드',
  },
  description: '2026년 3월 시행 노란봉투법(개정 노동조합법) 완벽 가이드. 노란봉투법 뜻·내용 정리, 사용자성 자가진단, 원하청 교섭절차, 핵심판례, AI 상담. 노란봉투법 대응·하도급·공공기관·손해배상 제한까지. 노무법인 위너스.',
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
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: '노란봉투법 완벽 가이드 | 뜻·내용·대응·하도급·공공기관 | 2026 개정 노동조합법',
    description: '노란봉투법 뜻, 핵심 내용 정리, 사용자성 자가진단, 원하청 교섭절차, 대응 방법. 하도급·공공기관·손해배상 제한. 노무법인 위너스.',
    type: 'website',
    url: SITE_URL,
    locale: 'ko_KR',
    siteName: '노란봉투법 가이드',
  },
  twitter: {
    card: 'summary_large_image',
    title: '노란봉투법 완벽 가이드 | 2026 개정 노동조합법',
    description: '사용자 범위 확대·노동쟁의·원하청 교섭절차·AI 상담',
  },
  robots: { index: true, follow: true, 'max-snippet': -1, 'max-image-preview': 'large' as const },
  verification: {
    google: 'LBQPkEpc1Dd33Z69iOtHpXKmdIyaR1yFmyDpS0StKhM',
    other: {
      'naver-site-verification': '9d48c445a2470f46da348a2399fb24fbb041ee03',
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
  return (
    <html lang="ko">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#1d4ed8" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="preload"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <link
          rel="stylesheet"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
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
                  execute: async (input) => { window.location.href = '/database?q=' + encodeURIComponent(input.query); return { success: true }; }
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
                  name: '노란봉투법 완벽 가이드',
                  description: '2026 개정 노동조합법 해석지침, 교섭절차 매뉴얼, AI 상담',
                  url: SITE_URL,
                  inLanguage: 'ko',
                  publisher: { '@id': `${SITE_URL}/#organization` },
                  potentialAction: {
                    '@type': 'SearchAction',
                    target: `${SITE_URL}/database?q={search_term_string}`,
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
        <GlassNav />
        <BetaBanner />
        <main>{children}</main>
        <footer className="border-t py-10" style={{ borderColor: 'var(--color-border)' }}>
          <div className="mx-auto max-w-[1400px] px-5 text-center">
            <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
              © 2026 노란봉투법 가이드. 본 사이트는 법률 자문이 아닌 정보 제공 목적입니다.
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              <a href="https://winhr.co.kr" target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: 'var(--color-accent)' }}>노무법인 위너스</a>
              {' '}| 서울시 서초구 나루터로 61, 402호 |{' '}
              <a href="/contact" style={{ color: 'var(--color-accent)' }}>온라인 상담 접수</a>
              {' '}| <a href="/privacy" style={{ color: 'var(--color-accent)' }}>개인정보처리방침</a>
              {' '}| <a href="/terms" style={{ color: 'var(--color-accent)' }}>이용약관</a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
