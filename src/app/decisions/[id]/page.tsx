import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase-server';
import { SITE_URL } from '@/lib/constants';
import { formatDecisionDate, getPreferredSummary, getPreferredDetail, translateReasonCategory } from '@/app/database/_components/utils';
import TagRow from '@/app/database/_components/TagRow';
import MarkdownSnippet from '@/app/database/_components/MarkdownSnippet';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Landmark,
  ExternalLink,
  MessageSquare,
  Search,
  CheckCircle,
  XCircle,
} from 'lucide-react';

export const dynamicParams = true;
export const revalidate = 86400;

interface NlrcDetail {
  id: string;
  case_number: string;
  title: string;
  department: string;
  decision_date: string | null;
  case_type: string | null;
  decision_result: string | null;
  reason_category: string[] | null;
  holding_points: string | null;
  holding_summary: string | null;
  summary_short: string | null;
  key_issue: string | null;
  url: string | null;
  original_url: string | null;
}

interface RelatedDecision {
  id: string;
  case_number: string;
  title: string;
  department: string;
  decision_date: string | null;
  decision_result: string | null;
}

async function getDecision(id: string): Promise<NlrcDetail | null> {
  const { data, error } = await supabaseServer
    .from('nlrc_decisions')
    .select('id, case_number, title, department, decision_date, case_type, decision_result, reason_category, holding_points, holding_summary, summary_short, key_issue, url, original_url')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return data as NlrcDetail;
}

async function getRelatedDecisions(currentId: string, reasonCategory: string[] | null): Promise<RelatedDecision[]> {
  if (!reasonCategory || reasonCategory.length === 0) return [];

  const { data } = await supabaseServer
    .from('nlrc_decisions')
    .select('id, case_number, title, department, decision_date, decision_result')
    .neq('id', currentId)
    .contains('reason_category', [reasonCategory[0]])
    .order('decision_date', { ascending: false })
    .limit(4);

  return (data || []) as RelatedDecision[];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const item = await getDecision(decodeURIComponent(id));

  if (!item) {
    return { title: '판정례를 찾을 수 없습니다' };
  }

  const dateStr = formatDecisionDate(item.decision_date) || '';
  const categories = (item.reason_category || []).map(translateReasonCategory).join(', ');
  const title = `${item.case_number} | ${item.department} ${item.decision_result || ''} 판정`;
  const descSource = item.holding_summary || item.summary_short || item.key_issue;
  const description = descSource
    ? descSource.slice(0, 160)
    : `${item.department} ${item.case_number} ${categories} — ${item.title}`;

  const pageUrl = `${SITE_URL}/decisions/${encodeURIComponent(item.id)}`;

  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      title,
      description,
      url: pageUrl,
      type: 'article',
      ...(item.decision_date && { publishedTime: item.decision_date }),
      locale: 'ko_KR',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

function DecisionResultBadge({ result }: { result: string | null }) {
  if (!result) return null;
  const isPositive = result.includes('인정') || result.includes('구제');
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
      style={{
        backgroundColor: isPositive ? 'var(--blue-50)' : 'var(--grey-100)',
        color: isPositive ? 'var(--blue-600)' : 'var(--grey-600)',
      }}
    >
      {isPositive ? <CheckCircle size={11} /> : <XCircle size={11} />}
      {result}
    </span>
  );
}

