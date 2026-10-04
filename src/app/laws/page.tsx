import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/constants';
import type { LawIndex } from '@/lib/laws/format';
import LawsClient from './LawsClient';
import './laws.css';

export const metadata: Metadata = {
  title: '노동법 개정 알림, 곧 시행되는 개정과 조문 비교 | 노란봉투법 가이드',
  description:
    '근로기준법·남녀고용평등법·산업안전보건법 등 노동관계법령 37개 법률의 개정을 시행일 순으로. 바뀐 조문을 개정 전·후로 비교하고, 신구대조표 복사·엑셀·캘린더 등록과 취업규칙 반영 문안까지 한 화면에서.',
  alternates: { canonical: `${SITE_URL}/laws` },
  openGraph: {
    title: '노동법 개정 알림 | 노란봉투법 가이드',
    description: '곧 바뀌는 노동법을 조문 단위로. 신구대조·캘린더·취업규칙 반영 문안',
    url: `${SITE_URL}/laws`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
};

export default function LawsPage() {
  // 빌드 시점에 읽어 정적으로 굳힌다. 시행예정 여부·D-day 는 화면에서 오늘(KST) 기준으로 계산한다
  const index = JSON.parse(
    readFileSync(path.join(process.cwd(), 'public', 'data', 'laws', 'index.json'), 'utf-8'),
  ) as LawIndex;
  return <LawsClient index={index} />;
}
