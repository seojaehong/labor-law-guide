import type { Metadata } from 'next';
import Link from 'next/link';
import ContactForm from '@/components/ContactForm';
import { Mail, MapPin, ExternalLink, FileText, ClipboardCheck, Scale } from 'lucide-react';
import { SITE_URL } from '@/lib/constants';

const CONTACT_URL = `${SITE_URL}/contact`;
const DESCRIPTION = '부당해고, 임금체불, 직장내괴롭힘, 노란봉투법, 4대보험까지 — 노무법인 위너스에 온라인으로 노무 상담을 접수하세요. 공인노무사가 직접 검토합니다.';

export const metadata: Metadata = {
  title: '노무 상담 문의 | 부당해고·임금체불·괴롭힘·노란봉투법 | 노무법인 위너스',
  description: DESCRIPTION,
  alternates: { canonical: CONTACT_URL },
  openGraph: {
    title: '노무법인 위너스 종합 상담 문의',
    description: DESCRIPTION,
    type: 'website',
    url: CONTACT_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: '노무법인 위너스 종합 상담 문의',
    description: DESCRIPTION,
  },
};

const quickLinks = [
  {
    href: '/guide',
    label: '핵심 가이드 보기',
    description: '사용자 범위 확대와 쟁점 구조를 먼저 정리합니다.',
    icon: FileText,
  },
  {
    href: '/checklist',
    label: '자가진단 체크리스트',
    description: '우리 사업장에 교섭 의무 가능성이 있는지 빠르게 점검합니다.',
    icon: ClipboardCheck,
  },
  {
    href: '/manual',
    label: '교섭절차 가이드',
    description: '교섭요구 공고부터 단체교섭까지 절차를 단계별로 봅니다.',
    icon: Scale,
  },
];

const contactFaqItems = [
  {
    question: '어떤 상담을 받을 수 있나요?',
    answer: '부당해고·징계, 임금체불·퇴직금, 직장내괴롭힘·성희롱, 노란봉투법(원청 교섭), 4대보험, 고용지원금 등 노동법 전반에 걸친 상담이 가능합니다. 문의 유형을 선택해 주시면 담당 노무사가 배정됩니다.',
  },
  {
    question: '문의 폼에는 어떤 내용을 적으면 좋나요?',
    answer: '회사명, 근로자/사업주 입장, 현재 쟁점(해고·임금·괴롭힘·교섭 등), 급한 일정이 있으면 함께 적어 주세요. 구체적일수록 첫 회신이 빨라집니다.',
  },
  {
    question: '상담 비용이 있나요?',
    answer: '초기 문의 접수와 간단한 방향 안내는 무료입니다. 사건 수임이나 서면 검토가 필요한 경우 별도 안내드립니다.',
  },
  {
    question: '얼마나 빨리 회신 받을 수 있나요?',
    answer: '영업일 기준 1일 이내 1차 회신을 드립니다. 긴급한 일정(노동위원회 출석, 해고 통보 등)이 있으면 폼에 꼭 적어 주세요.',
  },
] as const;

const contactJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'ContactPage',
      '@id': `${CONTACT_URL}/#webpage`,
      url: CONTACT_URL,
      name: '노무법인 위너스 종합 상담 문의',
      description: DESCRIPTION,
      isPartOf: { '@id': `${SITE_URL}/#website` },
      about: {
        '@type': 'Service',
        name: '노무법인 위너스 노동법 종합 상담',
        serviceType: '부당해고·임금체불·괴롭힘·노란봉투법·4대보험 자문',
        provider: { '@id': `${SITE_URL}/#organization` },
        areaServed: { '@type': 'Country', name: 'KR' },
        availableChannel: {
          '@type': 'ServiceChannel',
          serviceUrl: CONTACT_URL,
        },
      },
      breadcrumb: { '@id': `${CONTACT_URL}/#breadcrumb` },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${CONTACT_URL}/#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '홈', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: '노무법인 위너스 종합 상담 문의', item: CONTACT_URL },
      ],
    },
    {
      '@type': 'FAQPage',
      '@id': `${CONTACT_URL}/#faq`,
      mainEntity: contactFaqItems.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer,
        },
      })),
    },
  ],
};

