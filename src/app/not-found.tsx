import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h2
        className="mb-2 text-6xl font-bold"
        style={{ color: 'var(--color-accent)' }}
      >
        404
      </h2>
      <p
        className="mb-2 text-xl font-semibold"
        style={{ color: 'var(--color-text-primary)' }}
      >
        페이지를 찾을 수 없습니다
      </p>
      <p
        className="mb-6 max-w-md text-sm"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        요청하신 페이지가 존재하지 않거나 이동되었을 수 있습니다.
      </p>
      <Link
        href="/"
        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md px-5 py-2.5 text-[15px] font-semibold transition-[background-color,transform] hover:-translate-y-px bg-[var(--color-accent-ink)] text-[var(--color-on-accent-ink)] hover:bg-[var(--color-accent-ink-hover)]"
      >
        홈으로 돌아가기
      </Link>
    </div>
  );
}
