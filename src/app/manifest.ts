import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '노란봉투법 완벽 가이드',
    short_name: '노란봉투법',
    description: '2026년 3월 시행 개정 노동조합법(노란봉투법) 해석지침, 교섭절차 매뉴얼, 자가진단 체크리스트, AI 상담.',
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
