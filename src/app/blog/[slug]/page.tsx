import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase-server';
import { SITE_URL } from '@/lib/constants';
import { ArrowLeft, Calendar, User, Tag, BookOpen, ArrowRight } from 'lucide-react';

export const revalidate = 1800;

interface BlogArticleFull {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  content: string;
  summary: string | null;
  category: string;
  tags: string[];
  author: string;
  cover_image: string | null;
  published_at: string;
  updated_at: string;
  view_count: number;
  seo_title: string | null;
  seo_description: string | null;
}

interface RelatedArticle {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  category: string;
  published_at: string;
}

async function getArticle(slug: string): Promise<BlogArticleFull | null> {
  const { data, error } = await supabaseServer
    .from('blog_articles')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .single();

  if (error || !data) return null;
  return data as BlogArticleFull;
}

async function getRelatedArticles(currentId: string, category: string): Promise<RelatedArticle[]> {
  const { data } = await supabaseServer
    .from('blog_articles')
    .select('id, slug, title, subtitle, category, published_at')
    .eq('is_published', true)
    .eq('category', category)
    .neq('id', currentId)
    .order('published_at', { ascending: false })
    .limit(3);

  return (data || []) as RelatedArticle[];
}

async function getLatestArticles(currentId: string): Promise<RelatedArticle[]> {
  const { data } = await supabaseServer
    .from('blog_articles')
    .select('id, slug, title, subtitle, category, published_at')
    .eq('is_published', true)
    .neq('id', currentId)
    .order('published_at', { ascending: false })
    .limit(4);

  return (data || []) as RelatedArticle[];
}

