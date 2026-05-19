'use client';

import Link from 'next/link';
import { ArrowRight, Scale, Users, FileText, MessageSquare, Shield, ClipboardCheck, Search, BookOpen, Calendar } from 'lucide-react';
import { getCategoryColor } from '@/lib/category-colors';
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
  const color = getCategoryColor(category);
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: color.bg, color: color.text }}
    >
      {category === 'general' ? '일반' : category}
    </span>
  );
}

export default function HomeClient({ totalCases, totalAdmin, totalNews, latestBlogArticles, faqItems, topicPicksSlot }: HomeClientProps) {
  const features = [
    {
      icon: Users,
      title: '사용자 범위 확대',
      description: '근로계약 당사자가 아니더라도 근로조건을 실질적·구체적으로 지배·결정하는 자는 사용자로 인정',
      href: '/guide#employer-scope',
      color: 'var(--blue-500)',
      bg: 'var(--blue-50)',
    },
    {
      icon: Scale,
      title: '노동쟁의 범위 확대',
      description: '계약외사용자와의 분쟁도 노동쟁의에 포함. 원청에 대한 쟁의행위 정당성 근거 마련',
      href: '/guide#labor-dispute',
      color: '#8b5cf6',
      bg: '#f5f3ff',
    },
    {
      icon: ClipboardCheck,
      title: '교섭 의무 자가진단',
      description: '하청이 교섭을 요구했을 때, 우리가 응해야 하는지 체크리스트로 자가진단',
      href: '/checklist',
      color: '#dc2626',
      bg: '#fef2f2',
    },
    {
      icon: FileText,
      title: '교섭절차 가이드',
      description: '교섭요구부터 단체교섭까지 6단계 절차를 스텝 다이어그램으로 한눈에 파악',
      href: '/manual',
      color: '#059669',
      bg: '#ecfdf5',
    },
    {
      icon: Search,
      title: '판례·행정해석 검색',
      description: `판례 ${totalCases.toLocaleString()}건, 공개 행정해석 ${totalAdmin.toLocaleString()}건, 최신 뉴스 ${totalNews.toLocaleString()}건을 통합 검색`,
      href: '/database',
      color: '#7c3aed',
      bg: '#f5f3ff',
    },
  ];

  const moreFeatures = [
    {
      icon: MessageSquare,
      title: 'AI 노동법 상담',
      description: '24시간 즉시 답변. 노란봉투법·해고·임금체불·직장내괴롭힘 등 노동법 전반에 대한 AI 챗봇 상담.',
      href: '/ai',
      color: '#0ea5e9',
      bg: '#f0f9ff',
    },
    {
      icon: BookOpen,
      title: '노동·HR 딥다이브 블로그',
      description: '판례분석·뉴스해설·실무가이드. 10년차 노무사가 매일 업데이트하는 현장 콘텐츠.',
      href: '/blog',
      color: '#0284c7',
      bg: '#e0f2fe',
    },
    {
      icon: Calendar,
      title: '계산기 도구',
      description: '퇴직금·연차수당·통상임금 등 즉시 계산. 본문에 적용 근거 법령 함께 표시.',
      href: '/tools/severance.html',
      color: '#16a34a',
      bg: '#f0fdf4',
    },
    {
      icon: Shield,
      title: '고용·창업 지원금',
      description: '청년·중소기업·신중년 등 정부 고용지원금 가이드. 신청 자격·서류·기한 한번에 정리.',
      href: '/subsidy',
      color: '#ca8a04',
      bg: '#fefce8',
    },
  ];

  return (
    <div>
      <section className="relative overflow-hidden px-5 py-14 text-center sm:py-20 md:py-32">
        <div className="mx-auto max-w-3xl">
          <div
            className="mb-4 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm"
            style={{ borderColor: 'var(--blue-200)', backgroundColor: 'var(--blue-50)', color: 'var(--blue-600)' }}
          >
            <Shield size={14} />
            2026.3.10. 시행
          </div>
          <h1 className="mb-6 font-bold tracking-tight" style={{ fontSize: 'var(--text-hero)', lineHeight: 1.1, color: 'var(--grey-900)' }}>
            노란봉투법,
            <br />
            <span style={{ color: 'var(--color-accent)' }}>무엇이 달라졌나?</span>
          </h1>
          <p className="mx-auto mb-8 max-w-xl sm:mb-10" style={{ fontSize: 'var(--text-lg)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            개정 노동조합법의 핵심 변화를 해석지침과 교섭절차 매뉴얼 기반으로 정리했습니다. AI 상담으로 궁금한 점을 바로 해결하세요.
          </p>
          <p className="mx-auto mb-8 inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-[13px] sm:mb-10" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)' }}>
            <Shield size={13} style={{ color: 'var(--color-accent)' }} />
            공인노무사 서재홍이 직접 운영하고 검수합니다 · 노무법인 위너스
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
            <Link
              href="/guide"
              className="flex w-full items-center justify-center gap-2 rounded-lg px-6 py-3 font-medium text-white transition-transform hover:scale-105 sm:w-auto"
              style={{ backgroundColor: 'var(--color-accent)' }}
            >
              해석지침 보기 <ArrowRight size={16} />
            </Link>
            <Link
              href="/contact"
              className="flex w-full items-center justify-center gap-2 rounded-lg border px-6 py-3 font-medium transition-transform hover:scale-105 sm:w-auto"
              style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)', backgroundColor: 'var(--color-bg-surface)' }}
            >
              전문가 상담 문의 <ArrowRight size={16} />
            </Link>
            <Link
              href="/ai"
              className="flex w-full items-center justify-center gap-2 rounded-lg border px-6 py-3 font-medium transition-transform hover:scale-105 sm:w-auto"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            >
              <MessageSquare size={16} />
              AI에게 질문하기
            </Link>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            <span className="font-medium" style={{ color: 'var(--grey-700)' }}>바로 가기</span>
            <Link href="/checklist" className="rounded-full border px-3 py-1.5 hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]" style={{ borderColor: 'var(--color-border)' }}>
              원청 사용자성 자가진단
            </Link>
            <Link href="/manual" className="rounded-full border px-3 py-1.5 hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]" style={{ borderColor: 'var(--color-border)' }}>
              교섭요구 대응 절차 보기
            </Link>
            <Link href="/contact" className="rounded-full border px-3 py-1.5 hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]" style={{ borderColor: 'var(--color-border)' }}>
              교섭요구서 받았다면 상담 문의
            </Link>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {[
              `판례 ${totalCases.toLocaleString()}건`,
              `공개 행정해석 ${totalAdmin.toLocaleString()}건`,
              `최신 뉴스 ${totalNews.toLocaleString()}건`,
            ].map((item) => (
              <span
                key={item}
                className="rounded-full border px-3 py-1.5 text-sm"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)' }}
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-16 sm:pb-20">
        <div className="mx-auto grid max-w-[1100px] gap-4 sm:gap-6 sm:grid-cols-2 md:grid-cols-3">
          {features.map((feature) => (
            <Link key={feature.title} href={feature.href} className="feature-card block rounded-2xl border bg-[var(--color-bg-surface)] p-5 sm:p-7" style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl" style={{ backgroundColor: feature.bg }}>
                <feature.icon size={22} style={{ color: feature.color }} />
              </div>
              <h3 className="mb-2 text-lg font-bold" style={{ color: 'var(--grey-900)' }}>{feature.title}</h3>
              <p className="text-[15px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{feature.description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium" style={{ color: 'var(--color-accent)' }}>
                자세히 보기 <ArrowRight size={14} />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* 부가 도구 — 노란봉투법 외 */}
      <section className="px-5 pb-16 sm:pb-20">
        <div className="mx-auto max-w-[1100px]">
          <div className="mb-6 text-center">
            <p className="text-[13px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--color-accent)' }}>MORE TOOLS</p>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight" style={{ color: 'var(--grey-900)' }}>
              노동법·HR 실무 종합 도구
            </h2>
            <p className="mt-2 text-[14px]" style={{ color: 'var(--color-text-secondary)' }}>
              노란봉투법 외에도 일상 노무 실무 전반을 다룹니다.
            </p>
          </div>
          <div className="grid gap-4 sm:gap-5 sm:grid-cols-2 md:grid-cols-4">
            {moreFeatures.map((feature) => (
              <Link key={feature.title} href={feature.href} className="feature-card block rounded-2xl border bg-[var(--color-bg-surface)] p-5" style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: feature.bg }}>
                  <feature.icon size={18} style={{ color: feature.color }} />
                </div>
                <h3 className="mb-1.5 text-[15px] font-bold" style={{ color: 'var(--grey-900)' }}>{feature.title}</h3>
                <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{feature.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 이 주의 토픽 (편집 큐레이션) — 최신 딥다이브 위에 배치 */}
      {topicPicksSlot}

      {/* 최신 딥다이브 */}
      {latestBlogArticles.length > 0 && (
        <section className="px-5 pb-16 sm:pb-20">
          <div className="mx-auto max-w-[1100px]">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <BookOpen size={22} style={{ color: 'var(--color-accent)' }} />
                <h2 className="text-xl font-bold" style={{ color: 'var(--grey-900)' }}>최신 딥다이브</h2>
              </div>
              <Link
                href="/blog"
                className="flex items-center gap-1 text-[13px] font-medium"
                style={{ color: 'var(--color-accent)' }}
              >
                전체 보기 <ArrowRight size={13} />
              </Link>
            </div>
            <div className="grid gap-4 sm:gap-5 sm:grid-cols-2 md:grid-cols-3">
              {latestBlogArticles.map((article) => (
                <Link
                  key={article.slug}
                  href={`/blog/${article.slug}`}
                  className="feature-card block rounded-2xl border bg-[var(--color-bg-surface)] p-5 sm:p-6"
                  style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <BlogCategoryBadge category={article.category} />
                    <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                      <Calendar size={10} />
                      {formatDate(article.published_at)}
                    </span>
                  </div>
                  <h3 className="text-[15px] font-bold leading-snug mb-1" style={{ color: 'var(--grey-900)' }}>
                    {article.title}
                  </h3>
                  {article.subtitle && (
                    <p className="text-[12px] font-medium mb-2" style={{ color: 'var(--color-accent)' }}>
                      {article.subtitle}
                    </p>
                  )}
                  {article.summary && (
                    <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                      {article.summary.length > 100 ? `${article.summary.slice(0, 100)}...` : article.summary}
                    </p>
                  )}
                  <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium" style={{ color: 'var(--color-accent)' }}>
                    읽기 <ArrowRight size={12} />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="px-5 pb-16 sm:pb-20">
        <div className="mx-auto max-w-[1100px] rounded-3xl border p-5 sm:p-8 md:p-10" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)', boxShadow: 'var(--shadow-sm)' }}>
          <div className="max-w-[760px]">
            <p className="text-sm font-medium" style={{ color: 'var(--color-accent)' }}>자주 묻는 질문</p>
            <h2 className="mt-2 text-xl sm:text-2xl font-bold tracking-tight" style={{ color: 'var(--grey-900)' }}>
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
                className="rounded-2xl border p-4 sm:p-5"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}
              >
                <h3 className="text-[15px] font-bold leading-6" style={{ color: 'var(--grey-900)' }}>{item.question}</h3>
                <p className="mt-2 text-sm leading-6" style={{ color: 'var(--color-text-secondary)' }}>{item.answer}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 sm:mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href="/checklist"
              className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 font-medium text-white"
              style={{ backgroundColor: 'var(--color-accent)' }}
            >
              교섭 의무 체크리스트 보기 <ArrowRight size={16} />
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-2 rounded-lg border px-5 py-3 font-medium"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            >
              노란봉투법 상담 문의 <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <section className="px-5 pb-16 sm:pb-20">
        <div className="mx-auto max-w-[700px] rounded-2xl border p-6 sm:p-8 text-center" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)', boxShadow: 'var(--shadow-md)' }}>
          <MessageSquare size={32} className="mx-auto mb-4" style={{ color: 'var(--color-accent)' }} />
          <h2 className="mb-2 text-xl font-bold" style={{ color: 'var(--grey-900)' }}>AI에게 노동법 질문하기</h2>
          <p className="mb-6 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            개정 노동조합법에 대한 궁금증을 AI가 즉시 답변해 드립니다
          </p>
          <Link
            href="/ai"
            className="inline-flex items-center gap-2 rounded-lg px-6 py-3 font-medium text-white"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            AI 상담 시작하기 <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <section className="px-5 pb-16 sm:pb-20">
        <div className="mx-auto max-w-[700px] rounded-2xl p-6 sm:p-8 text-center" style={{ backgroundColor: '#191f28' }}>
          <h2 className="mb-3 text-lg sm:text-xl font-bold" style={{ color: '#f2f4f6' }}>노란봉투법 실무 자문이 필요하면 바로 상담하세요</h2>
          <p className="mb-3 text-sm" style={{ color: 'rgba(242, 244, 246, 0.7)' }}>
            원청 사용자성 판단, 하청 노조 교섭요구 대응, 노동위원회 절차, 부당노동행위 리스크 점검까지 노무법인 위너스가 직접 봅니다.
          </p>
          <p className="mb-6 text-xs" style={{ color: 'rgba(242, 244, 246, 0.55)' }}>
            상황을 남겨주시면 내용을 검토한 뒤 순차적으로 회신합니다.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 rounded-lg px-6 py-3 font-medium"
            style={{ backgroundColor: '#f2f4f6', color: '#191f28' }}
          >
            노란봉투법 전문가 상담 문의 <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* 뉴스레터 구독 폼 — 홈 하단 인지 노출 */}
      <section className="px-5 pb-16 sm:pb-20">
        <div className="mx-auto max-w-[700px]">
          <SubscribeForm source="home-bottom" />
        </div>
      </section>
    </div>
  );
}
