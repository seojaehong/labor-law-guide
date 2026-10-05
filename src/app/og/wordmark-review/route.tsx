import { shareCard } from '@/lib/share-card';
export const runtime = 'nodejs';
/** Visual comparison only: the same renderer, title and font with either wordmark. */
export async function GET(request: Request) {
  const wordmark = new URL(request.url).searchParams.get('variant') === 'original' ? 'original' : 'proposal';
  return shareCard({ title: '일의 무늬', description: '노동법의 근거와 일터의 변화를 읽습니다', category: '워드마크 비교 · 최종 선택 전', wordmark });
}
