import Link from 'next/link';
import { Star, ArrowRight } from 'lucide-react';
import type { TopicPick } from '@/lib/topic-picks';

interface Props {
  items: TopicPick[];
  variant?: 'home' | 'index' | 'article';
}

export default function TopicPicks({ items, variant = 'home' }: Props) {
  if (items.length === 0) return null;

  const sectionPadding =
    variant === 'home' ? 'px-5 pt-12 pb-2' : variant === 'index' ? 'px-5 pt-2 pb-6' : 'mt-10';
  const innerWrap = variant === 'article' ? '' : 'mx-auto max-w-[1100px]';

  return (
    <section className={sectionPadding}>
      <div className={innerWrap}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Star size={18} style={{ color: 'var(--color-accent)' }} fill="currentColor" />
            <h2 className="text-[17px] sm:text-xl font-bold" style={{ color: 'var(--grey-900)' }}>
              이 주의 토픽
            </h2>
          </div>
          <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
            편집자 추천
          </span>
        </div>
        <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <Link
              key={item.slug}
              href={`/blog/${item.slug}`}
              className="feature-card block rounded-xl border bg-[var(--color-bg-surface)] p-4 hover:shadow-md transition-shadow"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <div
                className="text-[11px] font-bold mb-2 tracking-wide"
                style={{ color: 'var(--color-accent)' }}
              >
                {item.category}
              </div>
              <h3
                className="text-[14px] font-bold leading-snug mb-2 line-clamp-3"
                style={{ color: 'var(--grey-900)' }}
              >
                {item.title.replace(/^🎯\s*/, '')}
              </h3>
              {item.subtitle && (
                <p
                  className="text-[12px] leading-relaxed line-clamp-2"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {item.subtitle}
                </p>
              )}
              <span
                className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium"
                style={{ color: 'var(--color-accent)' }}
              >
                자세히 <ArrowRight size={11} />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
