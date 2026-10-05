'use client';

import Link from 'next/link';
import { ArrowRight, Search } from 'lucide-react';
import '@/components/editorial-home.css';

interface LatestBlogArticle {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  category: string;
  published_at: string;
}

interface HomeFaqItem {
  question: string;
  answer: string;
}

type HomeClientProps = {
  totalCases: number;
  totalAdmin: number;
  totalNews: number;
  latestBlogArticles: LatestBlogArticle[];
  faqItems: readonly HomeFaqItem[];
  topicPicksSlot?: React.ReactNode;
};

function formatDate(dateStr: string) {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}.${match[2]}.${match[3]}`;
  return dateStr.slice(0, 10).replace(/-/g, '.');
}

function BlogCategoryBadge({ category }: { category: string }) {
  return <span className="editorial-category">{category === 'general' ? '일반' : category}</span>;
}

export default function HomeClient({ totalCases, totalAdmin, latestBlogArticles, faqItems, topicPicksSlot }: HomeClientProps) {
  const sections = [
    { title: '일의 이야기', description: '노동과 일터의 쟁점을 다룬 글을 읽습니다.', href: '/blog' },
    { title: '달라지는 일', description: '법령 개정 자료와 일터의 준비 사항을 살펴봅니다. 법령 검수 전 자료입니다.', href: '/laws' },
    { title: '내 일 점검', description: '적용 조건을 확인하고 참고 계산과 점검 도구를 이용합니다.', href: '/tools' },
    { title: '근거 찾기', description: `판례 ${totalCases.toLocaleString()}건과 공개 행정해석 ${totalAdmin.toLocaleString()}건을 검색합니다.`, href: '/decisions' },
  ];

  const [featured, ...supporting] = latestBlogArticles;

  return (
    <div className="editorial-home">
      <section className="editorial-shell editorial-search-band" aria-labelledby="home-search-heading">
        <div>
          <h1 id="home-search-heading">노동법, 근거를 따라 읽다</h1>
          <p>판례 {totalCases.toLocaleString()}건 · 공개 행정해석 {totalAdmin.toLocaleString()}건</p>
        </div>
        <form action="/decisions" method="get" role="search" className="editorial-search-form">
          <label htmlFor="home-search" className="sr-only">판례·행정해석 검색</label>
          <input id="home-search" name="q" type="search" placeholder="궁금한 노동법 쟁점을 검색하세요" />
          <button type="submit">검색 <Search size={16} aria-hidden="true" /></button>
        </form>
        <nav className="editorial-issue-links" aria-label="주요 콘텐츠">
          <span>바로 읽기</span>
          <Link href="/blog">일의 이야기</Link>
          <Link href="/decisions">근거 찾기</Link>
          <Link href="/laws">달라지는 일</Link>
          <Link href="/tools">내 일 점검</Link>
        </nav>
      </section>

      {featured && (
        <section className="editorial-shell editorial-featured" aria-labelledby="latest-heading">
          <div className="editorial-section-heading">
            <h2 id="latest-heading">최신 글</h2>
            <span>노동법과 현장의 쟁점</span>
            <Link href="/blog">전체 보기 <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
          <div className="editorial-front-grid">
            <article className="editorial-lead-story">
              <div className="editorial-meta"><BlogCategoryBadge category={featured.category} /><time dateTime={featured.published_at}>{formatDate(featured.published_at)}</time></div>
              <h3><Link href={`/blog/${featured.slug}`}>{featured.title}</Link></h3>
              {featured.subtitle && <p className="editorial-lead-subtitle">{featured.subtitle}</p>}
              {featured.summary && <p className="editorial-lead-deck">{featured.summary}</p>}
              <div className="editorial-lead-foot"><span>일의 무늬</span><Link href={`/blog/${featured.slug}`}>글 읽기 <ArrowRight size={16} aria-hidden="true" /></Link></div>
            </article>
            <div className="editorial-support-stories">
              {supporting.map(article => (
                <article key={article.slug}>
                  <div className="editorial-meta"><BlogCategoryBadge category={article.category} /><time dateTime={article.published_at}>{formatDate(article.published_at)}</time></div>
                  <h3><Link href={`/blog/${article.slug}`}>{article.title}</Link></h3>
                  {(article.subtitle || article.summary) && <p>{article.subtitle || article.summary}</p>}
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {topicPicksSlot}

      <section className="editorial-shell editorial-guide-section" aria-labelledby="home-sections-heading">
        <div className="editorial-section-heading"><h2 id="home-sections-heading">일의 무늬 둘러보기</h2></div>
        <div className="editorial-guide-links">
          {sections.map(section => (
            <Link key={section.title} href={section.href}>
              <h3>{section.title} <ArrowRight size={16} aria-hidden="true" /></h3>
              <p>{section.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="px-5 pb-16 sm:pb-20">
        <div className="mx-auto max-w-[var(--layout-list-max)] rounded-xl border p-5 sm:p-8 md:p-10" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)', boxShadow: 'var(--shadow-sm)' }}>
          <div className="max-w-[var(--layout-intro-max)]">
            <p className="text-sm font-medium" style={{ color: 'var(--color-accent)' }}>자주 묻는 질문</p>
            <h2 className="t-h3 mt-2 tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
              노란봉투법, 원청 사용자성, 하청 교섭요구 대응에서 많이 묻는 핵심 질문
            </h2>
            <p className="mt-3 text-sm leading-6" style={{ color: 'var(--color-text-secondary)' }}>
              노란봉투법과 교섭 절차에 관한 질문입니다. 관련 판례와 행정해석도 함께 살펴보세요.
            </p>
          </div>
          <div className="mt-6 sm:mt-8 grid gap-4 md:grid-cols-2">
            {faqItems.map((item) => (
              <div
                key={item.question}
                className="rounded-xl border p-4 sm:p-5"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}
              >
                <h3 className="text-[15px] font-bold leading-6" style={{ color: 'var(--color-text-primary)' }}>{item.question}</h3>
                <p className="mt-2 text-sm leading-6" style={{ color: 'var(--color-text-secondary)' }}>{item.answer}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 sm:mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href="/decisions"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md px-5 py-2.5 text-[15px] font-semibold transition-[background-color,transform] hover:-translate-y-px bg-[var(--color-accent-ink)] text-[var(--color-on-accent-ink)] hover:bg-[var(--color-accent-ink-hover)]"
            >
              판례·행정해석 찾아보기 <ArrowRight size={16} />
            </Link>
            <Link
              href="/contact"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md px-5 py-2.5 text-[15px] font-semibold transition-[background-color,transform] hover:-translate-y-px border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] hover:bg-[var(--grey-100)]"
            >
              상담·협업 문의 <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>


    </div>
  );
}
