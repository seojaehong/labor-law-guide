import { translateReasonCategory } from './utils';

export default function TagRow({ reasonCategory, keywordsMatched }: { reasonCategory?: string[] | null; keywordsMatched?: string[] | null }) {
  const translatedReasons = (reasonCategory || []).map(translateReasonCategory);
  const filteredKeywords = (keywordsMatched || []).filter((keyword) => !translatedReasons.includes(keyword));
  const visibleReasons = translatedReasons.slice(0, 4);
  const visibleKeywords = filteredKeywords.slice(0, 4);
  const hiddenCount = (translatedReasons.length - visibleReasons.length) + (filteredKeywords.length - visibleKeywords.length);

  if (visibleReasons.length === 0 && visibleKeywords.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {visibleReasons.map((label) => (
        <span key={`reason-${label}`} className="rounded-full px-2 py-0.5 text-[11px]" style={{ backgroundColor: 'var(--blue-50)', color: 'var(--blue-600)' }}>
          {label}
        </span>
      ))}
      {visibleKeywords.map((keyword) => (
        <span key={`keyword-${keyword}`} className="rounded-full px-2 py-0.5 text-[11px]" style={{ backgroundColor: 'var(--grey-100)', color: 'var(--grey-600)' }}>
          {keyword}
        </span>
      ))}
      {hiddenCount > 0 && (
        <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ backgroundColor: 'var(--grey-50)', color: 'var(--grey-400)' }}>
          +{hiddenCount}
        </span>
      )}
    </div>
  );
}
