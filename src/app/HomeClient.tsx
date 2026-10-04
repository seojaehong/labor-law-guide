'use client';

import Link from 'next/link';
import { ArrowRight, MessageSquare, Search } from 'lucide-react';
import '@/components/editorial-home.css';
import SubscribeForm from '@/components/SubscribeForm';

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

export default function HomeClient({ totalCases, totalAdmin, totalNews, latestBlogArticles, faqItems, topicPicksSlot }: HomeClientProps) {
  const features = [
    {
      title: '사용자 범위 확대',
      description: '근로계약 당사자가 아니더라도 근로조건을 실질적·구체적으로 지배·결정하는 자는 사용자로 인정',
      href: '/guide#employer-scope',
    },
    {
      title: '노동쟁의 범위 확대',
      description: '계약외사용자와의 분쟁도 노동쟁의에 포함. 원청에 대한 쟁의행위 정당성 근거 마련',
      href: '/guide#labor-dispute',
    },
    {
      title: '교섭 의무 자가진단',
      description: '하청이 교섭을 요구했을 때, 우리가 응해야 하는지 체크리스트로 자가진단',
      href: '/checklist',
    },
    {
      title: '교섭절차 가이드',
      description: '교섭요구부터 단체교섭까지 6단계 절차를 스텝 다이어그램으로 한눈에 파악',
      href: '/manual',
    },
    {
      title: '판례·행정해석 검색',
      description: `판례 ${totalCases.toLocaleString()}건, 공개 행정해석 ${totalAdmin.toLocaleString()}건, 최신 뉴스 ${totalNews.toLocaleString()}건을 통합 검색`,
      href: '/decisions',
    },
  ];

  const moreFeatures = [
    {
      title: 'AI 노동법 상담',
      description: '24시간 즉시 답변. 노란봉투법·해고·임금체불·직장내괴롭힘 등 노동법 전반에 대한 AI 챗봇 상담.',
      href: '/ai',
    },
    {
      title: '노동·HR 딥다이브 블로그',
      description: '판례분석·뉴스해설·실무가이드. 10년차 노무사가 매일 업데이트하는 현장 콘텐츠.',
      href: '/blog',
    },
    {
      title: '계산기 도구',
      description: '퇴직금·연차수당·통상임금 등 즉시 계산. 본문에 적용 근거 법령 함께 표시.',
      href: '/tools/severance.html',
    },
    {
      title: '고용·창업 지원금',
      description: '청년·중소기업·신중년 등 정부 고용지원금 가이드. 신청 자격·서류·기한 한번에 정리.',
      href: '/subsidy',
    },
  ];

  const [featured, ...supporting] = latestBlogArticles;

  return (
    <div className="editorial-home">
      <section className="editorial-shell editorial-search-band" aria-labelledby="home-search-heading">
        <div>
          <h1 id="home-search-heading">노동법, 근거를 따라 읽다</h1>
          <p>판례 {totalCases.toLocaleString()}건 · 공개 행정해석 {totalAdmin.toLocaleString()}건 · 뉴스 {totalNews.toLocaleString()}건</p>
        </div>
        <form action="/decisions" method="get" role="search" className="editorial-search-form">
          <label htmlFor="home-search" className="sr-only">판례·행정해석·뉴스 통합 검색</label>
          <input id="home-search" name="q" type="search" placeholder="궁금한 노동법 쟁점을 검색하세요" />
          <button type="submit">검색 <Search size={16} aria-hidden="true" /></button>
        </form>
        <nav className="editorial-issue-links" aria-label="주요 쟁점">
          <span>바로 읽기</span>
          <Link href="/guide#employer-scope">사용자 범위 확대</Link>
          <Link href="/manual">교섭요구 대응 절차</Link>
          <Link href="/checklist">교섭 의무 자가진단</Link>
        </nav>
      </section>

      {featured && (
        <section className="editorial-shell editorial-featured" aria-labelledby="latest-heading">
          <div className="editorial-section-heading">
            <h2 id="latest-heading">최신 딥다이브</h2>
            <span>노동법과 현장의 쟁점</span>
            <Link href="/blog">전체 보기 <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
          <div className="editorial-front-grid">
            <article className="editorial-lead-story">
              <div className="editorial-meta"><BlogCategoryBadge category={featured.category} /><time dateTime={featured.published_at}>{formatDate(featured.published_at)}</time></div>
              <h3><Link href={`/blog/${featured.slug}`}>{featured.title}</Link></h3>
              {featured.subtitle && <p className="editorial-lead-subtitle">{featured.subtitle}</p>}
              {featured.summary && <p className="editorial-lead-deck">{featured.summary}</p>}
              <div className="editorial-lead-foot"><span>노동 딥다이브</span><Link href={`/blog/${featured.slug}`}>글 읽기 <ArrowRight size={16} aria-hidden="true" /></Link></div>
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

      <section className="editorial-shell editorial-guide-section" aria-labelledby="home-guide-heading">
        <div className="editorial-section-heading"><h2 id="home-guide-heading">노란봉투법 핵심 가이드</h2><span>2026.3.10. 시행</span><Link href="/guide">해석지침 보기 <ArrowRight size={14} aria-hidden="true" /></Link></div>
        <p className="editorial-section-intro">개정 노동조합법의 핵심 변화를 해석지침과 교섭절차 매뉴얼 기반으로 정리했습니다. 노무법인 위너스 공인노무사가 직접 운영하고 검수합니다.</p>
        <div className="editorial-guide-links">
          {features.map(feature => (
            <Link key={feature.title} href={feature.href}>
              <h3>{feature.title} <ArrowRight size={16} aria-hidden="true" /></h3>
              <p>{feature.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="editorial-shell editorial-tools-section" aria-labelledby="home-tools-heading">
        <div className="editorial-section-heading"><h2 id="home-tools-heading">노동법·HR 실무 도구</h2><Link href="/tools">계산·점검 보기 <ArrowRight size={14} aria-hidden="true" /></Link></div>
        <div className="editorial-tool-links">
          {moreFeatures.map(feature => (
            <Link key={feature.title} href={feature.href}>
              <h3>{feature.title} <ArrowRight size={15} aria-hidden="true" /></h3>
              <p>{feature.description}</p>
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
              검색으로 많이 들어오는 질문을 먼저 정리했습니다. 바로 판단이 어려우면 체크리스트로 1차 진단 후 상담 문의로 이어가면 됩니다.
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
              href="/checklist"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md px-5 py-2.5 text-[15px] font-semibold transition-[background-color,transform] hover:-translate-y-px bg-[var(--color-accent-ink)] text-[var(--color-on-accent-ink)] hover:bg-[var(--color-accent-ink-hover)]"
            >
              교섭 의무 체크리스트 보기 <ArrowRight size={16} />
            </Link>
            <Link
              href="/contact"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md px-5 py-2.5 text-[15px] font-semibold transition-[background-color,transform] hover:-translate-y-px border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] hover:bg-[var(--grey-100)]"
            >
              노란봉투법 상담 문의 <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <section className="px-5 pb-16 sm:pb-20">
        <div className="mx-auto max-w-[var(--layout-compact-max)] rounded-xl border p-6 sm:p-8 text-center" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)', boxShadow: 'var(--shadow-md)' }}>
          <MessageSquare size={32} className="mx-auto mb-4" style={{ color: 'var(--color-accent)' }} />
          <h2 className="t-h3 mb-2" style={{ color: 'var(--color-text-primary)' }}>AI에게 노동법 질문하기</h2>
          <p className="mb-6 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            개정 노동조합법에 대한 궁금증을 AI가 즉시 답변해 드립니다
          </p>
          <Link
            href="/ai"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md px-5 py-2.5 text-[15px] font-semibold transition-[background-color,transform] hover:-translate-y-px bg-[var(--color-accent-ink)] text-[var(--color-on-accent-ink)] hover:bg-[var(--color-accent-ink-hover)]"
          >
            AI 상담 시작하기 <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <section className="px-5 pb-16 sm:pb-20">
        <div className="mx-auto max-w-[var(--layout-compact-max)] rounded-xl p-6 sm:p-8 text-center" style={{ backgroundColor: 'var(--grey-900)' }}>
          <h2 className="t-h4 mb-3" style={{ color: 'var(--grey-100)' }}>노란봉투법 실무 자문이 필요하면 바로 상담하세요</h2>
          <p className="mb-3 text-sm" style={{ color: 'var(--band-ink-muted)' }}>
            원청 사용자성 판단, 하청 노조 교섭요구 대응, 노동위원회 절차, 부당노동행위 리스크 점검까지 노무법인 위너스가 직접 봅니다.
          </p>
          <p className="mb-6 text-xs" style={{ color: 'var(--band-ink-fine)' }}>
            상황을 남겨주시면 내용을 검토한 뒤 순차적으로 회신합니다.
          </p>
          <Link
            href="/contact"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md px-5 py-2.5 text-[15px] font-semibold transition-transform hover:-translate-y-px"
            style={{ backgroundColor: 'var(--grey-100)', color: 'var(--grey-900)' }}
          >
            노란봉투법 전문가 상담 문의 <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* 뉴스레터 구독 폼 — 홈 하단 인지 노출 */}
      <section className="px-5 pb-16 sm:pb-20">
        <div className="mx-auto max-w-[var(--layout-compact-max)]">
          <SubscribeForm source="home-bottom" />
        </div>
      </section>
    </div>
  );
}
