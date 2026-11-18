'use client';

import Link from 'next/link';
import { formatPublicationDate } from '@/lib/publication-date';
import { ArrowRight, Search } from 'lucide-react';
import SubscribeForm from '@/components/SubscribeForm';
import { HOME_PICKS, TOOL_GROUPS } from '@/content/tools-groups';
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

function BlogCategoryBadge({ category }: { category: string }) {
  return <span className="editorial-category">{category === 'general' ? '일반' : category}</span>;
}

export default function HomeClient({ totalCases, totalAdmin, latestBlogArticles, topicPicksSlot }: HomeClientProps) {
  const sections = [
    { title: '글', description: '노동과 일터의 쟁점을 다룬 글을 읽습니다.', href: '/blog' },
    { title: '법령 개정', description: '시행일, 개정 내용과 관련 조문을 확인합니다. 법령 검수 전 자료입니다.', href: '/laws' },
    { title: '취업규칙 점검', description: '취업규칙 텍스트를 입력해 법령 개정 관련 항목을 확인합니다. 참고용 점검입니다.', href: '/tools/work-rules' },
    { title: '판례·행정해석', description: `판례 ${totalCases.toLocaleString()}건과 공개 행정해석 ${totalAdmin.toLocaleString()}건을 검색합니다.`, href: '/decisions' },
  ];

  const [featured, ...supporting] = latestBlogArticles;

  return (
    <div className="editorial-home">
      <section className="editorial-shell editorial-search-band" aria-labelledby="home-search-heading">
        <div>
          <h1 id="home-search-heading">노동법 자료 검색과 <span className="whitespace-nowrap">계산·점검 도구</span></h1>
          <p>판례 {totalCases.toLocaleString()}건 · 공개 행정해석 {totalAdmin.toLocaleString()}건</p>
        </div>
        <form action="/decisions" method="get" role="search" className="editorial-search-form">
          <label htmlFor="home-search" className="sr-only">판례·행정해석 검색</label>
          <input id="home-search" name="q" type="search" placeholder="궁금한 노동법 쟁점을 검색하세요" />
          <button type="submit">검색 <Search size={16} aria-hidden="true" /></button>
        </form>
        <nav className="editorial-issue-links" aria-label="주요 콘텐츠">
          <span>바로 읽기</span>
          <Link href="/blog">글</Link>
          <Link href="/decisions">판례·행정해석</Link>
          <Link href="/laws">법령 개정</Link>
          <Link href="/tools/work-rules">취업규칙 점검</Link>
        </nav>
      </section>

      {/* 🔴 261112 — AI 도구를 전면으로(재홍님 지시). 종전에는 /ai-tools 가 푸터 링크
          하나로만 닿았다. 검색 띠 바로 아래, 계산·점검 도구보다 위에 둔다.
          여기서 「전면」은 홈 첫 화면에서 보이는 것을 말한다. 순서를 내리려면 이 블록을
          아래 situations 섹션 뒤로 옮기면 된다. */}
      <section className="editorial-shell editorial-situations" aria-labelledby="home-ai-heading">
        <div className="editorial-section-heading">
          <h2 id="home-ai-heading">AI에 연결해서 쓰기</h2>
          <Link href="/ai-tools">연결 도구 전체 보기 <ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
        <p className="text-[14px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          쓰시는 AI(Claude·OpenClaw 등)에 한 줄로 붙이면, 계산·점검·서류 작업을 AI가 직접 합니다.
          화면을 오가지 않아도 됩니다.
        </p>
        <ul className="editorial-situation-grid">
          <li>
            <Link className="editorial-situation-name" href="/ai-tools#list">노동 업무 도구 묶음</Link>
            <ul>
              <li><Link href="/ai-tools#calc">임금·수당 계산</Link></li>
              <li><Link href="/ai-tools#checks">임금·계약 점검</Link></li>
              <li><Link href="/ai-tools#work-rules">취업규칙·법령</Link></li>
            </ul>
          </li>
          <li>
            <Link className="editorial-situation-name" href="/ai-tools#sanjae-apply">산재 신청 도우미</Link>
            <ul>
              <li><Link href="/ai-tools#sanjae-apply">신청 서류 묶음 만들기</Link></li>
            </ul>
          </li>
          <li>
            <Link className="editorial-situation-name" href="/ai-tools#safeclaw">SafeClaw 안전관리</Link>
            <ul>
              <li><a href="https://www.safeclaw.kr/settings/ai-connect">토큰 발급하고 연결</a></li>
            </ul>
          </li>
        </ul>
      </section>

      {/* 첫 화면은 도구가 먼저 — 뉴스는 레터로 가므로 아래로 내렸다(재홍님 261103) */}
      <section className="editorial-shell editorial-situations" aria-labelledby="home-tools-heading">
        <div className="editorial-section-heading">
          <h2 id="home-tools-heading">상황별 계산·점검 도구</h2>
          <Link href="/tools">도구 전체 보기 <ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
        <ul className="editorial-situation-grid">
          {TOOL_GROUPS.map(g => (
            <li key={g.id}>
              <Link className="editorial-situation-name" href={`/tools#${g.id}`}>{g.label}</Link>
              <ul>
                {HOME_PICKS[g.id].map(p => <li key={p.href}>{p.href.endsWith('.html') ? <a href={p.href}>{p.label}</a> : <Link href={p.href}>{p.label}</Link>}</li>)}
              </ul>
            </li>
          ))}
        </ul>
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
              <div className="editorial-meta"><BlogCategoryBadge category={featured.category} /><time dateTime={featured.published_at}>{formatPublicationDate(featured.published_at)}</time></div>
              <h3><Link href={`/blog/${featured.slug}`}>{featured.title}</Link></h3>
              {featured.subtitle && <p className="editorial-lead-subtitle">{featured.subtitle}</p>}
              {featured.summary && <p className="editorial-lead-deck">{featured.summary}</p>}
              <div className="editorial-lead-foot"><span>일의 무늬</span><Link href={`/blog/${featured.slug}`}>글 읽기 <ArrowRight size={16} aria-hidden="true" /></Link></div>
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

      <section className="editorial-shell editorial-guide-section" aria-labelledby="home-sections-heading">
        <div className="editorial-section-heading"><h2 id="home-sections-heading">메뉴 안내</h2></div>
        <div className="editorial-guide-links">
          {sections.map(section => (
            <Link key={section.title} href={section.href}>
              <h3>{section.title} <ArrowRight size={16} aria-hidden="true" /></h3>
              <p>{section.description}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* 261112 — 이 자리에 있던 「자주 묻는 질문」(노란봉투법 문답 7개)과 그 아래 「판례·행정해석 찾아보기」·
          「서비스 문의」 버튼을 뺐다. 노란봉투법 사이트로 보이게 하던 마지막 큰 덩어리였다.
          두 버튼의 행선지는 위 「메뉴 안내」와 상단 메뉴·푸터에 그대로 있다. */}

      {/* 🔴 2026-10-16 복구. 홈 구독 상자가 **2026-10-04 개편(67dca86) 때 빠져 있었다.**
          유입 경로를 세어 보니 구독자 16명 중 home-bottom 이 9명(56%) 으로 가장 큰 입구였는데,
          10-04 이후 home-bottom 가입이 0명이다. 2주 가까이 닫혀 있었다.
          자리는 「메뉴 안내」 다음(종전 FAQ 자리) — 글을 읽고 내려온 사람에게 묻는 것이 자연스럽고,
          source="home-bottom" 이 그 이름 그대로 「홈 맨 아래」를 뜻한다. */}
      <section className="px-5 pb-16 sm:pb-20" aria-label="뉴스레터 구독">
        <div className="mx-auto max-w-[var(--layout-list-max)]">
          <SubscribeForm source="home-bottom" />
        </div>
      </section>

    </div>
  );
}
