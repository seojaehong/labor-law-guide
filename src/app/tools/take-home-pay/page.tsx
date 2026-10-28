import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import ToolShell from '@/components/tool/ToolShell';
import TakeHomePayClient from './TakeHomePayClient';

export const metadata: Metadata = publicMetadata({
  title: '실수령액 계산기 | 4대보험·소득세를 뺀 월급 | 일의 무늬',
  description:
    '월 급여와 비과세 식대, 공제대상 가족 수를 넣으면 국민연금·건강보험·장기요양·고용보험 근로자 몫과 간이세액표 소득세·지방소득세를 빼 한 달 실수령액을 예상합니다.',
  keywords: ['실수령액 계산기', '월급 실수령액', '4대보험 계산', '근로소득 간이세액표', '식대 비과세'],
  alternates: { canonical: `${SITE_URL}/tools/take-home-pay` },
  openGraph: {
    title: '실수령액 계산기 | 일의 무늬',
    description: '4대보험 근로자 몫과 간이세액표 소득세·지방소득세를 빼 한 달 실수령액을 예상합니다.',
    url: `${SITE_URL}/tools/take-home-pay`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
});

export default function TakeHomePayPage() {
  return (
    <ToolShell
      title="실수령액 계산기"
      lead="월 급여와 비과세 금액, 공제대상 가족 수를 넣으면 4대보험 근로자 몫과 소득세·지방소득세를 빼 한 달 실수령액을 예상합니다."
      basis={[
        '소득세법 제134조제1항, 시행령 제189조제1항 [별표2] 근로소득 간이세액표 <개정 2026. 2. 27.> — 월급여액(비과세 제외)과 공제대상가족 수로 찾고, 8세 이상 20세 이하 자녀 공제(제3호)',
        '소득세법 시행령 제194조제1항 — 근로자가 신청하면 간이세액의 80% 또는 120%',
        '소득세법 제86조제1호 — 자녀 공제·80%·120%를 거친 원천징수세액이 1천원 미만이면 징수하지 않음(지방소득세도 0원)',
        '지방세법 제103조의13제1항 — 지방소득세는 소득세의 10%',
        '소득세법 제12조제3호러목 — 식사를 제공받지 않는 근로자의 월 20만원 이하 식사대는 비과세',
        '국민연금법 제88조제3항·부칙 <제20903호> 제4조제1항, 시행령 제5조 — 기준소득월액(천원 미만 버림, 보건복지부 고시 하한·상한) × 근로자 기여금 비율',
        '국민건강보험법 제69조제4항·제76조제1항, 시행령 제32조·제44조제1항 — 보수월액 × 보험료율의 절반, 월 보험료 하한·상한(보건복지부 고시 제2025-222호)',
        '노인장기요양보험법 제9조제1항, 시행령 제4조 — 장기요양보험료는 건강보험료에 「건강보험료율 대비 장기요양보험료율의 비율」을 곱한 금액. 이 도구는 보건복지부가 공표한 비율을 근로자 건강보험료에 곱해 10원 미만을 버린 예상값이라 공단 고지와 10원 다를 수 있음',
        '고용보험 및 산업재해보상보험의 보험료징수 등에 관한 법률 제13조제2항·제3항, 시행령 제12조제1항제2호 — 보수 × 실업급여 보험료율의 절반, 65세 이후 새로 고용되면 실업급여 보험료를 걷지 않음',
        '국민연금법 제117조·국민건강보험법 제107조·국고금관리법 제47조제1항 — 10원 미만 버림',
      ]}
    >
      <TakeHomePayClient />
    </ToolShell>
  );
}
