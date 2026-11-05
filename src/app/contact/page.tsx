import { publicMetadata } from '@/lib/public-metadata';
import type { Metadata } from 'next';
import ContactForm from '@/components/ContactForm';
import { Mail } from 'lucide-react';
import { SITE_URL, BRAND_NAME } from '@/lib/constants';
import { CONTACT_EMAIL } from '@/lib/site-contact';

// 261105 — 이 페이지는 「서비스 문의」(오류 제보·기능 제안·제휴) 창구다. 개별 사안 접수 창구가 아니다.
const CONTACT_URL = `${SITE_URL}/contact`;
const DESCRIPTION = `${BRAND_NAME} 서비스 문의 창구입니다. 오류 제보, 기능 제안, 제휴 문의를 남겨 주세요. 구체적인 노동 사안은 고용노동부(1350)·노동위원회 등 공공 창구를 이용해 주세요.`;

export const metadata: Metadata = publicMetadata({
  title: `서비스 문의 | 오류 제보·기능 제안·제휴 | ${BRAND_NAME}`,
  description: DESCRIPTION,
  alternates: { canonical: CONTACT_URL },
  openGraph: {
    title: `${BRAND_NAME} 서비스 문의`,
    description: DESCRIPTION,
    type: 'website',
    url: CONTACT_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${BRAND_NAME} 서비스 문의`,
    description: DESCRIPTION,
  },
});

const contactFaqItems = [
  {
    question: '개별 노동 사건도 물어볼 수 있나요?',
    answer: '이 창구는 서비스 오류 제보, 기능 제안, 제휴 문의만 받습니다. 해고·임금·괴롭힘 같은 구체적인 사안은 고용노동부(1350)·노동위원회 등 공공 창구를 이용해 주세요.',
  },
  {
    question: '오류를 제보할 때 무엇을 적으면 좋나요?',
    answer: '문제가 생긴 페이지 주소, 입력한 값, 화면에 나온 결과와 기대한 결과를 적어 주세요. 사용한 기기와 브라우저를 함께 적어 주시면 확인이 빨라집니다.',
  },
  {
    question: '회신을 받을 수 있나요?',
    answer: '이메일을 남겨 주시면 접수 확인 메일이 자동으로 발송됩니다. 내용 확인이 더 필요하면 그 주소로 연락드립니다.',
  },
  {
    question: '이메일로 직접 보내도 되나요?',
    answer: `네. ${CONTACT_EMAIL} 로 보내셔도 됩니다.`,
  },
] as const;

const contactJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'ContactPage',
      '@id': `${CONTACT_URL}/#webpage`,
      url: CONTACT_URL,
      name: `${BRAND_NAME} 서비스 문의`,
      description: DESCRIPTION,
      isPartOf: { '@id': `${SITE_URL}/#website` },
      breadcrumb: { '@id': `${CONTACT_URL}/#breadcrumb` },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${CONTACT_URL}/#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '홈', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: '서비스 문의', item: CONTACT_URL },
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
      <div className="layout-tool editorial-tool">
        <header className="editorial-tool-header">
        <h1 className="t-h2 mb-2" style={{ color: 'var(--color-text-primary)' }}>
          서비스 문의
        </h1>
        <p className="mb-10 max-w-[var(--reading-measure)] text-sm leading-6" style={{ color: 'var(--grey-700)' }}>
          {BRAND_NAME}를 쓰다가 발견한 오류, 있었으면 하는 기능, 제휴 제안을 남겨 주세요.
          구체적인 노동 사안은 고용노동부(1350)·노동위원회 등 공공 창구를 이용해 주세요.
        </p>
      </header>

        <div className="tool-layout">
          <div className="space-y-8">
            <div className="rounded-md border p-6" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="t-h4" style={{ color: 'var(--color-text-primary)' }}>문의 접수</h2>
                  <p className="mt-1 text-sm" style={{ color: 'var(--grey-700)' }}>
                    문제가 생긴 페이지 주소와 상황을 함께 적어 주시면 확인이 빨라집니다.
                  </p>
                </div>
                <span className="rounded-full px-3 py-1 text-xs font-medium" style={{ backgroundColor: 'var(--grey-100)', color: 'var(--color-text-primary)' }}>
                  접수 폼
                </span>
              </div>
              <ContactForm />
            </div>

            <section className="rounded-md border p-6" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
              <h2 className="t-h4 mb-3" style={{ color: 'var(--color-text-primary)' }}>이런 내용을 보내 주세요</h2>
              <ul className="space-y-2 text-sm leading-6" style={{ color: 'var(--grey-700)' }}>
                <li>• 계산 결과나 화면 표시가 이상한 경우</li>
                <li>• 법령·판례 원문 링크가 끊겼거나 개정 전 내용이 보이는 경우</li>
                <li>• 있었으면 하는 기능이나 자료</li>
                <li>• 제휴·자료 제공 제안</li>
              </ul>
            </section>

            <section className="rounded-md border p-6" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
              <h2 className="t-h4 mb-3" style={{ color: 'var(--color-text-primary)' }}>자주 묻는 질문</h2>
              <div className="space-y-4">
                {contactFaqItems.map((item) => (
                  <div key={item.question} className="rounded-md border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
                    <h3 className="text-sm font-bold leading-6" style={{ color: 'var(--color-text-primary)' }}>{item.question}</h3>
                    <p className="mt-2 text-sm leading-6" style={{ color: 'var(--grey-700)' }}>{item.answer}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <div className="rounded-md border p-6" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
              <h2 className="mb-4 font-bold" style={{ color: 'var(--color-text-primary)' }}>접수 안내</h2>
              <div className="space-y-4 text-sm" style={{ color: 'var(--grey-700)' }}>
                <div className="flex gap-3">
                  <Mail size={18} style={{ color: 'var(--color-accent-ink)' }} />
                  <div>
                    <p className="font-medium" style={{ color: 'var(--grey-800)' }}>이메일</p>
                    <p>이 페이지의 문의 폼이나 이메일로 보내 주세요.</p>
                    {/* §6.8 — 본문 안의 단독 링크라 상시 밑줄 + --color-accent-ink. */}
                    <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-[0.2em] decoration-1" style={{ color: 'var(--color-accent-ink)' }}>{CONTACT_EMAIL}</a>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-md p-6" style={{ backgroundColor: 'var(--grey-100)' }}>
              <h2 className="mb-2 text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>문의에 같이 적으면 좋은 정보</h2>
              <ul className="space-y-1.5 text-sm" style={{ color: 'var(--grey-700)' }}>
                <li>• 문제가 생긴 페이지 주소</li>
                <li>• 입력한 값과 화면에 나온 결과</li>
                <li>• 사용한 기기와 브라우저</li>
                <li>• 제휴 문의라면 기관·회사명과 연락 방법</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
