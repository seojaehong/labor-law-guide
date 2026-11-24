'use client';

import Link from 'next/link';
import { formatPublicationDate } from '@/lib/publication-date';
import { ArrowRight, Search } from 'lucide-react';
import SubscribeForm from '@/components/SubscribeForm';
import { HOME_PICKS, TOOL_GROUPS, TOOL_INDEX } from '@/content/tools-groups';
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

type HomeClientProps = {
  totalCases: number;
  totalAdmin: number;
  totalNews: number;
  latestBlogArticles: LatestBlogArticle[];
  topicPicksSlot?: React.ReactNode;
};

// 261124 재홍님 결정 「도구 먼저」 — 홈 순서는 ①도구 → ②AI 연결 → ③정보다.
// 첫 화면(390×844)에 아래 네 도구가 보여야 한다. tests/layout/home-first-screen.spec.ts 가 막는다.
// 한 줄 설명은 /tools 목록과 같은 문장(tools-groups.ts TOOL_INDEX)을 쓴다.
const FIRST_TOOLS: { href: string; label: string }[] = [
  { href: '/tools/severance.html', label: '퇴직금' },
  { href: '/tools/weekly-holiday-pay', label: '주휴수당' },
  { href: '/tools/notice-pay', label: '해고예고수당' },
  { href: '/exit', label: '퇴사 점검표' },
];

const ink = { color: 'var(--color-text-primary)' } as const;
const sub = { color: 'var(--grey-700)' } as const;
// 묶음 안 도구 링크는 editorial-home.css 가 768px 이상에서 32px 로 줄인다 — 인라인으로 44px 터치 영역을 지킨다.
const TAP = { minHeight: 44 } as const;

function BlogCategoryBadge({ category }: { category: string }) {
  return <span className="editorial-category">{category === 'general' ? '일반' : category}</span>;
}

