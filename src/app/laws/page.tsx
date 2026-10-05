import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/constants';
import { fmtDate, type LawIndex } from '@/lib/laws/format';
import LawsClient from './LawsClient';
import './laws.css';

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ event?: string }> }): Promise<Metadata> {
  const index = JSON.parse(readFileSync(path.join(process.cwd(), 'public/data/laws/index.json'), 'utf8')) as LawIndex;
  const { event: eventId } = await searchParams;
  const event = index.events.find(e => e.id === eventId);
  const title = event ? event.headline || event.law : '달라지는 일 | 일의 무늬';
  const description = event ? event.law + ' · ' + fmtDate(event.date) + ' 시행 · 법령 검수 전 자료' : '법 개정과 시행일을 살피고, 취업규칙에서 확인할 항목을 찾습니다. 법령 검수 전 자료입니다.';
  const image = SITE_URL + '/og/laws' + (event ? '?event=' + encodeURIComponent(event.id) : '');
  return { title, description, alternates: { canonical: SITE_URL + '/laws' },
    openGraph: { title, description, url: SITE_URL + '/laws', type: 'website', locale: 'ko_KR', images: [{ url: image, width:1200, height:630, alt:title }] },
    twitter: { card:'summary_large_image', title, description, images:[image] } };
}

export default function LawsPage() {
  // 빌드 시점에 읽어 정적으로 굳힌다. 시행예정 여부·D-day 는 화면에서 오늘(KST) 기준으로 계산한다
  const index = JSON.parse(
    readFileSync(path.join(process.cwd(), 'public', 'data', 'laws', 'index.json'), 'utf-8'),
  ) as LawIndex;
  return <LawsClient index={index} />;
}
