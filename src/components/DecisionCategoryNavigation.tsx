import Link from 'next/link';
import { REASON_LABELS, type ReasonCategory } from '@/lib/types';
import { categoryHref } from '@/lib/decisions-query';

/** URL remains the source of selection and browser Back/Forward history. */
export default function DecisionCategoryNavigation({ reason }: { reason: ReasonCategory }) {
  return (
    <nav aria-label="노동위 판정례 유형 탐색" className="mb-5 rounded-lg border p-3" style={{ borderColor: 'var(--color-border)' }}>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span>선택한 유형 <strong>{REASON_LABELS[reason]}</strong></span>
        <Link href="/decisions" className="inline-flex min-h-[44px] items-center px-2 underline" style={{ color: 'var(--color-accent-ink)' }}>선택 해제</Link>
      </div>
      <details key={reason}>
        <summary className="min-h-[44px] cursor-pointer py-3 text-sm font-medium">다른 유형 선택</summary>
        <div className="flex flex-wrap gap-2 pt-2">
          {(Object.keys(REASON_LABELS) as ReasonCategory[]).map(item => (
            <Link key={item} href={categoryHref(item)} aria-current={item === reason ? 'page' : undefined}
              className="inline-flex min-h-[44px] items-center rounded border px-3 py-2 text-sm"
              style={{ borderColor: item === reason ? 'var(--color-text-primary)' : 'var(--color-border)',
                backgroundColor: item === reason ? 'var(--grey-100)' : undefined,
                fontWeight: item === reason ? 700 : 400 }}>
              {REASON_LABELS[item]}
            </Link>
          ))}
        </div>
      </details>
    </nav>
  );
}
