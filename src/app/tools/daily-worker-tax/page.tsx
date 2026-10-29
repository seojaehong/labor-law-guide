import type { Metadata } from 'next';
import Link from 'next/link';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import ToolShell from '@/components/tool/ToolShell';
import DailyWorkerTaxClient from './DailyWorkerTaxClient';
import { BASIS, HOMETAX, NTS } from './copy';

// 이름·소개 금지어(261028 공통 장치)는 tests/unit/calc-daily-worker-tax.test.ts 가 막는다.
export const metadata: Metadata = publicMetadata({
  title: '일용근로소득 원천징수 계산기 | 일용직 소득세·지방소득세 | 일의 무늬',
  description:
    '일급과 일수를 넣으면 일용근로자의 예상 원천징수 소득세와 지방소득세를 계산합니다. 1일 15만원 근로소득공제, 6% 세율, 산출세액 55% 세액공제를 날마다 적용하고, 1,000원 미만 소액부징수는 한 번에 지급한 날들의 합계로 봅니다.',
  keywords: ['일용근로소득 원천징수', '일용직 소득세 계산기', '일용근로자 소득세', '일용직 소액부징수', '일용근로소득 2.7%', '일용직 지방소득세'],
  alternates: { canonical: `${SITE_URL}/tools/daily-worker-tax` },
  openGraph: {
    title: '일용근로소득 원천징수 계산기 | 일의 무늬',
    description: '(일급 − 15만원) × 6% − 55% 세액공제를 날마다 적용. 1,000원 미만 소액부징수는 지급 건마다.',
    url: `${SITE_URL}/tools/daily-worker-tax`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
});

export default function DailyWorkerTaxPage() {
  return (
    <ToolShell
      title="일용근로소득 원천징수 계산기"
      lead="일용근로자에게 일급을 지급할 때 떼는 소득세와 지방소득세를 예상합니다. 날마다 1일 15만원을 공제하고 6% 세율과 55% 세액공제를 적용하며, 1,000원 미만 소액부징수는 지급 건마다 봅니다."
      basis={[...BASIS]}
      basisNote={
        <>
          세무대리·신고서 작성 대행이 아닙니다.{' '}
          <a href={NTS.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{NTS.text}</a>{NTS.after}{' '}
          <a href={HOMETAX.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{HOMETAX.text}</a>{HOMETAX.after}{' '}
          일용근로자가 아니면 <Link href="/tools/take-home-pay" className="underline underline-offset-2">실수령액 계산기</Link>에서 간이세액표 소득세를 봅니다.
        </>
      }
    >
      <DailyWorkerTaxClient />
    </ToolShell>
  );
}
