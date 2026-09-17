import Link from 'next/link';
import { AlertCircle, MailX } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '구독 해지 확인 — 노란봉투법 가이드',
  robots: { index: false, follow: false },
};

/**
 * 해지 확인 한 단계.
 *
 * ★ 2026-09-17 신설. 전에는 메일의 해지 링크를 **열기만 해도** 즉시 해지됐다.
 * 회사 메일 보안 스캐너가 링크를 미리 열어보는 것만으로 구독자가 빠졌다
 * (실측: 삼성 계정이 구독 8초 뒤 해지 → 48일간 한 통도 못 받음).
 *
 * 그래서 버튼을 한 번 두었다. 스캐너는 링크를 따라가지만 버튼은 누르지 못한다.
 * **자바스크립트 없이 동작하는 평범한 form 이어야 한다** — 메일에서 온 사람의
 * 브라우저 환경을 고를 수 없고, 해지는 반드시 되어야 하는 동작이다.
 */
export default async function UnsubscribeConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token || token.length < 10) {
    return (
      <main className="mx-auto flex max-w-[820px] flex-col items-center px-6 py-20 text-center">
        <AlertCircle size={56} style={{ color: 'var(--color-danger)' }} />
        <h1 className="t-h2 mt-6" style={{ color: 'var(--color-text-primary)' }}>
          해지할 수 없어요
        </h1>
        <p className="mt-3 text-[15px]" style={{ color: 'var(--color-text-secondary)' }}>
          링크가 만료됐거나 잘못된 주소입니다. 받으신 메일의 링크를 다시 눌러 주세요.
        </p>
        <div className="mt-8">
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center justify-center rounded-md px-5 py-2.5 text-[15px] font-semibold bg-[var(--color-accent-ink)] text-[var(--color-on-accent-ink)] hover:bg-[var(--color-accent-ink-hover)]"
          >
            홈으로
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-[820px] flex-col items-center px-6 py-20 text-center">
      <MailX size={56} style={{ color: 'var(--color-text-tertiary)' }} />
      <h1 className="t-h2 mt-6" style={{ color: 'var(--color-text-primary)' }}>
        구독을 해지할까요?
      </h1>
      <p className="mt-3 text-[15px]" style={{ color: 'var(--color-text-secondary)' }}>
        아래 버튼을 누르면 바로 해지되고, 더 이상 메일을 보내지 않습니다.
      </p>

      <form action="/api/subscribers/unsubscribe" method="post" className="mt-8 flex flex-col items-center gap-3">
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          className="inline-flex min-h-[44px] items-center justify-center rounded-md px-6 py-2.5 text-[15px] font-semibold text-white"
          style={{ backgroundColor: 'var(--color-danger)' }}
        >
          구독 해지하기
        </button>
        <Link
          href="/"
          className="text-[14px] underline underline-offset-2"
          style={{ color: 'var(--color-accent-ink)' }}
        >
          그냥 계속 받을게요
        </Link>
      </form>
    </main>
  );
}
