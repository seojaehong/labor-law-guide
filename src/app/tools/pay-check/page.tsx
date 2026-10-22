import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import PayCheckClient from './PayCheckClient';
import './pay-check.css';

const TITLE = '월급 대조 | 중도입사·중도퇴사·결근 공제·주휴수당 명세서 금액 대조';
const DESC = '예외 하나를 고르고 확인한 값과 회사 문서에 적힌 계산 기준을 넣으면 명세서 금액과 대조하고, 기준이 없으면 회사에 물어볼 문장을 정리합니다. 입력값은 브라우저 안에서만 계산합니다.';

export const metadata: Metadata = publicMetadata({
  title: TITLE,
  description: DESC,
  alternates: { canonical: `${SITE_URL}/tools/pay-check` },
  openGraph: { title: TITLE, description: DESC, url: `${SITE_URL}/tools/pay-check`, type: 'website', locale: 'ko_KR' },
});

export default function PayCheckPage() {
  return <PayCheckClient />;
}