export default function HomeClient({ totalCases, totalAdmin, latestBlogArticles, topicPicksSlot }: HomeClientProps) {
  // 정보는 맨 아래 3건(대표 1 + 보조 2)만 싣는다.
  const [featured, ...supporting] = latestBlogArticles.slice(0, 3);

  return (
    <div className="editorial-home">
      {/* ① 도구 — 대표 도구 넷을 첫 화면에, 그 아래 /tools 와 같은 상황별 6묶음 */}
      <section className="editorial-shell pt-6 sm:pt-10" aria-labelledby="home-heading">
        <h1 id="home-heading" className="[word-break:keep-all]" style={ink}>노무 계산·점검 도구</h1>
        <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed" style={sub}>
          자주 세는 금액과 퇴사 기한을 바로 확인합니다. 결과에는 근거 조문을 함께 적습니다.
        </p>
        <ul className="mt-5 grid grid-cols-2 border-t lg:grid-cols-4" style={{ borderColor: 'var(--color-text-primary)' }}>
          {FIRST_TOOLS.map((t, i) => {
            const body = (
              <>
                <span className="flex items-center justify-between gap-2 text-[17px] font-bold" style={ink}>
                  {t.label} <ArrowRight size={16} aria-hidden="true" className="shrink-0" />
                </span>
                <span className="mt-0.5 text-[13px] leading-snug" style={sub}>{TOOL_INDEX[t.href]?.summary}</span>
              </>
            );
            const cls = 'flex min-h-[72px] flex-col justify-center py-3';
            return (
              <li
                key={t.href}
                className={`border-b ${i % 2 === 0 ? 'pr-4' : 'border-l pl-4 lg:pr-4'} ${i === 2 ? 'lg:border-l lg:pl-4' : ''}`}
                style={{ borderColor: 'var(--color-border)' }}
              >
                {/* 퇴직금 계산기는 public 정적 HTML 이라 Next 링크로 걸지 않는다 */}
                {t.href.endsWith('.html') ? <a href={t.href} className={cls}>{body}</a> : <Link href={t.href} className={cls}>{body}</Link>}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="editorial-shell editorial-situations" aria-labelledby="home-tools-heading">
        <div className="editorial-section-heading">
          <h2 id="home-tools-heading">상황별 도구</h2>
          <Link href="/tools" className="min-h-[44px]">도구 전체 보기 <ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
        <ul className="editorial-situation-grid">
          {TOOL_GROUPS.map(g => (
            <li key={g.id}>
              <Link className="editorial-situation-name py-2.5" href={`/tools#${g.id}`}>{g.label}</Link>
              <ul>
                {HOME_PICKS[g.id].map(p => <li key={p.href}>{p.href.endsWith('.html') ? <a href={p.href} style={TAP}>{p.label}</a> : <Link href={p.href} style={TAP}>{p.label}</Link>}</li>)}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      {/* 검색은 도구 아래 한 줄. 판례·행정해석 목록으로 보낸다 */}
      <section className="editorial-shell pb-4 pt-8" aria-label="판례·행정해석 검색">
        <form action="/decisions" method="get" role="search" className="editorial-search-form">
          <label htmlFor="home-search" className="sr-only">판례·행정해석 검색</label>
          <input id="home-search" name="q" type="search" placeholder="판례·행정해석에서 쟁점 찾기" />
          <button type="submit">검색 <Search size={16} aria-hidden="true" /></button>
        </form>
        <p className="mt-2 text-[13px]" style={sub}>판례 {totalCases.toLocaleString()}건 · 공개 행정해석 {totalAdmin.toLocaleString()}건</p>
      </section>

      {/* ② AI 연결 — 종전 상단 띠 배너(「내 Claude에서 바로 쓰기」)를 여기로 흡수했다(261124) */}
      <section className="editorial-shell editorial-situations" aria-labelledby="home-ai-heading">
        <div className="editorial-section-heading">
          <h2 id="home-ai-heading">AI 연결</h2>
        </div>
        <p className="max-w-[62ch] text-[15px] leading-relaxed" style={sub}>
          쓰시는 Claude 에 주소 하나를 붙이면 위 계산·점검과 서식 작업을 대화로 합니다. 설치 없이 주소 복사와 세 단계면 됩니다.
        </p>
        <ul className="mt-3 flex flex-wrap gap-x-6 text-[15px]">
          <li><Link href="/ai-tools#calc" className="inline-flex min-h-[44px] items-center underline underline-offset-4">임금·수당 계산</Link></li>
          <li><Link href="/ai-tools#sanjae-apply" className="inline-flex min-h-[44px] items-center underline underline-offset-4">산재 신청 도우미</Link></li>
          <li><Link href="/ai-tools#safeclaw" className="inline-flex min-h-[44px] items-center underline underline-offset-4">SafeClaw 안전관리</Link></li>
        </ul>
        <Link
          href="/ai-tools"
          className="mt-4 mb-6 inline-flex min-h-[44px] items-center gap-2 rounded px-5 text-[15px] font-semibold"
          style={{ background: 'var(--color-text-primary)', color: 'var(--color-bg-surface)' }}
        >
          내 Claude에 연결하기 <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>

      {/* ③ 정보 */}
      {featured && (
        <section className="editorial-shell editorial-featured" aria-labelledby="latest-heading">
          <div className="editorial-section-heading">
            <h2 id="latest-heading">최신 글</h2>
            <span>노동법과 현장의 쟁점</span>
            <Link href="/blog" className="min-h-[44px]">전체 보기 <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
          <div className="editorial-front-grid">
            <article className="editorial-lead-story">
              <div className="editorial-meta"><BlogCategoryBadge category={featured.category} /><time dateTime={featured.published_at}>{formatPublicationDate(featured.published_at)}</time></div>
              <h3><Link href={`/blog/${featured.slug}`}>{featured.title}</Link></h3>
              {featured.subtitle && <p className="editorial-lead-subtitle">{featured.subtitle}</p>}
              {featured.summary && <p className="editorial-lead-deck">{featured.summary}</p>}
              <div className="editorial-lead-foot"><span>일의 무늬</span><Link href={`/blog/${featured.slug}`} className="min-h-[44px]">글 읽기 <ArrowRight size={16} aria-hidden="true" /></Link></div>
            </article>
            <div className="editorial-support-stories">
              {supporting.map(article => (
                <article key={article.slug}>
                  <div className="editorial-meta"><BlogCategoryBadge category={article.category} /><time dateTime={article.published_at}>{formatPublicationDate(article.published_at)}</time></div>
                  <h3><Link href={`/blog/${article.slug}`}>{article.title}</Link></h3>
                  {(article.subtitle || article.summary) && <p>{article.subtitle || article.summary}</p>}
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {topicPicksSlot}

      {/* 261124 — 내비와 같은 네 갈래를 되풀이하던 「메뉴 안내」를 뺐다. 글·법령 개정·판례는 상단 탭과 햄버거에 있다.
          261112 — 이 자리에 있던 「자주 묻는 질문」(노란봉투법 문답 7개)도 뺐다. */}

      {/* 🔴 2026-10-16 복구. 홈 구독 상자가 **2026-10-04 개편(67dca86) 때 빠져 있었다.**
          유입 경로를 세어 보니 구독자 16명 중 home-bottom 이 9명(56%) 으로 가장 큰 입구였는데,
          10-04 이후 home-bottom 가입이 0명이다. 2주 가까이 닫혀 있었다.
          source="home-bottom" 이 그 이름 그대로 「홈 맨 아래」를 뜻한다. */}
      <section className="px-5 pb-16 sm:pb-20" aria-label="뉴스레터 구독">
        <div className="mx-auto max-w-[var(--layout-list-max)]">
          <SubscribeForm source="home-bottom" />
        </div>
      </section>

    </div>
  );
}
