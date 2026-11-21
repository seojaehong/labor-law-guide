import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import ToolShell from '@/components/tool/ToolShell';
import HrFormsClient from './HrFormsClient';
import { LEAD } from './copy';

export const metadata: Metadata = publicMetadata({
  title: '육아휴직·배우자 출산전후휴가·난임치료휴가 신청서 작성 | 일의 무늬',
  description:
    '육아휴직·단기 육아휴직·배우자 출산전후휴가·난임치료휴가 신청서와 육아휴직 허용 통지서를 칸에 맞춰 채우고 한글(hwpx) 파일로 내려받습니다. 입력한 날짜를 신청 기한과 견주어 알려 줍니다.',
  keywords: ['육아휴직 신청서', '단기 육아휴직 신청서', '배우자 출산전후휴가', '난임치료휴가 신청서', '육아휴직 허용 통지서', '모성보호 서식'],
  alternates: { canonical: `${SITE_URL}/tools/hr-forms` },
  openGraph: {
    title: '모성보호 서식 작성 | 일의 무늬',
    description: '육아휴직·배우자 출산전후휴가·난임치료휴가 서식을 한글 파일로.',
    url: `${SITE_URL}/tools/hr-forms`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
});

export default function HrFormsPage() {
  return (
    <ToolShell
      title="모성보호 서식 작성"
      lead={LEAD}
      basis={[
        '남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률 제18조의2(배우자 출산전후휴가, 2026.9.18. 시행)·제18조의3(난임치료휴가)·제19조(육아휴직, 단기 육아휴직은 제6항~제8항)',
        '같은 법 시행령 제9조의2·제9조의3·제10조·제11조 — 신청서 기재사항, 신청 기한(30일 전·7일 전), 허용 사실 통지(14일·3일 이내)',
        '법령 원문 조회일 2026. 11. 21.',
      ]}
    >
      <HrFormsClient />
    </ToolShell>
  );
}
