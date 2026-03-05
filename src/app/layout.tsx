import type { Metadata } from "next";
import "./globals.css";
import GlassNav from "@/components/GlassNav";

const SITE_URL = 'https://yellow-envelope-law.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: '노란봉투법 완벽 가이드 | 2026 개정 노동조합법 해석지침·교섭절차',
    template: '%s | 노란봉투법 가이드',
  },
  description: '2026년 3월 시행 개정 노동조합법(노란봉투법) 해석지침, 교섭절차 매뉴얼, 자가진단 체크리스트, AI 상담. 사용자 범위 확대·노동쟁의·원하청 교섭 완벽 가이드. 노무법인 위너스.',
  keywords: [
    '노란봉투법', '개정 노동조합법', '사용자 범위 확대', '원하청 교섭', '노동쟁의',
    '교섭창구 단일화', '위장도급', '불법파견', '교섭절차', '하청 교섭',
    '노동조합법 2026', '계약외사용자', '부당노동행위', '노무법인 위너스',
  ],
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: '노란봉투법 완벽 가이드 | 2026 개정 노동조합법',
    description: '사용자 범위 확대·노동쟁의 확대·원하청 교섭절차·자가진단 체크리스트·AI 상담. 노무법인 위너스.',
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
      'naver-site-verification': '688ae188787a9183146fae7236c947ce6b0d828a',
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
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-GKKFCZ235H" />
        <script dangerouslySetInnerHTML={{ __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-GKKFCZ235H');` }} />
        <meta name="theme-color" content="#1d4ed8" />
        <link rel="icon" href="/favicon.ico" />
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
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
                },
                {
                  '@type': 'Organization',
                  '@id': `${SITE_URL}/#organization`,
                  name: '노무법인 위너스',
                  url: 'https://winhr.co.kr',
                  email: 'abc@winhr.co.kr',
                  address: {
                    '@type': 'PostalAddress',
                    streetAddress: '나루터로 61, 402호(태승빌딩)',
                    addressLocality: '서초구',
                    addressRegion: '서울특별시',
                    postalCode: '06653',
                    addressCountry: 'KR',
                  },
                  areaServed: { '@type': 'Country', name: 'KR' },
                },
                {
                  '@type': 'WebPage',
                  '@id': `${SITE_URL}/#webpage`,
                  url: SITE_URL,
                  name: '노란봉투법 완벽 가이드',
                  isPartOf: { '@id': `${SITE_URL}/#website` },
                  about: {
                    '@type': 'Article',
                    name: '개정 노동조합법(노란봉투법)',
                    datePublished: '2026-03-10',
                  },
                  breadcrumb: { '@id': `${SITE_URL}/#breadcrumb` },
                },
                {
                  '@type': 'BreadcrumbList',
                  '@id': `${SITE_URL}/#breadcrumb`,
                  itemListElement: [
                    { '@type': 'ListItem', position: 1, name: '홈', item: SITE_URL },
                    { '@type': 'ListItem', position: 2, name: '해석지침', item: `${SITE_URL}/guide` },
                    { '@type': 'ListItem', position: 3, name: '자가진단', item: `${SITE_URL}/checklist` },
                    { '@type': 'ListItem', position: 4, name: '교섭절차', item: `${SITE_URL}/manual` },
                    { '@type': 'ListItem', position: 5, name: 'AI 상담', item: `${SITE_URL}/ai` },
                    { '@type': 'ListItem', position: 6, name: '문의', item: `${SITE_URL}/contact` },
                  ],
                },
                {
                  '@type': 'FAQPage',
                  '@id': `${SITE_URL}/#faq`,
                  mainEntity: [
                    {
                      '@type': 'Question',
                      name: '노란봉투법이란?',
                      acceptedAnswer: { '@type': 'Answer', text: '2026년 3월 10일 시행 개정 노동조합법의 별칭으로, 사용자 범위를 확대하고 노동쟁의 범위를 넓힌 법률입니다.' },
                    },
                    {
                      '@type': 'Question',
                      name: '원청도 사용자에 해당하나요?',
                      acceptedAnswer: { '@type': 'Answer', text: '근로조건을 실질적·구체적으로 지배·결정하는 경우 개정법상 사용자에 해당할 수 있습니다.' },
                    },
                    {
                      '@type': 'Question',
                      name: '하청이 교섭을 요구하면 반드시 응해야 하나요?',
                      acceptedAnswer: { '@type': 'Answer', text: '사용자성이 인정되는 범위 내에서는 교섭에 응할 의무가 있으며, 정당한 이유 없는 거부는 부당노동행위에 해당합니다.' },
                    },
                  ],
                },
              ],
            }),
          }}
        />
        <GlassNav />
        <main>{children}</main>
        <footer className="border-t py-10" style={{ borderColor: 'var(--color-border)' }}>
          <div className="mx-auto max-w-[1400px] px-5 text-center">
            <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
              © 2026 노란봉투법 가이드. 본 사이트는 법률 자문이 아닌 정보 제공 목적입니다.
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              <a href="https://winhr.co.kr" target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: 'var(--color-accent)' }}>노무법인 위너스</a>
              {' '}| 서울시 서초구 나루터로 61, 402호 |{' '}
              <a href="mailto:abc@winhr.co.kr" style={{ color: 'var(--color-accent)' }}>abc@winhr.co.kr</a>
              {' '}|{' '}
              <a href="/contact" style={{ color: 'var(--color-accent)' }}>문의하기</a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