export default async function DecisionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = await getDecision(decodeURIComponent(id));

  if (!item) {
    notFound();
  }

  const related = await getRelatedDecisions(item.id, item.reason_category);
  const summary = getPreferredSummary(item);
  const detail = getPreferredDetail(item);
  const dateStr = formatDecisionDate(item.decision_date);
  const pageUrl = `${SITE_URL}/decisions/${encodeURIComponent(item.id)}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '홈', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: '판정례 검색', item: `${SITE_URL}/database` },
          { '@type': 'ListItem', position: 3, name: item.case_number, item: pageUrl },
        ],
      },
      {
        '@type': 'Article',
        '@id': pageUrl,
        headline: `${item.case_number} ${item.title}`,
        description: item.holding_summary || item.summary_short || item.title,
        ...(item.decision_date && { datePublished: item.decision_date }),
        author: { '@type': 'Organization', name: item.department },
        publisher: { '@id': `${SITE_URL}/#organization` },
        mainEntityOfPage: pageUrl,
        inLanguage: 'ko',
        keywords: (item.reason_category || []).map(translateReasonCategory).join(', '),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto max-w-[1100px] px-5 py-10">
        <div className="lg:grid lg:grid-cols-[1fr_280px] lg:gap-10">
          {/* Main Content */}
          <article>
            {/* Back link */}
            <Link
              href="/database"
              className="mb-6 inline-flex items-center gap-1.5 text-[13px] transition-colors hover:opacity-70"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              <ArrowLeft size={14} />
              판정례 검색
            </Link>

            {/* Header */}
            <header className="mb-8">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                  style={{ backgroundColor: '#f3e8ff', color: '#7c3aed' }}
                >
                  <Landmark size={11} />
                  노동위원회
                </span>
                <DecisionResultBadge result={item.decision_result} />
                {dateStr && (
                  <span
                    className="flex items-center gap-1 text-[12px]"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    <Calendar size={12} />
                    {dateStr}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 mb-2">
                <Landmark size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                <span className="text-[13px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                  {item.department}
                </span>
                <span className="text-[13px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {item.case_number}
                </span>
              </div>

              <h1
                className="text-xl font-bold leading-tight mb-3 md:text-2xl"
                style={{ color: 'var(--color-text-primary)' }}
              >
                {item.title}
              </h1>

              <TagRow reasonCategory={item.reason_category} />
            </header>

            {/* Key Issue */}
            {item.key_issue && (
              <section className="mb-8">
                <h2 className="text-[15px] font-bold mb-3" style={{ color: 'var(--color-text-primary)' }}>
                  핵심 쟁점
                </h2>
                <div
                  className="rounded-xl p-5 text-[14px] leading-7"
                  style={{
                    backgroundColor: '#f3e8ff',
                    borderLeft: '3px solid #7c3aed',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  <MarkdownSnippet value={item.key_issue} />
                </div>
              </section>
            )}

            {/* Summary */}
            {summary && summary !== item.key_issue && (
              <section className="mb-8">
                <h2 className="text-[15px] font-bold mb-3" style={{ color: 'var(--color-text-primary)' }}>
                  판정 요지
                </h2>
                <div
                  className="rounded-xl p-5 text-[14px] leading-7"
                  style={{
                    backgroundColor: 'var(--blue-50)',
                    borderLeft: '3px solid var(--color-accent)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  <MarkdownSnippet value={summary} />
                </div>
              </section>
            )}

            {/* Holding Points / Detail */}
            {detail && detail !== summary && detail !== item.key_issue && (
              <section className="mb-8">
                <h2 className="text-[15px] font-bold mb-3" style={{ color: 'var(--color-text-primary)' }}>
                  판정 상세
                </h2>
                <div
                  className="rounded-xl border p-5 text-[14px] leading-7"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  <MarkdownSnippet value={detail} />
                </div>
              </section>
            )}

            {/* Source link */}
            {item.original_url && (
              <div className="mb-8">
                <a
                  href={item.original_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors hover:opacity-70"
                  style={{ color: 'var(--color-accent)' }}
                >
                  <ExternalLink size={13} />
                  원문 보기
                </a>
              </div>
            )}

            {/* Related Decisions */}
            {related.length > 0 && (
              <section className="mt-10 pt-8" style={{ borderTop: '1px solid var(--color-border)' }}>
                <h2 className="flex items-center gap-2 text-[17px] font-bold mb-5" style={{ color: 'var(--color-text-primary)' }}>
                  <Landmark size={18} style={{ color: '#7c3aed' }} />
                  유사 판정례
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {related.map((r) => (
                    <Link
                      key={r.id}
                      href={`/decisions/${encodeURIComponent(r.id)}`}
                      className="rounded-xl border p-4 transition-shadow hover:shadow-md"
                      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}
                    >
                      <div className="flex items-center gap-2 text-[11px] mb-1" style={{ color: 'var(--color-text-tertiary)' }}>
                        <span>{r.department}</span>
                        <DecisionResultBadge result={r.decision_result} />
                      </div>
                      <p className="text-[13px] font-medium leading-snug" style={{ color: 'var(--color-text-primary)' }}>
                        {r.title}
                      </p>
                      {r.decision_date && (
                        <p className="mt-1 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                          {formatDecisionDate(r.decision_date)}
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* CTA Section */}
            <section className="mt-10 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Link
                  href={`/database?q=${encodeURIComponent(
                    item.reason_category?.[0]
                      ? translateReasonCategory(item.reason_category[0])
                      : item.case_number
                  )}`}
                  className="flex items-center gap-3 rounded-xl border p-5 transition-shadow hover:shadow-md"
                  style={{ borderColor: 'var(--color-accent)', backgroundColor: 'var(--blue-50)' }}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--color-accent)' }}>
                    <Search size={18} style={{ color: 'white' }} />
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>유사 판정례 검색</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>같은 유형의 다른 판정 사례 확인</p>
                  </div>
                </Link>
                <Link
                  href="/ai"
                  className="flex items-center gap-3 rounded-xl border p-5 transition-shadow hover:shadow-md"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: '#059669' }}>
                    <MessageSquare size={18} style={{ color: 'white' }} />
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>AI에게 질문하기</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>이 판정례가 우리 사안에 적용되는지 확인</p>
                  </div>
                </Link>
              </div>
              <div className="rounded-2xl p-6 sm:p-8 text-center" style={{ backgroundColor: '#191f28' }}>
                <p className="text-lg font-bold text-white">전문가 상담이 필요하신가요?</p>
                <p className="mt-2 text-sm text-white/70">노무법인 위너스에서 사업장 맞춤 상담을 제공합니다.</p>
                <Link
                  href="/contact"
                  className="mt-4 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-colors hover:opacity-90"
                  style={{ backgroundColor: 'var(--color-bg-surface)', color: 'var(--grey-900)' }}
                >
                  무료 상담 신청하기 <ArrowRight size={14} />
                </Link>
              </div>
            </section>
          </article>

          {/* Sidebar */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-6">
              {/* Decision Info Card */}
              <div
                className="rounded-2xl border p-5"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)', boxShadow: 'var(--shadow-sm)' }}
              >
                <h3 className="text-[14px] font-bold mb-3" style={{ color: 'var(--color-text-primary)' }}>
                  사건 정보
                </h3>
                <dl className="space-y-2 text-[13px]">
                  <div>
                    <dt style={{ color: 'var(--color-text-tertiary)' }}>판정기관</dt>
                    <dd className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{item.department}</dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--color-text-tertiary)' }}>사건번호</dt>
                    <dd className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{item.case_number}</dd>
                  </div>
                  {dateStr && (
                    <div>
                      <dt style={{ color: 'var(--color-text-tertiary)' }}>판정일</dt>
                      <dd className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{dateStr}</dd>
                    </div>
                  )}
                  {item.decision_result && (
                    <div>
                      <dt style={{ color: 'var(--color-text-tertiary)' }}>판정결과</dt>
                      <dd className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{item.decision_result}</dd>
                    </div>
                  )}
                  {item.case_type && (
                    <div>
                      <dt style={{ color: 'var(--color-text-tertiary)' }}>사건유형</dt>
                      <dd className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{item.case_type}</dd>
                    </div>
                  )}
                  {item.reason_category && item.reason_category.length > 0 && (
                    <div>
                      <dt style={{ color: 'var(--color-text-tertiary)' }}>분류</dt>
                      <dd className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                        {item.reason_category.map(translateReasonCategory).join(', ')}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* CTA Sidebar */}
              <div className="rounded-2xl p-5" style={{ backgroundColor: '#191f28' }}>
                <p className="text-[14px] font-bold text-white mb-2">전문가 상담</p>
                <p className="text-[12px] text-white/70 mb-4 leading-relaxed">
                  이 판정례와 유사한 사안이라면 노무법인 위너스에 문의하세요.
                </p>
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-medium"
                  style={{ backgroundColor: 'var(--color-bg-surface)', color: 'var(--grey-900)' }}
                >
                  상담 문의 <ArrowRight size={12} />
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
