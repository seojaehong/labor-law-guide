import { publicMetadata } from '@/lib/public-metadata';
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
  // 261112 — 개정 노동조합법 전용 DB 로 소개하던 문구를 노동 판례·행정해석 검색으로 바꿨다. 쟁점 목록은 그대로다.
  const description = `노동 판례 ${totalCases.toLocaleString()}건과 공개 행정해석 ${totalAdmin.toLocaleString()}건을 무료로 검색합니다. 사용자성, 단체교섭, 손해배상, 부당노동행위, 파견·도급 쟁점별로 찾아볼 수 있습니다.`;

  return publicMetadata({
    title: '노동 판례·행정해석 검색 | 사용자성·교섭·부당노동행위 판례 DB',
    description,
    alternates: { canonical: `${SITE_URL}/database` },
    openGraph: {
      title: '노동 판례·행정해석 검색',
      description,
      type: 'website',
      url: `${SITE_URL}/database`,
    },
    twitter: {
      card: 'summary_large_image',
      title: '노동 판례·행정해석 검색',
      description,
    },
  });
}

export default function DatabaseLayout({ children }: { children: React.ReactNode }) {
  return children;
}
