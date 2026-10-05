import { publicMetadata } from '@/lib/public-metadata';
import WorkRulesClient from './WorkRulesClient';
import '../../laws/laws.css';

export const metadata = publicMetadata({ title: '취업규칙 점검', description: '취업규칙 텍스트를 입력해 법령 개정 관련 항목을 확인합니다. 법령 검수 전 참고 자료입니다.' });
export default function WorkRulesPage() { return <WorkRulesClient />; }
