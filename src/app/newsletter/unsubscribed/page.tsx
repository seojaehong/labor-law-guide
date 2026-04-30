import Link from 'next/link';
import { CheckCircle2, AlertCircle, Mail } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '구독 해지 — 노란봉투법 가이드',
  robots: { index: false, follow: false },
};

export default async function UnsubscribedPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; message?: string }>;
}) {
  const { state, message } = await searchParams;

  const config = {
    done: {
      icon: CheckCircle2,
      color: '#16a34a',
      title: '구독이 해지됐어요',
      desc: '앞으로 더 이상 메일을 보내지 않을게요. 그동안 감사했습니다 🙏',
    },
    already: {
      icon: Mail,
      color: '#6b7280',
      title: '이미 해지된 상태예요',
      desc: '추가로 처리할 것은 없습니다.',
    },
    error: {
      icon: AlertCircle,
      color: '#dc2626',
      title: '해지할 수 없어요',
      desc: message || '링크가 만료됐거나 잘못된 토큰입니다.',
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
      </div>
    </main>
  );
}
