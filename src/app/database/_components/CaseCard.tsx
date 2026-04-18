import Link from 'next/link';
import { ChevronDown, ChevronUp, ExternalLink, ArrowRight } from 'lucide-react';
import type { CaseResult } from './types';
import { highlightText, formatDecisionDate, getPreferredSummary, getPreferredDetail } from './utils';
import MarkdownSnippet from './MarkdownSnippet';
import TagRow from './TagRow';

export default function CaseCard({ item, query, expanded, onToggle }: { item: CaseResult; query: string; expanded: boolean; onToggle: () => void }) {
  const formattedDate = formatDecisionDate(item.decision_date);
  const summaryText = getPreferredSummary(item);
  const detailText = getPreferredDetail(item);
  const hasContent = !!(summaryText || detailText);

  const titleContent = highlightText(item.title, query);

  return (
    <div className="rounded-xl border p-4 transition-shadow hover:shadow-md" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md px-2 py-0.5 font-medium" style={{ backgroundColor: 'var(--blue-50)', color: 'var(--blue-600)' }}>
              {item.court || '법원 미상'}
            </span>
            {item.case_number && <span style={{ color: 'var(--color-text-tertiary)' }}>{item.case_number}</span>}
            {formattedDate && <span style={{ color: 'var(--color-text-tertiary)' }}>{formattedDate}</span>}
            {item.case_type && <span style={{ color: 'var(--color-text-tertiary)' }}>{item.case_type}</span>}
            {item.verdict_type && <span style={{ color: 'var(--color-text-tertiary)' }}>{item.verdict_type}</span>}
          </div>
          <h3 className="mt-1.5 text-[15px] font-semibold leading-snug" style={{ color: 'var(--color-text-primary)' }}>
            {titleContent}
          </h3>
        </div>
      </div>

      <TagRow reasonCategory={item.reason_category} keywordsMatched={item.keywords_matched} />

      <div className="mt-2 flex items-center gap-3">
        {hasContent && (
          <button onClick={onToggle} className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--color-accent)' }}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? '접기' : '요지 보기'}
          </button>
        )}
        <Link href={`/cases/${encodeURIComponent(item.id)}`} className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--color-accent)' }}>
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
              <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>요지</p>
              <MarkdownSnippet value={summaryText} />
            </div>
          ) : null}
          {detailText ? (
            <div>
              <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>판시사항</p>
              <MarkdownSnippet value={detailText} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
