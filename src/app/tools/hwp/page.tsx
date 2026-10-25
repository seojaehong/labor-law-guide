import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import HwpToolClient from './HwpToolClient';
import './hwp-tool.css';

const TITLE = '한글 문서 열기·고치기 | hwp·hwpx 브라우저에서 보기, 찾아 바꾸기, 저장';
const DESC = '한글 프로그램 없이 hwp·hwpx 파일을 브라우저에서 열어 쪽 모양으로 보고, 글자를 찾아 바꾼 뒤 hwp 또는 hwpx 로 내려받습니다.';

export const metadata: Metadata = publicMetadata({
  title: TITLE,
  description: DESC,
  alternates: { canonical: `${SITE_URL}/tools/hwp` },
  openGraph: { title: TITLE, description: DESC, url: `${SITE_URL}/tools/hwp`, type: 'website', locale: 'ko_KR' },
});

export default function HwpToolPage() {
  return <HwpToolClient />;
}
