import { publicMetadata } from '@/lib/public-metadata';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_URL } from '@/lib/constants';
import ContractWriteClient from './ContractWriteClient';

const DESCRIPTION =
  '월 임금 총액(또는 실수령액)이나 시간당 지급액과 근무형태를 넣으면 기본급·주휴·연장·야간·휴일·연차 항목별 시간과 금액을 나누고, 근로계약서를 엑셀·한글·PDF로 만듭니다. 입력한 내용은 브라우저 안에서만 계산하고 서버로 보내지 않습니다.';

export const metadata: Metadata = publicMetadata({
  title: '근로계약서 작성 | 임금 구성·엑셀·한글·PDF',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/tools/contract-write` },
  openGraph: {
    title: '근로계약서 작성 | 임금 구성·엑셀·한글·PDF',
    description: DESCRIPTION,
    url: `${SITE_URL}/tools/contract-write`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
});

export default function ContractWritePage() {
  return (
    <div className="layout-tool layout-tool--compact">
      <div className="mb-6">
        <Link href="/tools" className="text-sm text-[var(--grey-700)] hover:text-[var(--color-text-primary)]">
          ← 노무 계산기
        </Link>
      </div>
      <h1 className="t-h2 mb-2" style={{ color: 'var(--color-text-primary)' }}>
        근로계약서 작성
      </h1>
      <p className="mb-6 text-sm leading-relaxed" style={{ color: 'var(--grey-500)' }}>
        월 임금 총액(또는 실수령액)이나 시간당 지급액과 근무형태를 넣으면 항목별 시간과 금액을 나누고, 만든 계약서를 근로계약서 점검 규칙으로 다시 확인한 뒤
        엑셀·한글·PDF로 내려받습니다.
      </p>

      <ContractWriteClient />

      <p className="mt-6 text-xs" style={{ color: 'var(--grey-700)' }}>
        본 도구는 참고용이며 법률 판단이 아닙니다. 계약서를 쓰기 전에 근거 조문을 함께 확인하세요.
      </p>
    </div>
  );
}
