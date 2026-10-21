import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import ExitClient from './ExitClient';
import './exit.css';

const TITLE = '퇴사 점검표 | 금품 청산 14일·4대보험 상실 신고·실업급여·퇴직금 요건';
const DESC = '마지막 근무일을 넣으면 퇴사 전 연차·사직서 확인부터 14일 안 금품 청산, 4대보험 상실 신고 기한, 이직확인서, 실업급여 수급기간까지 날짜순으로 정리합니다. 퇴직금 요건과 확인용 추정 금액도 함께 보여줍니다.';

export const metadata: Metadata = publicMetadata({
  title: TITLE,
  description: DESC,
  alternates: { canonical: `${SITE_URL}/exit` },
  openGraph: { title: TITLE, description: DESC, url: `${SITE_URL}/exit`, type: 'website', locale: 'ko_KR' },
});

export default function ExitPage() {
  return <ExitClient />;
}
