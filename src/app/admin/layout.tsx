import type { Metadata } from 'next';
import { GENERAL_SHARE } from '@/lib/share-text';
export const metadata: Metadata = { openGraph: GENERAL_SHARE, twitter: { card:'summary_large_image', ...GENERAL_SHARE } };
export default function AdminLayout({ children }: { children: React.ReactNode }) { return children; }