export async function generateStaticParams() {
  const { data } = await supabaseServer
    .from('blog_articles')
    .select('slug')
    .eq('is_published', true);

  return (data || []).map((row: { slug: string }) => ({ slug: row.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticle(slug);

  if (!article) {
    return { title: '찾을 수 없는 페이지' };
  }

  const title = article.seo_title || article.title;
  const description = article.seo_description || article.summary || `${article.title} - 노무법인 위너스`;

  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/blog/${slug}` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/blog/${slug}`,
      type: 'article',
      publishedTime: article.published_at,
      modifiedTime: article.updated_at,
      authors: [article.author],
      locale: 'ko_KR',
      ...(article.cover_image ? { images: [{ url: article.cover_image }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

function renderMarkdown(md: string): string {
  return md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^#### (.+)$/gm, '<h4 class="blog-h4">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="blog-h3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="blog-h2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="blog-h1">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="blog-strong">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="blog-code">$1</code>')
    .replace(/^---$/gm, '<hr class="blog-hr" />')
    .replace(/^> (.+)$/gm, '<blockquote class="blog-blockquote">$1</blockquote>')
    .replace(/^- (.+)$/gm, '<li class="blog-li">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="blog-li blog-li-ordered">$2</li>')
    .replace(/\n\n/g, '</p><p class="blog-p">')
    .replace(/^(?!<[hblpic])(.+)$/gm, (match) => {
      if (match.trim() === '') return '';
      return match;
    });
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function CategoryBadge({ category }: { category: string }) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    '노동법': { bg: '#e8f3ff', text: '#1b64da' },
    '판례분석': { bg: '#f5f3ff', text: '#6d28d9' },
    '뉴스해설': { bg: '#fef3c7', text: '#92400e' },
    '실무가이드': { bg: '#ecfdf5', text: '#065f46' },
    'general': { bg: 'var(--grey-100)', text: 'var(--grey-600)' },
  };
  const color = colorMap[category] || colorMap['general'];
  return (
    <span
      className="rounded-full px-3 py-1 text-[12px] font-semibold"
      style={{ backgroundColor: color.bg, color: color.text }}
    >
      {category === 'general' ? '일반' : category}
    </span>
  );
}

export default async function BlogArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await getArticle(slug);

  if (!article) {
    notFound();
  }

  const [related, latest] = await Promise.all([
    getRelatedArticles(article.id, article.category),
    getLatestArticles(article.id),
  ]);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '홈', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: '노동 딥다이브', item: `${SITE_URL}/blog` },
          { '@type': 'ListItem', position: 3, name: article.title, item: `${SITE_URL}/blog/${slug}` },
        ],
      },
      {
        '@type': 'NewsArticle',
        '@id': `${SITE_URL}/blog/${slug}`,
        headline: article.title,
        description: article.summary || article.seo_description || '',
        datePublished: article.published_at,
        dateModified: article.updated_at,
        author: {
          '@type': 'Organization',
          name: article.author,
          url: 'https://winhr.co.kr',
        },
        publisher: { '@id': `${SITE_URL}/#organization` },
        mainEntityOfPage: `${SITE_URL}/blog/${slug}`,
        inLanguage: 'ko',
        keywords: article.tags?.join(', ') || '',
        ...(article.cover_image ? { image: article.cover_image } : {}),
      },
    ],
  };

  const htmlContent = `<p class="blog-p">${renderMarkdown(article.content)}</p>`;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto max-w-[1100px] px-5 py-10">
        <div className="lg:grid lg:grid-cols-[1fr_280px] lg:gap-10">
          {/* Main Article */}
          <article>
            {/* Back link */}
            <Link
              href="/blog"
              className="mb-6 inline-flex items-center gap-1.5 text-[13px] transition-colors hover:opacity-70"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              <ArrowLeft size={14} />
              딥다이브 목록
            </Link>

            {/* Article Header */}
            <header className="mb-8">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <CategoryBadge category={article.category} />
                <span
                  className="flex items-center gap-1 text-[12px]"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  <Calendar size={12} />
                  {formatDate(article.published_at)}
                </span>
                <span
                  className="flex items-center gap-1 text-[12px]"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  <User size={12} />
                  {article.author}
                </span>
              </div>

              <h1
                className="text-2xl font-bold leading-tight mb-3 md:text-3xl"
                style={{ color: 'var(--color-text-primary)' }}
              >
                {article.title}
              </h1>

              {article.subtitle && (
                <p
                  className="text-[17px] font-medium leading-snug mb-4"
                  style={{ color: 'var(--color-accent)' }}
                >
                  {article.subtitle}
                </p>
              )}

              {article.summary && (
                <p
                  className="text-[15px] leading-relaxed rounded-xl p-4"
                  style={{
                    color: 'var(--color-text-secondary)',
                    backgroundColor: 'var(--blue-50)',
                    borderLeft: '3px solid var(--color-accent)',
                  }}
                >
                  {article.summary}
                </p>
              )}

              {article.tags && article.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                  <Tag size={12} style={{ color: 'var(--color-text-tertiary)' }} />
                  {article.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full px-2.5 py-0.5 text-[11px]"
                      style={{ backgroundColor: 'var(--grey-100)', color: 'var(--grey-600)' }}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </header>

            {/* Article Content */}
            <div
              className="blog-content"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />

            {/* More Articles */}
            {latest.length > 0 && (
              <section className="mt-12 pt-8" style={{ borderTop: '1px solid var(--color-border)' }}>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="flex items-center gap-2 text-[17px] font-bold" style={{ color: 'var(--color-text-primary)' }}>
                    <BookOpen size={18} style={{ color: 'var(--color-accent)' }} />
                    딥다이브 더 보기
                  </h2>
                  <Link
                    href="/blog"
                    className="flex items-center gap-1 text-[13px] font-medium"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    전체 보기 <ArrowRight size={13} />
                  </Link>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {latest.map((a) => (
                    <Link
                      key={a.id}
                      href={`/blog/${a.slug}`}
                      className="rounded-xl border p-4 transition-shadow hover:shadow-md"
                      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}
                    >
                      <CategoryBadge category={a.category} />
                      <p
                        className="mt-2 text-[14px] font-semibold leading-snug"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        {a.title}
                      </p>
                      {a.subtitle && (
                        <p className="mt-0.5 text-[12px]" style={{ color: 'var(--color-text-tertiary)' }}>
                          {a.subtitle}
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </article>

          {/* Sidebar */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-6">
              {/* Related in same category */}
              {related.length > 0 && (
                <div
                  className="rounded-2xl border p-5"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)', boxShadow: 'var(--shadow-sm)' }}
                >
                  <h3
                    className="text-[14px] font-bold mb-4"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    같은 카테고리
                  </h3>
                  <div className="space-y-3">
                    {related.map((a) => (
                      <Link
                        key={a.id}
                        href={`/blog/${a.slug}`}
                        className="block group"
                      >
                        <p
                          className="text-[13px] font-medium leading-snug group-hover:underline"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
                          {a.title}
                        </p>
                        <p
                          className="mt-0.5 text-[11px]"
                          style={{ color: 'var(--color-text-tertiary)' }}
                        >
                          {formatDate(a.published_at)}
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* CTA */}
              <div
                className="rounded-2xl p-5"
                style={{ backgroundColor: 'var(--grey-900)' }}
              >
                <p className="text-[14px] font-bold text-white mb-2">전문가 상담</p>
                <p className="text-[12px] text-white/70 mb-4 leading-relaxed">
                  노동법 관련 구체적인 사안은 노무법인 위너스와 직접 상담하세요.
                </p>
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-medium"
                  style={{ backgroundColor: 'white', color: 'var(--grey-900)' }}
                >
                  상담 문의 <ArrowRight size={12} />
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <style>{`
        .blog-content { color: var(--color-text-primary); font-size: 15px; line-height: 1.75; word-break: keep-all; }
        .blog-content .blog-p { margin-bottom: 1.25em; }
        .blog-content .blog-h1 { font-size: 1.6em; font-weight: 700; margin: 1.5em 0 0.6em; color: var(--grey-900); }
        .blog-content .blog-h2 { font-size: 1.35em; font-weight: 700; margin: 1.4em 0 0.5em; color: var(--grey-900); padding-bottom: 0.3em; border-bottom: 1px solid var(--color-border); }
        .blog-content .blog-h3 { font-size: 1.15em; font-weight: 700; margin: 1.2em 0 0.4em; color: var(--grey-800); }
        .blog-content .blog-h4 { font-size: 1em; font-weight: 700; margin: 1em 0 0.3em; color: var(--grey-700); }
        .blog-content .blog-strong { font-weight: 700; color: var(--grey-900); }
        .blog-content .blog-code { font-family: monospace; font-size: 0.88em; padding: 0.15em 0.4em; border-radius: 4px; background: var(--grey-100); color: var(--grey-800); }
        .blog-content .blog-hr { margin: 2em 0; border: none; border-top: 1px solid var(--color-border); }
        .blog-content .blog-blockquote { margin: 1.2em 0; padding: 0.8em 1em; border-left: 3px solid var(--color-accent); background: var(--blue-50); border-radius: 0 8px 8px 0; color: var(--color-text-secondary); }
        .blog-content .blog-li { margin-left: 1.5em; margin-bottom: 0.3em; list-style: disc; }
        .blog-content .blog-li-ordered { list-style: decimal; }
      `}</style>
    </>
  );
}
