import { keyCases } from '@/content/key-cases-data';
import { ArrowRight, BookOpenText } from 'lucide-react';
import Link from 'next/link';
import { SITE_URL } from '@/lib/constants';
import CasesClient from './CasesClient';

export default function CasesPage() {
  const pageUrl = `${SITE_URL}/cases`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${pageUrl}#webpage`,
        url: pageUrl,
        name: '노란봉투법 핵심판례 6선',
        description: '노란봉투법 시행과 사용자성 판단에 활용되는 핵심 판례 6건 요약',
        isPartOf: { '@id': `${SITE_URL}/#website` },
        breadcrumb: { '@id': `${pageUrl}#breadcrumb` },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${pageUrl}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '홈', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: '핵심판례', item: pageUrl },
        ],
      },
      {
        '@type': 'ItemList',
        '@id': `${pageUrl}#cases`,
        name: '노란봉투법 핵심판례 6선',
        itemListElement: keyCases.map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          item: {
            '@type': 'Article',
            name: `${item.court} ${item.caseNumber} ${item.title}`,
            description: item.keyHolding,
            datePublished: item.date.replace(/\./g, '-'),
            url: `${SITE_URL}/database?q=${encodeURIComponent(item.databaseQuery)}`,
          },
        })),
      },
    ],
  };

  return (
    <div className="mx-auto max-w-[920px] px-5 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <section>
        <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--grey-50)', color: 'var(--color-text-secondary)' }}>
          <BookOpenText size={14} />
          사용자성·파견·경제적 종속성 핵심 판례
        </div>
        <h1 className="mb-2 mt-4 font-bold" style={{ fontSize: 'var(--text-2xl)', color: 'var(--grey-900)' }}>
          노란봉투법 핵심판례 6선
        </h1>
        <p className="max-w-[760px] text-sm leading-7 md:text-[15px]" style={{ color: 'var(--grey-500)' }}>
          개정 노동조합법의 사용자성 판단과 원하청 교섭 의무는 갑자기 생긴 개념이 아니라, 대법원과 행정법원이 축적해 온 판례 법리 위에 서 있습니다.
          먼저 각 판결의 쟁점과 한 줄 요지를 훑어보고, 이어서 상세 해설과 유사 판례 검색으로 넓혀가면 실무 판단 속도가 빨라집니다.
        </p>
      </section>

      <section className="mt-8 grid gap-4">
        {keyCases.map((c) => (
          <article key={c.id} className="rounded-2xl border p-5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'white' }}>
            <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--grey-400)' }}>
              <span className="rounded-full px-2 py-0.5 font-medium" style={{ backgroundColor: 'var(--color-accent-light)', color: 'var(--color-accent)' }}>
                {c.issue}
              </span>
              <span>{c.court}</span>
              <span>{c.caseNumber}</span>
              <span>{c.date}</span>
            </div>
            <h2 className="mt-2 text-lg font-semibold" style={{ color: 'var(--grey-900)' }}>{c.title}</h2>
            <p className="mt-1 text-sm font-medium" style={{ color: 'var(--color-accent)' }}>{c.significance}</p>
            <p className="mt-3 text-sm leading-7" style={{ color: 'var(--grey-700)' }}>{c.keyHolding}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href={`/database?q=${encodeURIComponent(c.databaseQuery)}`}
                className="inline-flex items-center gap-1 text-sm font-medium"
                style={{ color: 'var(--color-accent)' }}
              >
                유사 판례 검색 <ArrowRight size={14} />
              </Link>
            </div>
          </article>
        ))}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-bold" style={{ color: 'var(--grey-900)' }}>상세 해설 보기</h2>
        <p className="mb-4 mt-1 text-sm" style={{ color: 'var(--grey-500)' }}>
          각 판례를 열어 핵심 판시, 개정법과의 연결, 실무 시사점을 한 번에 확인할 수 있습니다.
        </p>
        <CasesClient />
      </section>
    </div>
  );
}
