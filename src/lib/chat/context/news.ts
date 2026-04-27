import type { SupabaseClient } from '@supabase/supabase-js';

export async function buildNewsContext(db: SupabaseClient, userQuery: string): Promise<string> {
  const q = userQuery.slice(0, 50).replace(/[%_\\,().]/g, '');
  const pattern = `%${q}%`;
  const { data: newsData } = await db
    .from('news')
    .select('title, source, published_at, summary')
    .or(`title.ilike.${pattern},summary.ilike.${pattern}`)
    .order('published_at', { ascending: false })
    .limit(5);

  if (!newsData || newsData.length === 0) return '';
  let ctx = '\n\n═══ 관련 최신 뉴스 (참고용, 출처 명시하여 답변) ═══\n';
  for (const n of newsData) {
    ctx += `\n[${n.published_at?.slice(0, 10)}] ${n.title} (${n.source || '뉴스'})\n${n.summary?.slice(0, 150) || ''}\n`;
  }
  return ctx;
}
