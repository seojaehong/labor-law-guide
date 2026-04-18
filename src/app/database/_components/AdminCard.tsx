import Link from 'next/link';
import { ChevronDown, ChevronUp, ExternalLink, ArrowRight } from 'lucide-react';
import type { AdminResult } from './types';
import { highlightText, formatDecisionDate, getPreferredSummary, getPreferredDetail } from './utils';
import MarkdownSnippet from './MarkdownSnippet';
import TagRow from './TagRow';

export default function AdminCard({ item, query, expanded, onToggle }: { item: AdminResult; query: string; expanded: boolean; onToggle: () => void }) {
  const formattedDate = formatDecisionDate(item.decision_date);
  const summaryText = getPreferredSummary(item);
  const detailText = getPreferredDetail(item);
  const hasContent = !!(summaryText || detailText);

  const titleContent = highlightText(item.title, query);

  return (
    <div className="rounded-xl border p-4 transition-shadow hover:shadow-md" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-md px-2 py-0.5 font-medium" style={{ backgroundColor: 'var(--color-accent-light)', color: 'var(--color-accent)' }}>
          행정해석
        </span>
        {item.doc_number && <span style={{ color: 'var(--color-text-tertiary)' }}>{item.doc_number}</span>}
        {formattedDate && <span style={{ color: 'var(--color-text-tertiary)' }}>{formattedDate}</span>}
      </div>
      <h3 className="mt-1.5 text-[15px] font-semibold leading-snug" style={{ color: 'var(--color-text-primary)' }}>
        {titleContent}
      </h3>

      <TagRow keywordsMatched={item.keywords_matched} />

      <div className="mt-2 flex items-center gap-3">
        {hasContent && (
          <button onClick={onToggle} className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--color-accent)' }}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? '접기' : '요약 보기'}
          </button>
        )}
        <Link href={`/interpretations/${encodeURIComponent(item.id)}`} className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--color-accent)' }}>
          <ArrowRight size={12} /> 상세 보기
        </Link>
        {item.original_url && (
          <a href={item.original_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
            <ExternalLink size={12} /> 원문 참고
          </a>
        )}
      </div>

      {expanded && hasContent && (
        <div className="mt-2 space-y-3 rounded-lg p-3 text-[13px] leading-relaxed" style={{ backgroundColor: 'var(--grey-50)', color: 'var(--color-text-secondary)' }}>
          {summaryText ? (
            <div>
              <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>요약</p>
              <MarkdownSnippet value={summaryText} />
            </div>
          ) : null}
          {detailText ? (
            <div>
              <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>판단요지</p>
              <MarkdownSnippet value={detailText} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
