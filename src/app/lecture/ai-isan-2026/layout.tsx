import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/constants';

export const metadata: Metadata = {
  title: '노무사를 위한 Claude × Codex 실전 | 이산노무법인 AI 강의',
  description: '공인노무사 서재홍의 3시간 강의 자료 — Claude로 자문, Codex로 자동화, Excel·PowerPoint·Cowork까지. 슬라이드 + 실전 워크북 5개 + 프롬프트 30개.',
  alternates: { canonical: `${SITE_URL}/lecture/ai-isan-2026` },
  robots: { index: false, follow: false }, // 강의 자료 공개 인덱싱은 강의 후 결정
};

export default function LectureLayout({ children }: { children: React.ReactNode }) {
  return children;
}
