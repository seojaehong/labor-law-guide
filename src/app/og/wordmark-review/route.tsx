import { shareCard } from '@/lib/share-card';
import { BRAND_NAME, BRAND_DESCRIPTION } from '@/lib/constants';
export const runtime = 'nodejs';
/** Visual comparison only: the same renderer, title and font with either wordmark. */
export async function GET(request: Request) {
  const wordmark = new URL(request.url).searchParams.get('variant') === 'original' ? 'original' : 'proposal';
  return shareCard({ title: BRAND_NAME, description: BRAND_DESCRIPTION, category: '워드마크 비교 · 최종 선택 전', wordmark });
}
