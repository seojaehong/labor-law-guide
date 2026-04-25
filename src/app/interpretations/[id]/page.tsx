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
  FileText,
  ExternalLink,
  MessageSquare,
  Search,
} from 'lucide-react';

export const dynamicParams = true;
export const revalidate = 86400;

interface AdminDetail {
  id: string;
  title: string;
  doc_number: string | null;
  decision_date: string | null;
  keywords_matched: string[] | null;
  summary: string | null;
  holding_points: string | null;
  url: string | null;
  original_url: string | null;
}

interface RelatedAdmin {
  id: string;
  title: string;
  doc_number: string | null;
  decision_date: string | null;
}

async function getInterpretation(id: string): Promise<AdminDetail | null> {
  // 1차: molab_interpretations (Phase 2.2 메인 테이블, 9573건)
  const ml = await supabaseServer
    .from('molab_interpretations')
    .select('id, title, case_number, decision_date, keywords_matched, inquiry_summary, answer_summary, full_text, url')
    .eq('id', id)
    .maybeSingle();
  if (ml.data) {
    const r = ml.data as {
      id: string;
      title: string;
      case_number: string | null;
      decision_date: string | null;
      keywords_matched: string[] | null;
      inquiry_summary: string | null;
      answer_summary: string | null;
      full_text: string | null;
      url: string | null;
    };
    return {
      id: r.id,
      title: r.title,
      doc_number: r.case_number,
      decision_date: r.decision_date,
      keywords_matched: r.keywords_matched,
      summary: r.inquiry_summary,
      holding_points: r.answer_summary || r.full_text,
      url: r.url,
      original_url: r.url,
    };
  }
  // 2차: admin_interpretations (이전 import)
  const { data, error } = await supabaseServer
    .from('admin_interpretations')
    .select('id, title, doc_number, decision_date, keywords_matched, summary, holding_points, url, original_url')
    .eq('id', id)
    .single();
  if (error || !data) return null;
  return data as AdminDetail;
}

