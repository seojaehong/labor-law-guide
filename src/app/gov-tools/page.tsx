import type { Metadata } from 'next';
import Link from 'next/link';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import { GOV_TOOLS, type GovTool, type GovToolAction } from '@/content/gov-tools';

const TITLE = '공단 업무 도구 | 공단 로그인·산재 서식·건강보험 신고서·관할 지사 | 일의 무늬';
const DESC =
  '근로복지공단·국민연금·건강보험 업무에 쓰는 도구 모음입니다. 공동인증서 자동 로그인 프로그램, 산재 신청 서식 작성, 건강보험 신고서 PDF, 관할 지사 연락처를 한곳에서 엽니다.';

export const metadata: Metadata = publicMetadata({
  title: TITLE,
  description: DESC,
  keywords: ['공단 로그인', '토탈서비스 로그인', '국민연금 EDI', '건강보험 EDI', '산재 신청서', '건강보험 신고서', '공단 지사 연락처'],
  alternates: { canonical: `${SITE_URL}/gov-tools` },
  openGraph: { title: '공단 업무 도구 | 일의 무늬', description: DESC, url: `${SITE_URL}/gov-tools`, type: 'website', locale: 'ko_KR' },
});

const ink = { color: 'var(--color-text-primary)' } as const;
const sub = { color: 'var(--color-text-secondary)' } as const;
const link = { color: 'var(--color-accent-ink, var(--color-accent))' } as const;

function Action({ a, primary }: { a: GovToolAction; primary: boolean }) {
  const cls = 'inline-flex min-h-[44px] items-center rounded-lg px-4 py-2 text-sm font-medium';
  const style = primary
    ? { background: 'var(--color-accent)', color: 'var(--color-on-accent-ink, #fff)' }
    : { border: '1px solid var(--color-border)', ...link };
  // /howto/* 는 public 정적 사용설명서라 Next Link 프리페치가 404 를 낸다(261124) — 일반 a 로 보낸다
  if (a.href.startsWith('/') && !a.href.startsWith('/howto/')) {
    return (
      <Link href={a.href} className={cls} style={style}>
        {a.label}
      </Link>
    );
  }
  return (
    <a href={a.href} className={cls} style={style} target="_blank" rel="noopener noreferrer">
      {a.label}
    </a>
  );
}

function Card({ t }: { t: GovTool }) {
  return (
    <section
      id={t.id}
      className="rounded-2xl border p-5 sm:p-6"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-surface)' }}
    >
      <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
        {t.kind}
      </p>
      <h2 className="mt-1 text-lg font-semibold" style={ink}>
        {t.name}
      </h2>
      <p className="mt-2 text-sm leading-6" style={sub}>
        {t.summary}
      </p>
      <ul className="mt-3 space-y-1.5 text-sm leading-6" style={ink}>
        {t.does.map((d) => (
          <li key={d} className="flex gap-2">
            <span aria-hidden style={{ color: 'var(--color-accent)' }}>
              ✓
            </span>
            <span>{d}</span>
          </li>
        ))}
      </ul>
      {t.requires && (
        <p className="mt-3 text-sm leading-6" style={sub}>
          <strong style={ink}>필요한 것</strong> · {t.requires}
        </p>
      )}
      {t.note && (
        <p className="mt-2 text-xs leading-5" style={sub}>
          {t.note}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {t.actions.map((a, i) => (
          <Action key={a.href} a={a} primary={i === 0} />
        ))}
      </div>
    </section>
  );
}

export default function GovToolsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-bold sm:text-3xl" style={ink}>
        공단 업무 도구
      </h1>
      <p className="mt-3 text-sm leading-6" style={sub}>
        근로복지공단·국민연금·건강보험에 들어가고, 낼 서류를 채우고, 관할 지사를 찾는 도구를 모았습니다. AI 에 연결해 쓰는
        도구는{' '}
        <Link href="/ai-tools" style={link}>
          AI 연결
        </Link>
        에 있습니다.
      </p>
      <div className="mt-8 space-y-5">
        {GOV_TOOLS.map((t) => (
          <Card key={t.id} t={t} />
        ))}
      </div>
    </main>
  );
}
