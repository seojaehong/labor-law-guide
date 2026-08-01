import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_URL } from '@/lib/constants';
import ContractCheckClient from './ContractCheckClient';

export const metadata: Metadata = {
  title: '근로계약서 자가진단 | 무료 점검 25항목',
  description:
    '내 근로계약서, 법대로 쓰였을까? 최저임금·주52시간·필수 명시사항·위약금 등 25개 법정 항목을 브라우저에서 바로 점검합니다. 입력 내용은 서버로 전송되지 않습니다.',
  alternates: { canonical: `${SITE_URL}/tools/contract-check` },
  openGraph: {
    title: '근로계약서 자가진단 | 무료 점검 25항목',
    description:
      '최저임금·주52시간·필수 명시사항·위약금 등 25개 법정 항목을 브라우저에서 바로 점검. 서버 전송 없음.',
    url: `${SITE_URL}/tools/contract-check`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
};

export default function ContractCheckPage() {
  return (
    <div className="mx-auto max-w-[820px] px-5 py-10">
      <div className="mb-6">
        <Link href="/tools" className="text-sm text-[var(--grey-700)] hover:text-[var(--color-text-primary)]">
          ← 노무 계산기
        </Link>
      </div>
      <h1 className="mb-2 font-bold" style={{ fontSize: 'var(--text-2xl)', color: 'var(--grey-900)' }}>
        근로계약서 자가진단
      </h1>
      <p className="mb-6 text-sm leading-relaxed" style={{ color: 'var(--grey-500)' }}>
        계약서 내용을 단계별로 입력하면 최저임금, 주 52시간, 필수 명시사항, 위약금 금지 등
        25개 법정 항목을 자동으로 점검합니다. 모르는 항목은 건너뛰어도 됩니다.
      </p>

      <ContractCheckClient />

      {/* §3.2 규율 2 — 페이지 바탕 위 --text-xs는 --grey-700이다(tertiary 2.01:1·secondary 4.42:1 모두 미달) */}
      <p className="mt-6 text-xs" style={{ color: 'var(--grey-700)' }}>
        본 도구는 참고용 간이 점검이며 법률자문이 아닙니다. 실제 분쟁·계약서 수정은 노무사 상담을 권장합니다.
      </p>
    </div>
  );
}
