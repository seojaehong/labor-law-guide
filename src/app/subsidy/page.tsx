import type { Metadata } from 'next';
import Link from 'next/link';
import { ExternalLink, BadgeCheck, BookOpen, MessageSquare } from 'lucide-react';
import { SITE_URL } from '@/lib/constants';

const SUBSIDY_URL = `${SITE_URL}/subsidy`;
const EXTERNAL_GUIDE_URL = 'https://reporeview.vercel.app/';
const DESCRIPTION = '고용지원금 종류·신청 요건·절차를 한눈에 확인하세요. 두루누리, 일자리안정자금, 고용촉진장려금 등 우리 사업장에 맞는 지원금을 찾아드립니다.';

export const metadata: Metadata = {
  title: '고용지원금 가이드 | 두루누리·일자리안정자금·고용촉진장려금 | 노무법인 위너스',
  description: DESCRIPTION,
  alternates: { canonical: SUBSIDY_URL },
  openGraph: {
    title: '고용지원금 가이드 — 노무법인 위너스',
    description: DESCRIPTION,
    type: 'website',
    url: SUBSIDY_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: '고용지원금 가이드 — 노무법인 위너스',
    description: DESCRIPTION,
  },
};

const subsidyJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      '@id': `${SUBSIDY_URL}/#webpage`,
      url: SUBSIDY_URL,
      name: '고용지원금 가이드',
      description: DESCRIPTION,
      isPartOf: { '@id': `${SITE_URL}/#website` },
      breadcrumb: { '@id': `${SUBSIDY_URL}/#breadcrumb` },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${SUBSIDY_URL}/#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '홈', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: '고용지원금 가이드', item: SUBSIDY_URL },
      ],
    },
  ],
};

const highlights = [
  { icon: BadgeCheck, title: '두루누리 사회보험료 지원', desc: '10인 미만 사업장, 월 260만원 미만 근로자 보험료 80% 지원' },
  { icon: BadgeCheck, title: '일자리안정자금', desc: '30인 미만 사업장, 최저임금 120% 이하 근로자 1인당 월 최대 13만원' },
  { icon: BadgeCheck, title: '고용촉진장려금', desc: '취업 취약계층 고용 시 최대 1년간 월 60만원 지원' },
];

export default function SubsidyPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(subsidyJsonLd) }} />
      <div className="mx-auto max-w-[980px] px-5 py-10">
        <h1 className="mb-2 font-bold" style={{ fontSize: 'var(--text-2xl)', color: 'var(--grey-900)' }}>
          고용지원금 가이드
        </h1>
        <p className="mb-10 max-w-[760px] text-sm leading-6" style={{ color: 'var(--grey-500)' }}>
          우리 사업장에서 받을 수 있는 고용지원금을 한눈에 확인하고, 노무사에게 신청 절차까지 맡기세요.
        </p>

        <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
          <div className="space-y-8">
            <section className="rounded-2xl border p-6" style={{ borderColor: 'var(--color-border)', backgroundColor: 'white' }}>
              <h2 className="mb-4 text-lg font-bold" style={{ color: 'var(--grey-900)' }}>주요 지원금 한눈에 보기</h2>
              <div className="space-y-4">
                {highlights.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="flex gap-4 rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
                      <Icon size={20} className="mt-0.5 shrink-0" style={{ color: 'var(--color-accent)' }} />
                      <div>
                        <h3 className="text-sm font-bold" style={{ color: 'var(--grey-900)' }}>{item.title}</h3>
                        <p className="mt-1 text-sm leading-6" style={{ color: 'var(--grey-600)' }}>{item.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <a
              href={EXTERNAL_GUIDE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-sm font-bold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--color-accent)' }}
            >
              <BookOpen size={18} />
              고용지원금 상세 가이드 보기
              <ExternalLink size={14} />
            </a>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border p-6" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
              <h2 className="mb-3 font-bold" style={{ color: 'var(--grey-900)' }}>신청이 어려우신가요?</h2>
              <p className="text-sm leading-6" style={{ color: 'var(--grey-600)' }}>
                요건 판단부터 서류 작성, 신청 대행까지 노무법인 위너스가 도와드립니다. 아래 버튼으로 상담을 접수해 주세요.
              </p>
              <Link
                href="/contact"
                className="mt-4 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: 'var(--color-accent)' }}
              >
                <MessageSquare size={16} />
                노무 상담 접수하기
              </Link>
            </div>

            <div className="rounded-2xl p-6" style={{ backgroundColor: 'var(--blue-50)' }}>
              <h2 className="mb-2 text-sm font-bold" style={{ color: 'var(--blue-700)' }}>이런 사업장이라면 꼭 확인하세요</h2>
              <ul className="space-y-1.5 text-sm" style={{ color: 'var(--blue-600)' }}>
                <li>• 직원 수 30인 미만 사업장</li>
                <li>• 최저임금 인상으로 인건비 부담이 큰 경우</li>
                <li>• 신규 채용 또는 육아휴직 복귀 계획이 있는 경우</li>
                <li>• 4대보험 가입을 미루고 있는 경우</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
