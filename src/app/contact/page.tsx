import type { Metadata } from 'next';
import Link from 'next/link';
import ContactForm from '@/components/ContactForm';
import { Mail, MapPin, ExternalLink, FileText, ClipboardCheck, Scale } from 'lucide-react';
import { SITE_URL } from '@/lib/constants';

const CONTACT_URL = `${SITE_URL}/contact`;
const DESCRIPTION = '노란봉투법 전문가 상담 문의 페이지. 사용자성 판단, 원청 교섭 의무, 하도급·공공기관 교섭 대응, 부당노동행위 리스크 점검을 노무법인 위너스에 온라인으로 접수하세요.';

export const metadata: Metadata = {
  title: '노란봉투법 전문가 상담 문의 | 사용자성·교섭 대응·하도급 자문',
  description: DESCRIPTION,
  alternates: { canonical: CONTACT_URL },
  openGraph: {
    title: '노란봉투법 전문가 상담 문의',
    description: DESCRIPTION,
    type: 'website',
    url: CONTACT_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: '노란봉투법 전문가 상담 문의',
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

const contactJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'ContactPage',
      '@id': `${CONTACT_URL}/#webpage`,
      url: CONTACT_URL,
      name: '노란봉투법 전문가 상담 문의',
      description: DESCRIPTION,
      isPartOf: { '@id': `${SITE_URL}/#website` },
      about: {
        '@type': 'Service',
        name: '노란봉투법 전문가 상담',
        serviceType: '노란봉투법 사용자성 판단 및 교섭 대응 자문',
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
        { '@type': 'ListItem', position: 2, name: '노란봉투법 전문가 상담 문의', item: CONTACT_URL },
      ],
    },
  ],
};

export default function ContactPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(contactJsonLd) }} />
      <div className="mx-auto max-w-[980px] px-5 py-10">
      <h1 className="mb-2 font-bold" style={{ fontSize: 'var(--text-2xl)', color: 'var(--grey-900)' }}>
        노란봉투법 전문가 상담 문의
      </h1>
      <p className="mb-10 max-w-[760px] text-sm leading-6" style={{ color: 'var(--grey-500)' }}>
        원청 사용자성 판단, 하청 노조 교섭요구 대응, 교섭창구 단일화, 노동위원회 절차, 부당노동행위 리스크 점검이 필요하면 아래 폼으로 내용을 남겨 주세요.
        노무법인 위너스가 확인 후 순차적으로 검토합니다.
      </p>

      <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
        <div className="space-y-8">
          <div className="rounded-2xl border p-6" style={{ borderColor: 'var(--color-border)', backgroundColor: 'white' }}>
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
              <li>• 하청 노동조합이 원청 또는 발주처에 직접 교섭을 요구한 경우</li>
              <li>• 우리 회사가 개정 노조법상 사용자에 해당하는지 애매한 경우</li>
              <li>• 교섭요구 공고, 교섭대표노조 확정, 교섭단위 분리 대응이 필요한 경우</li>
              <li>• 부당노동행위, 손해배상, 파견·도급 구조 리스크를 함께 봐야 하는 경우</li>
            </ul>
          </section>

          <section className="rounded-2xl border p-6" style={{ borderColor: 'var(--color-border)', backgroundColor: 'white' }}>
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
              <li>• 원청/하청/발주처 중 어느 위치인지</li>
              <li>• 교섭요구서 또는 노조 연락을 이미 받았는지</li>
              <li>• 쟁점이 사용자성, 교섭절차, 손해배상, 도급·파견 중 무엇인지</li>
              <li>• 검토가 급한 날짜나 예정된 회의 일정이 있는지</li>
            </ul>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