export default function ContactPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(contactJsonLd) }} />
      <div className="mx-auto max-w-[980px] px-5 py-10">
        <h1 className="mb-2 font-bold" style={{ fontSize: 'var(--text-2xl)', color: 'var(--grey-900)' }}>
          노무법인 위너스 종합 상담 문의
        </h1>
        <p className="mb-10 max-w-[760px] text-sm leading-6" style={{ color: 'var(--grey-500)' }}>
          부당해고·징계, 임금체불·퇴직금, 직장내괴롭힘·성희롱, 노란봉투법(원청 교섭), 4대보험, 고용지원금까지 — 노동법 전반에 걸친 상담을 접수할 수 있습니다.
          회사명, 현재 쟁점, 급한 일정이 있으면 함께 적어 주세요. 공인노무사가 직접 검토합니다.
        </p>

        <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
          <div className="space-y-8">
            <div className="rounded-2xl border p-6" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold" style={{ color: 'var(--grey-900)' }}>온라인 상담 접수</h2>
                  <p className="mt-1 text-sm" style={{ color: 'var(--grey-500)' }}>
                    회사명, 현재 쟁점, 교섭요구 여부, 일정 급박성까지 적어주시면 분류가 빨라집니다.
                  </p>
                </div>
                <span className="rounded-full px-3 py-1 text-xs font-medium" style={{ backgroundColor: 'var(--blue-50)', color: 'var(--blue-700)' }}>
                  접수 폼
                </span>
              </div>
              <ContactForm />
            </div>

            <section className="rounded-2xl border p-6" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
              <h2 className="mb-3 text-lg font-bold" style={{ color: 'var(--grey-900)' }}>이런 경우 바로 문의하는 편이 좋습니다</h2>
              <ul className="space-y-2 text-sm leading-6" style={{ color: 'var(--grey-600)' }}>
                <li>• 해고·징계 통보를 받았거나 예고 없이 퇴사 처리된 경우</li>
                <li>• 퇴직금·연장수당·주휴수당 등 임금이 체불되고 있는 경우</li>
                <li>• 직장내괴롭힘·성희롱 피해를 입었거나 사내 조사가 진행 중인 경우</li>
                <li>• 하청 노조가 원청에 교섭을 요구해 노란봉투법 대응이 필요한 경우</li>
                <li>• 4대보험 취득·상실, 고용지원금 신청을 검토하고 있는 경우</li>
              </ul>
            </section>

            <section className="rounded-2xl border p-6" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
              <h2 className="mb-3 text-lg font-bold" style={{ color: 'var(--grey-900)' }}>상담 전 많이 묻는 질문</h2>
              <div className="space-y-4">
                {contactFaqItems.map((item) => (
                  <div key={item.question} className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
                    <h3 className="text-sm font-bold leading-6" style={{ color: 'var(--grey-900)' }}>{item.question}</h3>
                    <p className="mt-2 text-sm leading-6" style={{ color: 'var(--grey-600)' }}>{item.answer}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border p-6" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
              <h2 className="mb-4 text-lg font-bold" style={{ color: 'var(--grey-900)' }}>먼저 읽어보면 상담이 빨라지는 자료</h2>
              <div className="grid gap-3 md:grid-cols-3">
                {quickLinks.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="rounded-xl border p-4 transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--grey-50)]"
                      style={{ borderColor: 'var(--color-border)' }}
                    >
                      <Icon size={18} style={{ color: 'var(--color-accent)' }} />
                      <p className="mt-3 text-sm font-bold" style={{ color: 'var(--grey-900)' }}>{item.label}</p>
                      <p className="mt-1 text-xs leading-5" style={{ color: 'var(--grey-500)' }}>{item.description}</p>
                    </Link>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border p-6" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
              <h2 className="mb-4 font-bold" style={{ color: 'var(--grey-900)' }}>접수 안내</h2>
              <div className="space-y-4 text-sm" style={{ color: 'var(--grey-600)' }}>
                <div className="flex gap-3">
                  <Mail size={18} style={{ color: 'var(--color-accent)' }} />
                  <div>
                    <p className="font-medium" style={{ color: 'var(--grey-800)' }}>상담 접수 방식</p>
                    <p>이 페이지의 문의 폼으로 내용을 남겨 주세요.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <MapPin size={18} style={{ color: 'var(--color-accent)' }} />
                  <div>
                    <p className="font-medium" style={{ color: 'var(--grey-800)' }}>주소</p>
                    <p>서울시 서초구 나루터로 61, 402호(태승빌딩)</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <ExternalLink size={18} style={{ color: 'var(--color-accent)' }} />
                  <div>
                    <p className="font-medium" style={{ color: 'var(--grey-800)' }}>공식 홈페이지</p>
                    <a href="https://winhr.co.kr" target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: 'var(--color-accent)' }}>winhr.co.kr</a>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl p-6" style={{ backgroundColor: 'var(--blue-50)' }}>
              <h2 className="mb-2 text-sm font-bold" style={{ color: 'var(--blue-700)' }}>상담 메모에 같이 남기면 좋은 정보</h2>
              <ul className="space-y-1.5 text-sm" style={{ color: 'var(--blue-600)' }}>
                <li>• 근로자 / 사업주 중 어느 입장인지</li>
                <li>• 현재 쟁점 (해고·임금·괴롭힘·교섭·보험 등)</li>
                <li>• 회사 규모와 근속 기간</li>
                <li>• 검토가 급한 날짜나 예정된 일정이 있는지</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
