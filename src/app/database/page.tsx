import Link from 'next/link';
import { ArrowRight, FileText, Scale, Search } from 'lucide-react';
import DatabaseClient from './DatabaseClient';
import { SITE_URL } from '@/lib/constants';
import { supabaseServer } from '@/lib/supabase-server';

export const revalidate = 3600;

type FeaturedCase = {
  id: string;
  title: string;
  court: string;
  case_number: string;
  decision_date: string | null;
  summary: string | null;
  url: string | null;
};

type FeaturedAdmin = {
  id: string;
  title: string;
  doc_number: string;
  decision_date: string | null;
  summary: string | null;
  url: string | null;
};

const FEATURED_CASE_NUMBERS = ['2007두8881', '2010다106436', '2023누34646'];
const FEATURED_ADMIN_DOC_NUMBERS = ['10-0445', '17-0557', '10-0181'];
const RECOMMENDED_QUERIES = [
  { label: '사용자성', href: '/database?q=사용자성' },
  { label: '단체교섭', href: '/database?q=단체교섭' },
  { label: '부당노동행위', href: '/database?q=부당노동행위' },
  { label: '파견', href: '/database?q=파견' },
  { label: '손해배상', href: '/database?q=손해배상' },
  { label: '교섭창구', href: '/database?q=교섭창구&tab=admin' },
  { label: '행정해석 보기', href: '/database?q=단체교섭&tab=admin' },
  { label: '노동위결정문', href: '/database?q=부당노동행위&tab=nlrc' },
];

function summarize(text: string | null, maxLength = 180) {
  if (!text) return '';
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact;
}

async function getDatabaseLandingData() {
  const [casesCountResult, adminCountResult, nlrcCountResult, featuredCasesResult, featuredAdminResult] = await Promise.all([
    supabaseServer.from('cases').select('id', { count: 'exact', head: true }),
    supabaseServer.from('admin_interpretations').select('id', { count: 'exact', head: true }),
    supabaseServer.from('nlrc_decisions').select('id', { count: 'exact', head: true }),
    supabaseServer
      .from('cases')
      .select('id, title, court, case_number, decision_date, summary, url, original_url')
      .in('case_number', FEATURED_CASE_NUMBERS),
    supabaseServer
      .from('admin_interpretations')
      .select('id, title, doc_number, decision_date, summary, url, original_url')
      .in('doc_number', FEATURED_ADMIN_DOC_NUMBERS),
  ]);

  const caseMap = new Map((featuredCasesResult.data || []).map((item) => [item.case_number, item]));
  const adminMap = new Map((featuredAdminResult.data || []).map((item) => [item.doc_number, item]));

  return {
    totalCases: casesCountResult.count || 0,
    totalAdmin: adminCountResult.count || 0,
    totalNlrc: nlrcCountResult.count || 0,
    featuredCases: FEATURED_CASE_NUMBERS.map((caseNumber) => caseMap.get(caseNumber)).filter(Boolean) as FeaturedCase[],
    featuredAdmins: FEATURED_ADMIN_DOC_NUMBERS.map((docNumber) => adminMap.get(docNumber)).filter(Boolean) as FeaturedAdmin[],
  };
}

