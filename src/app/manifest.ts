import type { MetadataRoute } from 'next';
import { BRAND_DESCRIPTION, BRAND_NAME } from '@/lib/constants';

// 261112 — 종전 이름은 「노란봉투법 완벽 가이드」였다. 홈 화면에 추가하면 앱 이름으로 그대로 보인다.
// 이름·설명은 브랜드 상수 한 곳에서 온다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND_NAME,
    short_name: BRAND_NAME,
    description: BRAND_DESCRIPTION,
    theme_color: '#1d4ed8',
    background_color: '#ffffff',
    display: 'standalone',
    start_url: '/',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
