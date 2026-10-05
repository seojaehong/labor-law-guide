import { describe, expect, it } from 'vitest';
import { articleShare, shareText } from '@/lib/share-text';
import { publicMetadata } from '@/lib/public-metadata';

describe('share presentation', () => {
  it('keeps the displayed article title and cleans HTML from the description', () => {
    expect(articleShare({ title: '📌 원청 교섭의 쟁점', subtitle: '<p>시설 &amp; 근로조건</p>', seo_description: 'Different search description' })).toEqual({ title: '원청 교섭의 쟁점', description: '시설 & 근로조건' });
    expect(shareText('🎯 현장')).toBe('현장');
  });
  it('preserves canonical and private indexing policy while changing the share image', () => {
    const canonical = { url: 'https://yellowenvelope.kr/guide' };
    const robots = { index: false, follow: false };
    const metadata = publicMetadata({ title: '문서 | 노란봉투법 가이드', description: '설명', alternates: { canonical }, robots });
    expect(metadata.alternates?.canonical).toBe(canonical);
    expect(metadata.robots).toBe(robots);
    expect(metadata.title).toBe('문서 | 일의 무늬');
    expect(JSON.stringify(metadata.openGraph)).toContain('/og/page?title=');
  });
});
