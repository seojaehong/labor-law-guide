import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase-server';
import { SITE_URL } from '@/lib/constants';
import { formatDecisionDate, getPreferredSummary, getPreferredDetail } from '@/app/database/_components/utils';
import TagRow from '@/app/database/_components/TagRow';
import MarkdownSnippet from '@/app/database/_components/MarkdownSnippet';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Scale,
  Landmark,
  ExternalLink,
  MessageSquare,
  Search,
} from 'lucide-react';

export const dynamicParams = true;
export const revalidate = 86400;

interface CaseDetail {
  id: string;
  case_number: string;
  court: string;
  title: string;
  decision_date: string | null;
  case_type: string | null;
  verdict_type: string | null;
  keywords_matched: string[] | null;
  summary: string | null;
  holding_points: string | null;
  law_references: string | null;
  url: string | null;
}

interface RelatedCase {
  id: string;
  case_number: string;
  court: string;
  title: string;
  decision_date: string | null;
  verdict_type: string | null;
}

async function getCase(id: string): Promise<CaseDetail | null> {
  const { data, error } = await supabaseServer
    .from('cases')
    .select('id, case_number, court, title, decision_date, case_type, verdict_type, keywords_matched, summary, holding_points, law_references, url')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return data as CaseDetail;
}

async function getRelatedCases(currentId: string, caseType: string | null, court: string | null): Promise<RelatedCase[]> {
  if (!caseType && !court) return [];

  const query = supabaseServer
    .from('cases')
    .select('id, case_number, court, title, decision_date, verdict_type')
    .neq('id', currentId)
    .order('decision_date', { ascending: false })
    .limit(4);

  if (caseType) {
    query.eq('case_type', caseType);
  }

  const { data } = await query;
  return (data || []) as RelatedCase[];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const item = await getCase(decodeURIComponent(id));

  if (!item) {
    return { title: '판례를 찾을 수 없습니다' };
  }

  const dateStr = formatDecisionDate(item.decision_date) || '';
  const title = `${item.case_number} | ${item.court} ${dateStr} 판결`;
  const description = item.summary
    ? item.summary.slice(0, 160)
    : `${item.court} ${item.case_number} ${item.title}`;

  const pageUrl = `${SITE_URL}/cases/${encodeURIComponent(item.id)}`;

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

function VerdictBadge({ type }: { type: string | null }) {
  if (!type) return null;
  const colors: Record<string, { bg: string; text: string }> = {
    '원고승': { bg: 'var(--blue-50)', text: 'var(--blue-600)' },
    '원고패': { bg: 'var(--grey-100)', text: 'var(--grey-600)' },
    '원고일부승': { bg: '#fef3c7', text: '#92400e' },
    '파기환송': { bg: '#fce4ec', text: '#b71c1c' },
    '상고기각': { bg: 'var(--grey-100)', text: 'var(--grey-600)' },
  };
  const c = colors[type] || { bg: 'var(--grey-100)', text: 'var(--grey-600)' };
  return (
    <span className="rounded-full px-2.5 py-0.5 text-[11px] font-medium" style={{ backgroundColor: c.bg, color: c.text }}>
      {type}
    </span>
  );
}

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = await getCase(decodeURIComponent(id));

  if (!item) {
    notFound();
  }

  const related = await getRelatedCases(item.id, item.case_type, item.court);
  const summary = getPreferredSummary(item);
  const detail = getPreferredDetail(item);
  const dateStr = formatDecisionDate(item.decision_date);
  const pageUrl = `${SITE_URL}/cases/${encodeURIComponent(item.id)}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '홈', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: '판례 검색', item: `${SITE_URL}/database` },
          { '@type': 'ListItem', position: 3, name: item.case_number, item: pageUrl },
        ],
      },
      {
        '@type': 'Article',
        '@id': pageUrl,
        headline: `${item.case_number} ${item.title}`,
        description: item.summary || item.title,
        ...(item.decision_date && { datePublished: item.decision_date }),
        author: { '@type': 'Organization', name: item.court },
        publisher: { '@id': `${SITE_URL}/#organization` },
        mainEntityOfPage: pageUrl,
        inLanguage: 'ko',
        keywords: item.keywords_matched?.join(', ') || '',
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
              판례 검색
            </Link>

            {/* Header */}
            <header className="mb-8">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                  style={{ backgroundColor: 'var(--blue-50)', color: 'var(--blue-600)' }}
                >
                  <Scale size={11} />
                  {item.case_type || '판례'}
                </span>
                <VerdictBadge type={item.verdict_type} />
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
                  {item.court}
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

              <TagRow keywordsMatched={item.keywords_matched} />
            </header>

            {/* Summary */}
            {summary && (
              <section className="mb-8">
                <h2 className="text-[15px] font-bold mb-3" style={{ color: 'var(--color-text-primary)' }}>
                  판결 요지
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
            {detail && detail !== summary && (
              <section className="mb-8">
                <h2 className="text-[15px] font-bold mb-3" style={{ color: 'var(--color-text-primary)' }}>
                  판시사항
                </h2>
                <div
                  className="rounded-xl border p-5 text-[14px] leading-7"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  <MarkdownSnippet value={detail} />
                </div>
              </section>
            )}

            {/* Law References */}
            {item.law_references && (
              <section className="mb-8">
                <h2 className="text-[15px] font-bold mb-3" style={{ color: 'var(--color-text-primary)' }}>
                  참조 법령
                </h2>
                <div
                  className="rounded-xl border p-4 text-[13px] leading-6"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  {item.law_references}
                </div>
              </section>
            )}

            {/* Source link */}
            {item.url && (
              <div className="mb-8">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors hover:opacity-70"
                  style={{ color: 'var(--color-accent)' }}
                >
                  <ExternalLink size={13} />
                  원문 보기 (법제처)
                </a>
              </div>
            )}

            {/* Related Cases */}
            {related.length > 0 && (
              <section className="mt-10 pt-8" style={{ borderTop: '1px solid var(--color-border)' }}>
                <h2 className="flex items-center gap-2 text-[17px] font-bold mb-5" style={{ color: 'var(--color-text-primary)' }}>
                  <Scale size={18} style={{ color: 'var(--color-accent)' }} />
                  관련 판례
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {related.map((r) => (
                    <Link
                      key={r.id}
                      href={`/cases/${encodeURIComponent(r.id)}`}
                      className="rounded-xl border p-4 transition-shadow hover:shadow-md"
                      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}
                    >
                      <div className="flex items-center gap-2 text-[11px] mb-1" style={{ color: 'var(--color-text-tertiary)' }}>
                        <span>{r.court}</span>
                        <span>{r.case_number}</span>
                        {r.verdict_type && <VerdictBadge type={r.verdict_type} />}
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
                  href={`/database?q=${encodeURIComponent(item.keywords_matched?.[0] || item.case_number)}`}
                  className="flex items-center gap-3 rounded-xl border p-5 transition-shadow hover:shadow-md"
                  style={{ borderColor: 'var(--color-accent)', backgroundColor: 'var(--blue-50)' }}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--color-accent)' }}>
                    <Search size={18} style={{ color: 'white' }} />
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>유사 판례 검색</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>같은 쟁점의 다른 판결 확인하기</p>
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
                    <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>이 판례가 우리 사업장에도 적용되는지 확인</p>
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
              {/* Case Info Card */}
              <div
                className="rounded-2xl border p-5"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)', boxShadow: 'var(--shadow-sm)' }}
              >
                <h3 className="text-[14px] font-bold mb-3" style={{ color: 'var(--color-text-primary)' }}>
                  사건 정보
                </h3>
                <dl className="space-y-2 text-[13px]">
                  <div>
                    <dt style={{ color: 'var(--color-text-tertiary)' }}>법원</dt>
                    <dd className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{item.court}</dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--color-text-tertiary)' }}>사건번호</dt>
                    <dd className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{item.case_number}</dd>
                  </div>
                  {dateStr && (
                    <div>
                      <dt style={{ color: 'var(--color-text-tertiary)' }}>선고일</dt>
                      <dd className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{dateStr}</dd>
                    </div>
                  )}
                  {item.case_type && (
                    <div>
                      <dt style={{ color: 'var(--color-text-tertiary)' }}>사건유형</dt>
                      <dd className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{item.case_type}</dd>
                    </div>
                  )}
                  {item.verdict_type && (
                    <div>
                      <dt style={{ color: 'var(--color-text-tertiary)' }}>판결결과</dt>
                      <dd className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{item.verdict_type}</dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* CTA Sidebar */}
              <div className="rounded-2xl p-5" style={{ backgroundColor: '#191f28' }}>
                <p className="text-[14px] font-bold text-white mb-2">전문가 상담</p>
                <p className="text-[12px] text-white/70 mb-4 leading-relaxed">
                  이 판례와 유사한 사안이라면 노무법인 위너스에 문의하세요.
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
