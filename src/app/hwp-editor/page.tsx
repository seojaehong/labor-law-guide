import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import HwpEditorClient from './HwpEditorClient';
import './hwp-editor.css';

const TITLE = '한글 문서 편집기 | hwp·hwpx 를 브라우저에서 고치고 저장';
const DESC = '한글 프로그램 없이 hwp·hwpx 문서를 브라우저에서 열어 쪽 모양 그대로 글자를 고치고 hwpx 또는 hwp 로 내려받습니다. 파일은 이 브라우저 안에서만 다룹니다.';

export const metadata: Metadata = publicMetadata({
  title: TITLE,
  description: DESC,
  alternates: { canonical: `${SITE_URL}/hwp-editor` },
  openGraph: { title: TITLE, description: DESC, url: `${SITE_URL}/hwp-editor`, type: 'website', locale: 'ko_KR' },
});

export default function HwpEditorPage() {
  return <HwpEditorClient />;
}
