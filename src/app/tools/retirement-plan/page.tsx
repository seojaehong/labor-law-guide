import Link from 'next/link';
import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import ToolShell from '@/components/tool/ToolShell';
import RetirementPlanClient from './RetirementPlanClient';

export const metadata: Metadata = publicMetadata({
  title: '정년 대비 시뮬레이터 | 연도별 정년 도달 인원과 인건비 | 일의 무늬',
  description:
    '직원 명단의 출생연월만 넣으면 연도별로 몇 명이 정년에 이르고 인건비와 퇴직금 지급 시점이 어떻게 움직이는지 보여줍니다. 현행 60세·단계적 연장안·정년 후 재고용을 겹쳐 비교합니다. 주민등록번호와 이름은 넣는 칸이 없습니다.',
  keywords: ['정년연장 인건비', '정년 도달 인원', '계속고용 재고용 비용', '정년 65세 대비', '퇴직금 지급 시기'],
  alternates: { canonical: `${SITE_URL}/tools/retirement-plan` },
  openGraph: {
    title: '정년 대비 시뮬레이터 | 일의 무늬',
    description: '출생연월만으로 연도별 정년 도달 인원·인건비·퇴직금 지급 시점을 봅니다. 현행과 연장안을 겹쳐 비교합니다.',
    url: `${SITE_URL}/tools/retirement-plan`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
});

export default function RetirementPlanPage() {
  return (
    <ToolShell
      title="정년 대비 시뮬레이터"
      lead={
        <>
          직원 명단을 넣으면 <strong>어느 해에 몇 명이 정년에 이르고</strong>, 그때 인건비와 퇴직금이 어떻게 움직이는지 보여줍니다.
          인원 구조는 제도와 무관하게 지금 확정된 사실입니다 — 생년만 있으면 2029년에 몇 명이 60세가 되는지는 오늘도 셀 수 있습니다.
          거기에 정년 가정을 겹쳐 보는 도구입니다.
        </>
      }
      basis={[
        '고용상 연령차별금지 및 고령자고용촉진에 관한 법률 제19조 제1항 — 정년을 정하는 경우 60세 이상으로 정하여야 한다',
        '같은 조 제2항 — 60세 미만으로 정한 경우 정년을 60세로 정한 것으로 본다',
        '근로자퇴직급여 보장법 제8조 제1항 — 퇴직금은 계속근로기간 1년에 대하여 30일분 이상의 평균임금',
        '근로기준법 제2조 제1항 제6호 — 평균임금은 퇴직 전 3개월 임금총액을 그 기간 총일수로 나눈 금액',
      ]}
      basisNote={
        <>
          연도별 정년 가정은 <strong>입법 전 안</strong>이라 화면에서 고쳐 쓰게 두었습니다. 제도 자체는{' '}
          <Link href="/blog/guide-20261127-01" className="underline underline-offset-2">정년 65세안 실무 준비</Link>에서 봅니다.
          개인의 퇴직금은 <Link href="/tools/severance" className="underline underline-offset-2">퇴직금 계산기</Link>로 따로 계산합니다.
        </>
      }
    >
      <RetirementPlanClient />
    </ToolShell>
  );
}
