import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import ToolShell from '@/components/tool/ToolShell';
import NhisReportFormClient from './NhisReportFormClient';
import { LEAD } from './copy';

export const metadata: Metadata = publicMetadata({
  title: '건강보험 자격 취득·상실 신고서 작성 | 지연 신고 사업주확인서 | 일의 무늬',
  description:
    '늦어진 건강보험 직장가입자 자격 취득·상실 신고서를 공식 서식에 채우고, 늦어진 이유를 적은 사업주확인서를 붙여 PDF 로 내려받습니다. 입력값은 브라우저 안에서만 쓰입니다.',
  keywords: ['건강보험 상실신고서', '건강보험 취득신고서', '지연 신고 사유서', '사업주확인서', '자격상실 신고 지연'],
  alternates: { canonical: `${SITE_URL}/tools/nhis-report-form` },
  openGraph: {
    title: '건강보험 자격 취득·상실 신고서 작성 | 일의 무늬',
    description: '공식 서식 + 사업주확인서를 PDF 한 파일로.',
    url: `${SITE_URL}/tools/nhis-report-form`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
});

export default function NhisReportFormPage() {
  return (
    <ToolShell
      title="건강보험 자격 취득·상실 신고서 작성"
      lead={LEAD}
      basis={[
        '국민건강보험법 시행규칙 [별지 제6호서식] 자격취득 신고서 <개정 2025.12.1.>',
        '국민건강보험법 시행규칙 [별지 제8호서식] 자격상실 신고서 <개정 2022.10.26.>',
        '국민건강보험법 제9조제1항제3호 — 직장가입자인 근로자의 자격은 사용관계가 끝난 날의 다음 날 바뀝니다(상실일 = 마지막 근무일 다음 날)',
        '받을 지사는 국민건강보험공단 「지사찾기」 지사관할 행정동으로 찾습니다. 고지서의 관리지사가 우선입니다.',
      ]}
    >
      <NhisReportFormClient />
    </ToolShell>
  );
}
