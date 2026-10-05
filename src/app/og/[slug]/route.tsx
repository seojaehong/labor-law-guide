import { supabaseServer } from '@/lib/supabase-server';
import { shareCard } from '@/lib/share-card';
import { articleShare } from '@/lib/share-text';
import { BRAND_NAME, BRAND_DESCRIPTION } from '@/lib/constants';
export const runtime = 'nodejs';
export const revalidate = 86400;
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data } = await supabaseServer.from('blog_articles').select('title, subtitle, category, seo_description, summary').eq('slug', slug).maybeSingle();
  return shareCard(data ? { ...articleShare(data), category: data.category === 'general' ? '일반' : data.category || '일의 이야기' } : { title: BRAND_NAME, description: BRAND_DESCRIPTION });
}
