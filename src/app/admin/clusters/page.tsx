import type { Metadata } from 'next';
import ClustersClient from './ClustersClient';

export const metadata: Metadata = {
  title: '클러스터 편차 · 어드민',
  robots: { index: false, follow: false },
};

export default function ClustersAdminPage() {
  return <ClustersClient />;
}
