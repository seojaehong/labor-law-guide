import Link from 'next/link';
import { ArrowRight, ClipboardCheck, FileText, Search } from 'lucide-react';

const quickLinks = [
  {
    href: '/guide',
    label: '핵심 가이드',
    description: '노란봉투법 핵심 쟁점과 해석지침을 먼저 확인합니다.',
    icon: FileText,
  },
  {
    href: '/checklist',
    label: '자가진단 체크리스트',
    description: '우리 사업장의 사용자성·교섭 의무 가능성을 점검합니다.',
    icon: ClipboardCheck,
  },
  {
    href: '/database',
    label: '판례·행정해석 검색',
    description: '유사 판례와 행정해석을 바로 찾아봅니다.',
    icon: Search,
  },
];

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-[960px] flex-col justify-center px-5 py-16">
      <div className="max-w-[720px]">
        <p className="mb-3 text-sm font-medium" style={{ color: 'var(--color-accent)' }}>404</p>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl" style={{ color: 'var(--grey-900)' }}>
          요청하신 페이지를 찾지 못했습니다.
        </h1>
        <p className="mt-4 text-[15px] leading-7" style={{ color: 'var(--color-text-secondary)' }}>
          주소가 바뀌었거나 삭제되었을 수 있습니다. 아래의 핵심 페이지로 이동하면 노란봉투법 가이드, 자가진단, 판례 검색을 바로 이어서 볼 수 있습니다.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {quickLinks.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-2xl border p-5 transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--grey-50)]"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'white' }}
              >
                <Icon size={20} style={{ color: 'var(--color-accent)' }} />
                <p className="mt-3 text-sm font-bold" style={{ color: 'var(--grey-900)' }}>{item.label}</p>
                <p className="mt-1 text-xs leading-5" style={{ color: 'var(--grey-500)' }}>{item.description}</p>
              </Link>
            );
          })}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg px-5 py-3 font-medium text-white"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            홈으로 이동 <ArrowRight size={16} />
          </Link>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 rounded-lg border px-5 py-3 font-medium"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
          >
            전문가 상담 문의 <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}
