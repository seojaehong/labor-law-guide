import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/constants';
import { supabaseServer } from '@/lib/supabase-server';

export async function generateMetadata(): Promise<Metadata> {
  const [casesResult, adminResult] = await Promise.all([
    supabaseServer.from('cases').select('id', { count: 'exact', head: true }),
    supabaseServer.from('admin_interpretations').select('id', { count: 'exact', head: true }),
  ]);

  const totalCases = casesResult.count || 0;
  const totalAdmin = adminResult.count || 0;
  const description = `노란봉투법 관련 판례 ${totalCases.toLocaleString()}건과 공개 행정해석 ${totalAdmin.toLocaleString()}건을 무료 검색. 원청 사용자성, 하도급 교섭, 손해배상, 부당노동행위, 파견 쟁점을 실무형으로 탐색합니다.`;

  return {
    title: '노란봉투법 판례·행정해석 검색 | 사용자성·교섭·부당노동행위 판례 DB',
    description,
    alternates: { canonical: `${SITE_URL}/database` },
    openGraph: {
      title: '노란봉투법 판례·행정해석 검색',
      description,
      type: 'website',
      url: `${SITE_URL}/database`,
    },
    twitter: {
      card: 'summary_large_image',
      title: '노란봉투법 판례·행정해석 검색',
      description,
    },
  };
}

export default function DatabaseLayout({ children }: { children: React.ReactNode }) {
  return children;
}
