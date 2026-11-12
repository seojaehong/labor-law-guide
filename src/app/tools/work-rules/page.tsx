import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import WorkRulesClient from './WorkRulesClient';
import '../../laws/laws.css';

// 261112 — alternates 가 없어 루트의 홈 canonical 을 물려받고 있었다(운영 실측: canonical = https://yellowenvelope.kr).
export const metadata = publicMetadata({
  title: '취업규칙 점검',
  description: '취업규칙 텍스트를 입력해 법령 개정 관련 항목을 확인합니다. 법령 검수 전 참고 자료입니다.',
  alternates: { canonical: `${SITE_URL}/tools/work-rules` },
});
export default function WorkRulesPage() { return <WorkRulesClient />; }
