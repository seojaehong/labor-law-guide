import { shareCard, SHARE_SIZE } from '@/lib/share-card';
import { BRAND_NAME, BRAND_DESCRIPTION } from '@/lib/constants';
export const runtime = 'nodejs';
export const alt = '일의 무늬 — 노동법과 일터의 변화';
export const size = SHARE_SIZE;
export const contentType = 'image/png';
export default function Image() { return shareCard({ title: BRAND_NAME, description: BRAND_DESCRIPTION }); }
