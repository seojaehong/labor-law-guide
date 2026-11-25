import Link from 'next/link';
import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import ToegoTrial from './ToegoTrial';
import { BEFORE_AFTER, CATCH, HERO, MCP, META, PRIVACY, WHAT_WE_CATCH } from './copy';
import './toego.css';

// 퇴고 소개·체험. 점검은 ToegoTrial 이 브라우저 안에서 돌린다(엔진 판정 함수 묶음 — src/lib/toego).
// 화면 글은 전부 copy.ts 에 둔다(금지어·규범 시험이 그 파일을 본다).

const PAGE_URL = `${SITE_URL}/tools/toego`;

export const metadata: Metadata = publicMetadata({
  title: META.title,
  description: META.description,
  keywords: META.keywords,
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: META.ogTitle,
    description: META.description,
    url: PAGE_URL,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
});

const ink = { color: 'var(--color-text-primary)' };
const muted = { color: 'var(--grey-700)' };

export default function ToegoPage() {
  return (
    <div className="layout-tool">
      <div className="mb-6">
        <Link href="/tools" className="-my-3 inline-flex min-h-[44px] items-center text-sm text-[var(--grey-700)] hover:text-[var(--color-text-primary)]">
          {HERO.back}
        </Link>
      </div>
      <h1 className="t-h2 mb-2" style={ink}>{HERO.title}</h1>
      <p className="text-base leading-relaxed" style={ink}>{HERO.lead}</p>
      <p className="mb-6 mt-1 text-sm" style={muted}>
        <a href="#toego-privacy" className="underline underline-offset-2">{HERO.note}</a>
      </p>

      <ToegoTrial />

      <section aria-labelledby="toego-catch" className="mt-14">
        <h2 id="toego-catch" className="t-h3 mb-2" style={ink}>{CATCH.heading}</h2>
        <p className="mb-4 text-sm leading-relaxed" style={muted}>{CATCH.lead}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {WHAT_WE_CATCH.map((c) => (
            <div key={c.key} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-5">
              <h3 className="text-base font-semibold" style={ink}>{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed" style={ink}>{c.body}</p>
              <p className="mt-2 text-xs leading-relaxed" style={muted}>{`${CATCH.sourceLabel}: ${c.source}`}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="toego-ba" className="mt-14">
        <h2 id="toego-ba" className="t-h3 mb-4" style={ink}>{BEFORE_AFTER.heading}</h2>
        <div className="toego-ba">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-5">
            <p className="mb-2 text-xs font-semibold" style={muted}>{BEFORE_AFTER.beforeLabel}</p>
            <pre style={ink}>{BEFORE_AFTER.before}</pre>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-5">
            <p className="mb-2 text-xs font-semibold" style={muted}>{BEFORE_AFTER.afterLabel}</p>
            <pre style={ink}>{BEFORE_AFTER.after}</pre>
            <p className="mt-2 text-xs" style={muted}>{BEFORE_AFTER.afterNote}</p>
          </div>
        </div>
        <p className="mb-1 mt-4 text-sm font-semibold" style={ink}>{BEFORE_AFTER.changesLabel}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed" style={ink}>
          {BEFORE_AFTER.changes.map((c) => <li key={c}>{c}</li>)}
        </ul>
      </section>

      <section aria-labelledby="toego-mcp" className="mt-14">
        <h2 id="toego-mcp" className="t-h3 mb-2" style={ink}>{MCP.heading}</h2>
        <p className="mb-3 text-sm leading-relaxed" style={ink}>{MCP.lead}</p>
        <code className="toego-code" data-toego-mcp-command>{MCP.command}</code>
        <p className="mb-1 mt-4 text-sm font-semibold" style={ink}>{MCP.toolsLabel}</p>
        <ul className="space-y-1 text-sm leading-relaxed" style={ink}>
          {MCP.tools.map((t) => (
            <li key={t.name}><code className="font-mono text-[13px]">{t.name}</code>{` — ${t.body}`}</li>
          ))}
        </ul>
        <div className="mt-4 rounded-lg border-l-4 border-[var(--color-warn)] bg-[var(--color-warn-bg)] p-4 text-sm leading-relaxed" style={ink}>
          {MCP.note}
        </div>
        <p className="mt-3 text-sm leading-relaxed" style={muted}>{MCP.privacy}</p>
        <p className="mt-2 text-sm">
          <Link href="/ai-tools" className="font-semibold text-[var(--color-accent-ink)] underline underline-offset-2">{MCP.more}</Link>
        </p>
      </section>

      <section id="toego-privacy" aria-labelledby="toego-privacy-h" className="mt-14 rounded-xl bg-[var(--grey-100)] p-5">
        <h2 id="toego-privacy-h" className="t-h3 mb-3" style={ink}>{PRIVACY.heading}</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed" style={ink}>
          {PRIVACY.items.map((p) => <li key={p}>{p}</li>)}
        </ul>
      </section>
    </div>
  );
}
