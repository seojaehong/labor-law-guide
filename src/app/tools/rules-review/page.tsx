import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import RulesReviewClient from './RulesReviewClient';
import './rules-review.css';

const TITLE = '규정 정비 점검 | 기관 제규정 인용·위임·별표·용어 대조와 신·구조문대비표';
const DESC = '기관 규정 묶음(zip)을 올리면 규정끼리 인용·위임·별표·조문 번호·용어를 맞춰 보고, 담당자가 확인한 항목으로 신·구조문대비표와 개정안 반영본을 만듭니다. 파일은 브라우저 안에서만 읽습니다.';

export const metadata: Metadata = publicMetadata({
  title: TITLE,
  description: DESC,
  alternates: { canonical: `${SITE_URL}/tools/rules-review` },
  openGraph: { title: TITLE, description: DESC, url: `${SITE_URL}/tools/rules-review`, type: 'website', locale: 'ko_KR' },
});

export default function RulesReviewPage() {
  return <RulesReviewClient />;
}
