import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_URL } from '@/lib/constants';

export const metadata: Metadata = {
  title: '고용지원금 가이드',
  description: '중소기업·소상공인을 위한 고용지원금 종류, 신청 방법, 자격 요건을 한눈에 정리합니다.',
  alternates: { canonical: `${SITE_URL}/subsidy` },
};

export default function SubsidyPage() {
  return (
    <div className="mx-auto max-w-[900px] px-5 py-10">
      <h1 className="mb-2 font-bold" style={{ fontSize: 'var(--text-2xl)', color: 'var(--grey-900)' }}>
        고용지원금 가이드
      </h1>
      <p className="mb-10 text-sm" style={{ color: 'var(--grey-500)' }}>
        중소기업·소상공인을 위한 고용지원금 정보를 정리합니다.
      </p>

      <div className="rounded-2xl border p-8 text-center" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
        <div className="mb-4" style={{ fontSize: '48px' }}>📋</div>
        <h2 className="mb-3 font-bold" style={{ fontSize: 'var(--text-xl)', color: 'var(--grey-900)' }}>
          고용지원금 자격 확인
        </h2>
        <p className="mb-6" style={{ color: 'var(--grey-500)', lineHeight: '1.7' }}>
          고용촉진장려금, 고용안정장려금, 직업능력개발훈련 지원금 등<br />
          사업주가 받을 수 있는 고용지원금 정보와 자격 확인 서비스를 제공합니다.
        </p>
        <div className="flex justify-center gap-3">
          <a
            href="https://reporeview.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl px-5 py-2.5 text-sm font-medium transition-colors"
            style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
          >
            지원금 자격 확인하기 →
          </a>
          <Link
            href="/blog"
            className="rounded-xl border px-5 py-2.5 text-sm font-medium transition-colors"
            style={{ borderColor: 'var(--color-border)', color: 'var(--grey-700)' }}
          >
            블로그 보기
          </Link>
          <Link
            href="/contact"
            className="rounded-xl border px-5 py-2.5 text-sm font-medium transition-colors"
            style={{ borderColor: 'var(--color-border)', color: 'var(--grey-700)' }}
          >
            상담 문의
          </Link>
        </div>
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-3">
        <div className="rounded-xl border p-5" style={{ borderColor: 'var(--color-border)' }}>
          <h3 className="mb-2 font-bold text-sm" style={{ color: 'var(--grey-900)' }}>고용촉진장려금</h3>
          <p className="text-xs" style={{ color: 'var(--grey-500)', lineHeight: '1.6' }}>
            취업 취약계층을 고용한 사업주에게 인건비를 지원합니다.
          </p>
        </div>
        <div className="rounded-xl border p-5" style={{ borderColor: 'var(--color-border)' }}>
          <h3 className="mb-2 font-bold text-sm" style={{ color: 'var(--grey-900)' }}>고용안정장려금</h3>
          <p className="text-xs" style={{ color: 'var(--grey-500)', lineHeight: '1.6' }}>
            근로시간 단축, 일·생활 균형 등을 실천하는 사업주를 지원합니다.
          </p>
        </div>
        <div className="rounded-xl border p-5" style={{ borderColor: 'var(--color-border)' }}>
          <h3 className="mb-2 font-bold text-sm" style={{ color: 'var(--grey-900)' }}>직업능력개발</h3>
          <p className="text-xs" style={{ color: 'var(--grey-500)', lineHeight: '1.6' }}>
            재직자·구직자의 직업능력 향상을 위한 훈련비를 지원합니다.
          </p>
        </div>
      </div>
    </div>
  );
}
