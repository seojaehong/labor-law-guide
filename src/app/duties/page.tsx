import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import DutiesClient from './DutiesClient';
import './duties.css';

const TITLE = '사업장 규모별 사업주 의무 | 5인 미만·5인 이상 법정 의무교육·근로계약서·퇴직금';
const DESC = '상시 근로자 수(5인 미만·5인 이상·10인·30인·50인)를 고르면 지켜야 할 노동법 의무와 법정 의무교육(성희롱 예방·장애인 인식개선·산업안전), 위반 시 제재를 조문 기준으로 보여줍니다.';

export const metadata: Metadata = publicMetadata({
  title: TITLE,
  description: DESC,
  alternates: { canonical: `${SITE_URL}/duties` },
  openGraph: { title: TITLE, description: DESC, url: `${SITE_URL}/duties`, type: 'website', locale: 'ko_KR' },
});

export default function DutiesPage() {
  return <DutiesClient />;
}