export default async function DatabasePage() {
  const { totalCases, totalAdmin, totalNlrc, featuredCases, featuredAdmins } = await getDatabaseLandingData();
  const pageUrl = `${SITE_URL}/database`;
  const featuredItems = [
    ...featuredCases.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Article',
        name: item.title,
        description: summarize(item.summary, 140),
        datePublished: item.decision_date || undefined,
        identifier: item.case_number,
        url: `${pageUrl}?q=${encodeURIComponent(item.case_number)}`,
      },
    })),
    ...featuredAdmins.map((item, index) => ({
      '@type': 'ListItem',
      position: featuredCases.length + index + 1,
      item: {
        '@type': 'Article',
        name: item.title,
        description: summarize(item.summary, 140),
        datePublished: item.decision_date || undefined,
        identifier: item.doc_number,
        url: `${pageUrl}?q=${encodeURIComponent(item.doc_number)}&tab=admin`,
      },
    })),
  ];
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${pageUrl}#webpage`,
        url: pageUrl,
        name: '노란봉투법 판례·행정해석 검색',
        description: `판례 ${totalCases.toLocaleString()}건, 행정해석 ${totalAdmin.toLocaleString()}건, 노동위결정문 ${totalNlrc.toLocaleString()}건을 탐색하는 검색 페이지`,
        isPartOf: { '@id': `${SITE_URL}/#website` },
        breadcrumb: { '@id': `${pageUrl}#breadcrumb` },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${pageUrl}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '홈', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: '판례·행정해석 검색', item: pageUrl },
        ],
      },
      {
        '@type': 'ItemList',
        '@id': `${pageUrl}#featured`,
        name: '대표 판례 및 행정해석',
        itemListElement: featuredItems,
      },
    ],
  };

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <section className="max-w-[860px]">
        <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--grey-50)', color: 'var(--color-text-secondary)' }}>
          <Search size={14} />
          실무형 판례·행정해석 검색
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl" style={{ color: 'var(--color-text-primary)' }}>
          판례와 행정해석을
          <br />
          검색보다 이해 중심으로 찾는 페이지
        </h1>
        <p className="mt-4 text-[15px] leading-7 md:text-[16px]" style={{ color: 'var(--color-text-secondary)' }}>
          이 페이지는 노란봉투법과 직접 맞닿는 쟁점인 사용자성, 단체교섭, 부당노동행위, 파견·도급, 손해배상 관련 자료를 빠르게 찾을 수 있도록 구성했습니다.
          판례 {totalCases.toLocaleString()}건, 행정해석 {totalAdmin.toLocaleString()}건, 노동위결정문 {totalNlrc.toLocaleString()}건을 검색할 수 있고, 먼저 대표 사례를 읽은 뒤 바로 유사 자료로 확장해볼 수 있습니다.
        </p>
      </section>

      <section className="mt-8 rounded-3xl border p-5 md:p-7" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
        <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>추천 검색</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          사람들이 실제로 많이 찾는 질문형 키워드부터 시작하면 원하는 자료에 더 빨리 닿습니다.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {RECOMMENDED_QUERIES.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full border px-3 py-1.5 text-sm transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border p-5 md:p-6" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
          <div className="flex items-center gap-2">
            <Scale size={18} style={{ color: 'var(--color-accent)' }} />
            <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>대표 판례 미리 보기</h2>
          </div>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            원청 사용자성, 도급·파견 구별, 간접 통제 같은 핵심 논리를 먼저 읽어보면 검색 정확도가 올라갑니다.
          </p>
          <div className="mt-4 space-y-3">
            {featuredCases.map((item) => (
              <article key={item.id} className="rounded-2xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--grey-50)' }}>
                <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  <span className="rounded-md px-2 py-0.5 font-medium" style={{ backgroundColor: 'var(--blue-50)', color: 'var(--blue-600)' }}>
                    {item.court}
                  </span>
                  <span>{item.case_number}</span>
                  {item.decision_date && <span>{item.decision_date}</span>}
                </div>
                <h3 className="mt-2 text-[15px] font-semibold leading-snug" style={{ color: 'var(--color-text-primary)' }}>
                  {item.title}
                </h3>
                {item.summary && (
                  <p className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                    {summarize(item.summary)}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-3">
                  <Link href={`/database?q=${encodeURIComponent(item.case_number)}`} className="text-sm font-medium" style={{ color: 'var(--color-accent)' }}>
                    유사 판례 검색
                  </Link>
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                      원문 보기
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
          <Link href="/cases" className="mt-4 inline-flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--color-accent)' }}>
            핵심판례 6선 전체 보기 <ArrowRight size={14} />
          </Link>
        </div>

        <div className="rounded-3xl border p-5 md:p-6" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
          <div className="flex items-center gap-2">
            <FileText size={18} style={{ color: 'var(--color-accent)' }} />
            <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>대표 행정해석 미리 보기</h2>
          </div>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            행정해석은 법원이 보기 전에 현장에서 먼저 부딪히는 운영 이슈를 정리해주는 경우가 많습니다. 교섭 범위와 노동위원회 절차를 함께 보세요.
          </p>
          <div className="mt-4 space-y-3">
            {featuredAdmins.map((item) => (
              <article key={item.id} className="rounded-2xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--grey-50)' }}>
                <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  <span className="rounded-md px-2 py-0.5 font-medium" style={{ backgroundColor: 'var(--color-accent-light)', color: 'var(--color-accent)' }}>
                    행정해석
                  </span>
                  <span>{item.doc_number}</span>
                  {item.decision_date && <span>{item.decision_date}</span>}
                </div>
                <h3 className="mt-2 text-[15px] font-semibold leading-snug" style={{ color: 'var(--color-text-primary)' }}>
                  {item.title}
                </h3>
                {item.summary && (
                  <p className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                    {summarize(item.summary)}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-3">
                  <Link href={`/database?q=${encodeURIComponent(item.doc_number)}&tab=admin`} className="text-sm font-medium" style={{ color: 'var(--color-accent)' }}>
                    유사 해석 검색
                  </Link>
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                      원문 보기
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border p-5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
          <h2 className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>판례 검색 팁</h2>
          <p className="mt-2 text-sm leading-6" style={{ color: 'var(--color-text-secondary)' }}>
            회사 유형보다 쟁점 단어를 먼저 넣는 편이 좋습니다. 예: 사용자성, 원청, 파견, 손해배상, 교섭 거부.
          </p>
        </div>
        <div className="rounded-2xl border p-5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
          <h2 className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>행정해석 읽는 법</h2>
          <p className="mt-2 text-sm leading-6" style={{ color: 'var(--color-text-secondary)' }}>
            현재 공개된 행정해석은 노조법과 인접 노동관계 법령 자료가 중심입니다. 사용자성보다 단체교섭, 교섭창구, 부당노동행위 같은 제도 키워드로 더 잘 찾을 수 있습니다.
          </p>
        </div>
        <div className="rounded-2xl border p-5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
          <h2 className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>이 페이지의 한계</h2>
          <p className="mt-2 text-sm leading-6" style={{ color: 'var(--color-text-secondary)' }}>
            검색 결과에는 노조법 일반 자료가 섞이거나, 같은 사건번호가 다른 요약 품질로 중복될 수 있습니다. 대표 사례를 먼저 읽고, 이어서 관련 키워드로 좁혀가면 정확도가 올라갑니다.
          </p>
        </div>
      </section>

      <DatabaseClient initialTotalCases={totalCases} initialTotalAdmin={totalAdmin} initialTotalNlrc={totalNlrc} />
    </div>
  );
}
