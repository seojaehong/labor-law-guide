import Link from 'next/link';
import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import ToolShell from '@/components/tool/ToolShell';
import MinWageClient from './MinWageClient';

export const metadata: Metadata = publicMetadata({
  title: '최저임금 확인 계산기 | 2026·2027 | 일의 무늬',
  description:
    '월급·주급·일급·시급을 넣으면 시간급으로 바꿔 2026년(10,320원)·2027년(10,700원) 최저임금과 비교합니다. 매달 주는 상여금·현금 식비 산입, 주 15시간 미만, 수습 90%까지.',
  keywords: ['최저임금 계산기', '최저임금 위반 확인', '월급 최저임금', '2027 최저임금', '최저임금 산입범위'],
  alternates: { canonical: `${SITE_URL}/tools/min-wage` },
  openGraph: {
    title: '최저임금 확인 계산기 | 일의 무늬',
    description: '받는 임금을 시간급으로 바꿔 올해·내년 최저임금과 비교합니다.',
    url: `${SITE_URL}/tools/min-wage`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
});

export default function MinWagePage() {
  return (
    <ToolShell
      title="최저임금 확인 계산기"
      lead="받는 임금을 시간당 금액으로 바꿔 올해와 내년 최저임금과 비교합니다. 월급이면 매달 받는 상여금과 현금 식비까지 더해서 봅니다."
      basis={[
        '최저임금위원회 고시 — 2026년 시간급 10,320원, 2027년 10,700원',
        '최저임금법 시행령 제5조 제1항 — 일급·주급·월급을 시간급으로 바꾸는 방법',
        '최저임금법 제6조 제4항, 부칙(법률 제15666호) 제2조 — 매월 지급하는 정기상여금·현금 복리후생비는 2024년부터 전액 산입',
        '최저임금법 제5조 제2항, 시행령 제3조 — 수습 3개월 이내 90%(1년 이상 계약). 단순노무(한국표준직업분류 대분류 9, 고용노동부 고시 제2018-23호)는 제외',
      ]}
      basisNote={<>주휴수당만 따로 보려면 <Link href="/tools/weekly-holiday-pay" className="underline underline-offset-2">주휴수당 계산기</Link>를 씁니다.</>}
    >
      <MinWageClient />
    </ToolShell>
  );
}
