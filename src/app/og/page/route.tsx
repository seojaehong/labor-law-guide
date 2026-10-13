import { shareCard } from '@/lib/share-card';
import { shareText, shortShareText } from '@/lib/share-text';
import { BRAND_NAME, BRAND_DESCRIPTION } from '@/lib/constants';
export const runtime = 'nodejs';
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  return shareCard({ title: shareText(sp.get('title')).slice(0, 180) || BRAND_NAME, description: shortShareText(sp.get('description')) || BRAND_DESCRIPTION });
}
