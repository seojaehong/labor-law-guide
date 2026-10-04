import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { TopicPick } from '@/lib/topic-picks';
import './editorial-home.css';

interface Props {
  items: TopicPick[];
  variant?: 'home' | 'index' | 'article';
}

export default function TopicPicks({ items, variant = 'home' }: Props) {
  if (items.length === 0) return null;

  return (
    <section className={`editorial-topics editorial-topics--${variant}${variant === 'article' ? '' : ' editorial-shell'}`} aria-label="이 주의 토픽">
      <div className="editorial-section-heading">
        <h2>이 주의 토픽</h2>
        <span>편집자 추천</span>
      </div>
      <div className="editorial-topic-grid">
        {items.map(item => (
          <article key={item.slug}>
            <p className="editorial-category">{item.category}</p>
            <h3><Link href={`/blog/${item.slug}`}>{item.title.replace(/^🎯\s*/, '')}</Link></h3>
            {item.subtitle && <p>{item.subtitle}</p>}
            <Link href={`/blog/${item.slug}`} className="editorial-topic-more">글 읽기 <ArrowRight size={14} aria-hidden="true" /></Link>
          </article>
        ))}
      </div>
    </section>
  );
}
