import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, supabaseServer } from '@/lib/supabase-server';
import { checkAdminAuth } from '@/lib/admin-auth';

const db = supabaseAdmin || supabaseServer;

export async function GET(req: NextRequest) {
  const authError = checkAdminAuth(req);
  if (authError) return authError;
  const today = new Date();
  today.setHours(today.getHours() + 9); // KST
  const todayStr = today.toISOString().slice(0, 10);

  const [totalRes, todayRes, categoryRes, recentRes] = await Promise.all([
    db.from('blog_articles').select('slug', { count: 'exact', head: true }),
    db.from('blog_articles').select('slug', { count: 'exact', head: true })
      .gte('published_at', `${todayStr}T00:00:00+09:00`)
      .lte('published_at', `${todayStr}T23:59:59+09:00`),
    db.from('blog_articles').select('category'),
    db.from('blog_articles')
      .select('slug, title, category, author, published_at')
      .order('published_at', { ascending: false })
      .limit(7),
  ]);

  const categoryCounts: Record<string, number> = {};
  if (categoryRes.data) {
    for (const row of categoryRes.data) {
      const cat = (row as { category: string }).category || 'general';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
  }

  // 7-day publishing trend
  const days: { date: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(d.getHours() + 9);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const { count } = await db
      .from('blog_articles')
      .select('slug', { count: 'exact', head: true })
      .gte('published_at', `${dateStr}T00:00:00+09:00`)
      .lte('published_at', `${dateStr}T23:59:59+09:00`);
    days.push({ date: dateStr, count: count || 0 });
  }

  return NextResponse.json({
    total: totalRes.count || 0,
    today: todayRes.count || 0,
    byCategory: categoryCounts,
    trend: days,
    recent: recentRes.data || [],
  });
}
