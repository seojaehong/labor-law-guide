import type { Metadata } from 'next';
import { BRAND_DESCRIPTION, BRAND_NAME, SITE_URL } from './constants';
import { pageShare, shareText, shortShareText } from './share-text';
/** Share presentation only; canonical, robots, body and source data are preserved. */
export function publicMetadata(metadata: Metadata): Metadata {
  const og = metadata.openGraph;
  const seoTitle = typeof metadata.title === 'string' ? metadata.title.replace(/노란봉투법 가이드/g, BRAND_NAME) : metadata.title;
  const title = shareText(typeof og?.title === 'string' ? og.title.replace(/노란봉투법 가이드/g, BRAND_NAME) : typeof seoTitle === 'string' ? seoTitle : BRAND_NAME) || BRAND_NAME;
  const description = shortShareText((og?.description || metadata.description || '').replace(/노란봉투법 가이드/g, BRAND_NAME)) || BRAND_DESCRIPTION;
  const shared = pageShare(title, description, '/');
  return { ...metadata, title: seoTitle, description: metadata.description?.replace(/노란봉투법 가이드/g, BRAND_NAME), openGraph: { ...shared, ...og, siteName: BRAND_NAME, title, description, images: shared.images, url: og?.url || (typeof metadata.alternates?.canonical === 'string' || metadata.alternates?.canonical instanceof URL ? metadata.alternates.canonical : undefined) || SITE_URL },
    twitter: { ...metadata.twitter, card: 'summary_large_image', title, description, images: shared.images } };
}
