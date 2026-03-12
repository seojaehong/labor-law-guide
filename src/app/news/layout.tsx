import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { SITE_URL } from '@/lib/constants';

export async function generateMetadata(): Promise<Metadata> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const sb = createClient(supabaseUrl, supabaseAnonKey);

  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today = kstNow.toISOString().slice(0, 10);

  const { count } = await sb
    .from('news')
    .select('*', { count: 'exact', head: true });

  const totalCount = count || 0;

  return {
    title: '노란봉투법 최신 뉴스 | 시행·대응·하도급·공공기관 동향',
    description: `${today} 기준 ${totalCount.toLocaleString()}건의 노란봉투법 시행 관련 최신 뉴스. 원청 교섭 의무, 사용자성 판단, 하도급 대응, 공공기관 동향, 교섭단위 분리 소식.`,
    alternates: { canonical: `${SITE_URL}/news` },
    openGraph: {
      title: '노란봉투법 최신 뉴스',
      description: `${today} 기준 ${totalCount.toLocaleString()}건의 노동법 뉴스 매일 업데이트`,
      type: 'website',
      url: `${SITE_URL}/news`,
    },
    twitter: {
      card: 'summary_large_image',
      title: '노란봉투법 최신 뉴스',
      description: `${today} 기준 ${totalCount.toLocaleString()}건의 노동법 뉴스 매일 업데이트`,
    },
  };
}

export default function NewsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
