import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import type { NlrcResult } from './types';
import { highlightText, formatDecisionDate, getPreferredSummary, getPreferredDetail } from './utils';
import MarkdownSnippet from './MarkdownSnippet';
import TagRow from './TagRow';

export default function NlrcCard({ item, query, expanded, onToggle }: { item: NlrcResult; query: string; expanded: boolean; onToggle: () => void }) {
  const formattedDate = formatDecisionDate(item.decision_date);
  const summaryText = getPreferredSummary(item);
  const detailText = getPreferredDetail(item);
  const hasContent = !!(summaryText || detailText);

  const highlighted = highlightText(item.title, query);
  const titleContent = Array.isArray(highlighted)
    ? highlighted.map((part) => typeof part === 'object' && part.__highlight
        ? <mark key={part.key} style={{ backgroundColor: 'var(--yellow-100, #fef9c3)', color: 'inherit', borderRadius: '2px', padding: '0 1px' }}>{part.text}</mark>
        : part)
    : highlighted;

  const resultColor = item.decision_result?.includes('인정')
    ? { bg: 'var(--blue-50)', fg: 'var(--blue-600)' }
    : item.decision_result?.includes('기각') || item.decision_result?.includes('각하')
    ? { bg: 'var(--grey-100)', fg: 'var(--grey-600)' }
    : { bg: 'var(--color-accent-light)', fg: 'var(--color-accent)' };

  return (
    <div className="rounded-xl border p-4 transition-shadow hover:shadow-md" style={{ borderColor: 'var(--color-border)', backgroundColor: 'white' }}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-md px-2 py-0.5 font-medium" style={{ backgroundColor: 'var(--color-accent-light)', color: 'var(--color-accent)' }}>
          {item.case_type}
        </span>
        {item.decision_result && (
          <span className="rounded-md px-2 py-0.5 font-medium" style={{ backgroundColor: resultColor.bg, color: resultColor.fg }}>
            {item.decision_result}
          </span>
        )}
        {item.case_number && <span style={{ color: 'var(--color-text-tertiary)' }}>{item.case_number}</span>}
        {formattedDate && <span style={{ color: 'var(--color-text-tertiary)' }}>{formattedDate}</span>}
        {item.department && <span style={{ color: 'var(--color-text-tertiary)' }}>{item.department}</span>}
      </div>
      <h3 className="mt-1.5 text-[15px] font-semibold leading-snug" style={{ color: 'var(--color-text-primary)' }}>
        {titleContent}
      </h3>

      <TagRow reasonCategory={item.reason_category} keywordsMatched={item.keywords_matched} />

      <div className="mt-2 flex items-center gap-3">
        {hasContent && (
          <button onClick={onToggle} className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--color-accent)' }}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? '접기' : '판정요지 보기'}
          </button>
        )}
        {item.url && (
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
            <ExternalLink size={12} /> 원문 참고
          </a>
        )}
      </div>

      {expanded && hasContent && (
        <div className="mt-2 space-y-3 rounded-lg p-3 text-[13px] leading-relaxed" style={{ backgroundColor: 'var(--grey-50)', color: 'var(--color-text-secondary)' }}>
          {detailText ? (
            <div>
              <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>판정사항</p>
              <MarkdownSnippet value={detailText} />
            </div>
          ) : null}
          {summaryText ? (
            <div>
              <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>판정요지</p>
              <MarkdownSnippet value={summaryText} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
