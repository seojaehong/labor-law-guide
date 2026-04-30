import Link from 'next/link';
import { CheckCircle2, AlertCircle, Mail } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '구독 확인 — 노란봉투법 가이드',
  robots: { index: false, follow: false },
};

export default async function ConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; message?: string }>;
}) {
  const { state, message } = await searchParams;

  const config = {
    confirmed: {
      icon: CheckCircle2,
      color: '#16a34a',
      title: '구독이 시작됐어요 🎉',
      desc: '환영합니다! 곧 첫 환영 메일이 도착할 거예요. 안 보이면 스팸함을 확인해주세요.',
    },
    already: {
      icon: Mail,
      color: '#0ea5e9',
      title: '이미 구독 중이에요',
      desc: '같은 이메일로 이미 구독되어 있습니다. 메일이 안 오면 스팸함을 확인해주세요.',
    },
    error: {
      icon: AlertCircle,
      color: '#dc2626',
      title: '확인할 수 없어요',
      desc: message || '링크가 만료됐거나 잘못된 토큰입니다. 다시 가입을 시도해주세요.',
    },
  };

  const c = config[state as keyof typeof config] || config.error;
  const Icon = c.icon;

  return (
    <main className="mx-auto flex max-w-[560px] flex-col items-center px-6 py-20 text-center">
      <Icon size={56} style={{ color: c.color }} />
      <h1
        className="mt-6 text-2xl font-bold"
        style={{ color: 'var(--color-text-primary)' }}
      >
        {c.title}
      </h1>
      <p className="mt-3 text-[15px]" style={{ color: 'var(--color-text-secondary)' }}>
        {c.desc}
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/"
          className="rounded-lg px-5 py-2.5 text-[14px] font-semibold"
          style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
        >
          홈으로
        </Link>
        <Link
          href="/blog"
          className="rounded-lg border px-5 py-2.5 text-[14px] font-semibold"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
        >
          최근 글 보기
        </Link>
      </div>
    </main>
  );
}
