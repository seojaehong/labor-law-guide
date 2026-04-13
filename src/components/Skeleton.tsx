export function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border p-4" style={{ borderColor: 'var(--color-border)' }}>
      <div className="flex gap-2 mb-3">
        <div className="h-5 w-16 rounded-md" style={{ backgroundColor: 'var(--grey-200)' }} />
        <div className="h-5 w-24 rounded-md" style={{ backgroundColor: 'var(--grey-100)' }} />
        <div className="h-5 w-20 rounded-md" style={{ backgroundColor: 'var(--grey-100)' }} />
      </div>
      <div className="h-5 w-3/4 rounded-md mb-2" style={{ backgroundColor: 'var(--grey-200)' }} />
      <div className="h-4 w-1/2 rounded-md" style={{ backgroundColor: 'var(--grey-100)' }} />
    </div>
  );
}

export function SearchResultsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export function BlogCardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border p-5" style={{ borderColor: 'var(--color-border)' }}>
      <div className="h-4 w-16 rounded-full mb-3" style={{ backgroundColor: 'var(--grey-200)' }} />
      <div className="h-5 w-full rounded-md mb-2" style={{ backgroundColor: 'var(--grey-200)' }} />
      <div className="h-4 w-2/3 rounded-md mb-3" style={{ backgroundColor: 'var(--grey-100)' }} />
      <div className="h-3 w-24 rounded-md" style={{ backgroundColor: 'var(--grey-100)' }} />
    </div>
  );
}

export function DetailPageSkeleton() {
  return (
    <div className="animate-pulse mx-auto max-w-[1100px] px-5 py-10">
      <div className="h-4 w-24 rounded-md mb-6" style={{ backgroundColor: 'var(--grey-200)' }} />
      <div className="flex gap-2 mb-4">
        <div className="h-5 w-14 rounded-full" style={{ backgroundColor: 'var(--grey-200)' }} />
        <div className="h-5 w-20 rounded-full" style={{ backgroundColor: 'var(--grey-100)' }} />
      </div>
      <div className="h-7 w-2/3 rounded-md mb-2" style={{ backgroundColor: 'var(--grey-200)' }} />
      <div className="h-6 w-1/2 rounded-md mb-8" style={{ backgroundColor: 'var(--grey-100)' }} />
      <div className="space-y-3 rounded-xl p-5" style={{ backgroundColor: 'var(--grey-50)' }}>
        <div className="h-4 w-full rounded-md" style={{ backgroundColor: 'var(--grey-200)' }} />
        <div className="h-4 w-5/6 rounded-md" style={{ backgroundColor: 'var(--grey-200)' }} />
        <div className="h-4 w-4/6 rounded-md" style={{ backgroundColor: 'var(--grey-200)' }} />
      </div>
    </div>
  );
}
