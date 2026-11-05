import { publicMetadata } from '@/lib/public-metadata';
import type { Metadata } from 'next';
import { SITE_URL, BRAND_NAME } from '@/lib/constants';

const TITLE = `서비스 문의 | 오류 제보·기능 제안·제휴 | ${BRAND_NAME}`;
const DESCRIPTION = `${BRAND_NAME} 서비스 문의 창구입니다. 오류 제보, 기능 제안, 제휴 문의를 남겨 주세요.`;

export const metadata: Metadata = publicMetadata({
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/contact` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/contact`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [`${SITE_URL}/opengraph-image`],
  },
});

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
