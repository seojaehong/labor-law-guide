interface Props {
  title: string;
  before: string;
  after: string;
}

export default function ComparisonTable({ title, before, after }: Props) {
  return (
    <div className="my-6">
      {title && <h4 className="mb-3 font-bold" style={{ fontSize: 'var(--text-base)', color: 'var(--grey-800)' }}>{title}</h4>}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border p-5" style={{ borderColor: 'var(--grey-200)', backgroundColor: 'var(--grey-50)' }}>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--grey-500)' }}>Before (종전)</div>
          <div className="whitespace-pre-line text-[15px] leading-relaxed" style={{ color: 'var(--grey-700)' }}>{before}</div>
        </div>
        <div className="rounded-xl border p-5" style={{ borderColor: 'var(--blue-200)', backgroundColor: 'var(--blue-50)' }}>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--blue-600)' }}>After (개정)</div>
          <div className="whitespace-pre-line text-[15px] leading-relaxed" style={{ color: 'var(--grey-800)' }}>{after}</div>
        </div>
      </div>
    </div>
  );
}
