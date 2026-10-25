import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import ExitEmployerClient from './ExitEmployerClient';
import './exit-employer.css';

const TITLE = '직원 퇴사 처리 점검 | 퇴직금 14일·4대보험 상실신고·이직확인서 기한';
const DESC = '마지막 근무일·입사일·사업장 규모·퇴사 사유를 고르면 금품 청산 14일, 4대보험 상실 신고, 이직확인서, 원천징수영수증, 서류 보존까지 날짜순 점검표를 조문 기준으로 보여줍니다.';

export const metadata: Metadata = publicMetadata({
  title: TITLE,
  description: DESC,
  alternates: { canonical: `${SITE_URL}/exit-employer` },
  openGraph: { title: TITLE, description: DESC, url: `${SITE_URL}/exit-employer`, type: 'website', locale: 'ko_KR' },
});

export default function ExitEmployerPage() {
  return <ExitEmployerClient />;
}