async function getRelatedInterpretations(currentId: string, keywords: string[] | null): Promise<RelatedAdmin[]> {
  if (!keywords || keywords.length === 0) return [];

  const { data } = await supabaseServer
    .from('molab_interpretations')
    .select('id, title, case_number, decision_date')
    .neq('id', currentId)
    .contains('keywords_matched', [keywords[0]])
    .order('decision_date', { ascending: false })
    .limit(4);

  return ((data || []) as Array<{ id: string; title: string; case_number: string | null; decision_date: string | null }>).map((r) => ({
    id: r.id,
    title: r.title,
    doc_number: r.case_number,
    decision_date: r.decision_date,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const item = await getInterpretation(decodeURIComponent(id));

  if (!item) {
    return { title: '행정해석을 찾을 수 없습니다' };
  }

  const dateStr = formatDecisionDate(item.decision_date) || '';
  const title = `${item.doc_number || '행정해석'} | ${item.title}`;
  const description = item.summary
    ? item.summary.slice(0, 160)
    : `${item.doc_number || ''} ${item.title}`;

  const pageUrl = `${SITE_URL}/interpretations/${encodeURIComponent(item.id)}`;

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
    twitter: { card: 'summary', title, description },
  };
}

export default async function InterpretationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = await getInterpretation(decodeURIComponent(id));

  if (!item) {
    notFound();
  }

  const related = await getRelatedInterpretations(item.id, item.keywords_matched);
  const summary = getPreferredSummary(item);
  const detail = getPreferredDetail(item);
  const dateStr = formatDecisionDate(item.decision_date);
  const pageUrl = `${SITE_URL}/interpretations/${encodeURIComponent(item.id)}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '홈', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: '행정해석 검색', item: `${SITE_URL}/database?tab=admin` },
          { '@type': 'ListItem', position: 3, name: item.doc_number || item.title, item: pageUrl },
        ],
      },
      {
        '@type': 'Article',
        '@id': pageUrl,
        headline: item.title,
        description: item.summary || item.title,
        ...(item.decision_date && { datePublished: item.decision_date }),
        author: { '@type': 'Organization', name: '고용노동부' },
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
          <article>
            <Link
              href="/database?tab=admin"
              className="mb-6 inline-flex items-center gap-1.5 text-[13px] transition-colors hover:opacity-70"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              <ArrowLeft size={14} />
              행정해석 검색
            </Link>

            <header className="mb-8">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                  style={{ backgroundColor: 'var(--color-accent-light)', color: 'var(--color-accent)' }}
                >
                  <FileText size={11} />
                  행정해석
                </span>
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

              {item.doc_number && (
                <div className="flex items-center gap-2 mb-2">
                  <FileText size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                  <span className="text-[13px]" style={{ color: 'var(--color-text-tertiary)' }}>
                    {item.doc_number}
                  </span>
                </div>
              )}

              <h1
                className="text-xl font-bold leading-tight mb-3 md:text-2xl"
                style={{ color: 'var(--color-text-primary)' }}
              >
                {item.title}
              </h1>

              <TagRow keywordsMatched={item.keywords_matched} />
            </header>

            {summary && (
              <section className="mb-8">
                <h2 className="text-[15px] font-bold mb-3" style={{ color: 'var(--color-text-primary)' }}>
                  해석 요지
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

            {detail && detail !== summary && (
              <section className="mb-8">
                <h2 className="text-[15px] font-bold mb-3" style={{ color: 'var(--color-text-primary)' }}>
                  판단 요지
                </h2>
                <div
                  className="rounded-xl border p-5 text-[14px] leading-7"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  <MarkdownSnippet value={detail} />
                </div>
              </section>
            )}

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

            {related.length > 0 && (
              <section className="mt-10 pt-8" style={{ borderTop: '1px solid var(--color-border)' }}>
                <h2 className="flex items-center gap-2 text-[17px] font-bold mb-5" style={{ color: 'var(--color-text-primary)' }}>
                  <FileText size={18} style={{ color: 'var(--color-accent)' }} />
                  관련 행정해석
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {related.map((r) => (
                    <Link
                      key={r.id}
                      href={`/interpretations/${encodeURIComponent(r.id)}`}
                      className="rounded-xl border p-4 transition-shadow hover:shadow-md"
                      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}
                    >
                      <div className="text-[11px] mb-1" style={{ color: 'var(--color-text-tertiary)' }}>
                        {r.doc_number}
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

            <section className="mt-10 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Link
                  href={`/database?tab=admin&q=${encodeURIComponent(item.keywords_matched?.[0] || item.title.split(' ')[0])}`}
                  className="flex items-center gap-3 rounded-xl border p-5 transition-shadow hover:shadow-md"
                  style={{ borderColor: 'var(--color-accent)', backgroundColor: 'var(--blue-50)' }}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--color-accent)' }}>
                    <Search size={18} style={{ color: 'white' }} />
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>관련 해석 검색</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>같은 주제의 다른 행정해석 확인</p>
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
                    <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>이 해석이 우리 상황에 적용되는지 확인</p>
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

          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-6">
              <div
                className="rounded-2xl border p-5"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)', boxShadow: 'var(--shadow-sm)' }}
              >
                <h3 className="text-[14px] font-bold mb-3" style={{ color: 'var(--color-text-primary)' }}>
                  문서 정보
                </h3>
                <dl className="space-y-2 text-[13px]">
                  {item.doc_number && (
                    <div>
                      <dt style={{ color: 'var(--color-text-tertiary)' }}>문서번호</dt>
                      <dd className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{item.doc_number}</dd>
                    </div>
                  )}
                  {dateStr && (
                    <div>
                      <dt style={{ color: 'var(--color-text-tertiary)' }}>회신일</dt>
                      <dd className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{dateStr}</dd>
                    </div>
                  )}
                  {item.keywords_matched && item.keywords_matched.length > 0 && (
                    <div>
                      <dt style={{ color: 'var(--color-text-tertiary)' }}>키워드</dt>
                      <dd className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                        {item.keywords_matched.join(', ')}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>

              <div className="rounded-2xl p-5" style={{ backgroundColor: '#191f28' }}>
                <p className="text-[14px] font-bold text-white mb-2">전문가 상담</p>
                <p className="text-[12px] text-white/70 mb-4 leading-relaxed">
                  이 행정해석의 적용 여부가 궁금하시면 노무법인 위너스에 문의하세요.
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
