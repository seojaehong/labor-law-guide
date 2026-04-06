import { guideSections } from '@/content/guide-data';
import GuideScrollTracker from '@/components/GuideScrollTracker';
import ArticleCard from '@/components/ArticleCard';
import CaseCard from '@/components/CaseCard';
import ComparisonTable from '@/components/ComparisonTable';
import CalloutBox from '@/components/CalloutBox';
import Link from 'next/link';
import { timeline } from '@/content/checklist-data';
import { ListChecks, BookOpen, Clock } from 'lucide-react';

export default function GuidePage() {
  const navSections = guideSections.map((s) => ({ id: s.id, title: s.title }));
  const tocSections = [...navSections, { id: 'checklist', title: '자가진단' }, { id: 'timeline', title: '입법 경과' }];

  return (
    <div className="docs-layout">
      {/* Left sidebar */}
      <aside className="docs-sidebar sticky top-14 h-[calc(100vh-56px)] overflow-y-auto border-r p-5" style={{ borderColor: 'var(--color-border)' }}>
        <h2 className="mb-4 text-sm font-bold" style={{ color: 'var(--grey-500)' }}>해석지침</h2>
        <GuideScrollTracker sections={navSections} />
        <div className="mt-6 border-t pt-4" style={{ borderColor: 'var(--color-border)' }}>
          <a href="#checklist" className="toc-link flex items-center gap-2">
            <ListChecks size={14} />
            자가진단
          </a>
        </div>
      </aside>

      {/* Main content */}
      <article className="content-body mx-auto max-w-none px-6 py-10 md:px-10" style={{ maxWidth: '720px' }}>
        <h1 className="mb-2 font-bold" style={{ fontSize: 'var(--text-2xl)', color: 'var(--grey-900)' }}>
          개정 노동조합법 해석지침
        </h1>
        <p className="mb-10 text-sm" style={{ color: 'var(--grey-500)' }}>
          고용노동부 발표 기준 | 2026.3.10. 시행
        </p>

        {guideSections.map((section) => (
          <section key={section.id} id={section.id} className="mb-16">
            <h2 className="mb-1 font-bold" style={{ fontSize: 'var(--text-xl)', color: 'var(--grey-900)' }}>
              {section.title}
            </h2>
            {section.subtitle && (
              <p className="mb-6 text-sm" style={{ color: 'var(--grey-500)' }}>{section.subtitle}</p>
            )}

            {section.blocks.map((block, i) => {
              switch (block.type) {
                case 'paragraph':
                  return <p key={i} className="my-4 text-[15px] leading-relaxed" style={{ color: 'var(--grey-700)' }}>{block.text}</p>;
                case 'article':
                  return <ArticleCard key={i} label={block.label} text={block.text} />;
                case 'case':
                  return <CaseCard key={i} caseNumber={block.caseNumber} court={block.court} summary={block.summary} />;
                case 'comparison':
                  return <ComparisonTable key={i} title={block.title} before={block.before} after={block.after} />;
                case 'note':
                  return <CalloutBox key={i} variant={block.variant} text={block.text} />;
                case 'definition':
                  return (
                    <div key={i} className="my-6 rounded-xl border p-5" style={{ backgroundColor: 'var(--grey-50)', borderColor: 'var(--grey-200)' }}>
                      <div className="mb-3 flex items-center gap-2">
                        <BookOpen size={16} style={{ color: 'var(--grey-500)' }} />
                        <span className="text-sm font-bold" style={{ color: 'var(--grey-700)' }}>{block.term}</span>
                      </div>
                      <p className="text-[15px] leading-relaxed">{block.text}</p>
                    </div>
                  );
                case 'criteria':
                  return (
                    <div key={i} className="my-6 rounded-xl border bg-white p-5" style={{ borderColor: 'var(--grey-200)' }}>
                      <div className="mb-3 flex items-center gap-2">
                        <ListChecks size={16} style={{ color: '#059669' }} />
                        <span className="text-sm font-bold" style={{ color: '#166534' }}>{block.title}</span>
                      </div>
                      <ol className="list-none space-y-3">
                        {block.items.map((item, j) => (
                          <li key={j} className="flex gap-3 text-[15px]">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: '#ecfdf5', color: '#059669' }}>{j + 1}</span>
                            <span style={{ color: 'var(--grey-700)' }}>{item}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  );
                case 'ox':
                  return (
                    <div key={i} className="my-6 space-y-3">
                      <h4 className="font-bold" style={{ color: 'var(--grey-800)' }}>{block.title}</h4>
                      {block.items.map((item, j) => (
                        <div key={j} className="rounded-xl border p-5" style={{ borderColor: 'var(--grey-200)', backgroundColor: 'var(--color-bg-surface)' }}>
                          <p className="mb-2 font-medium" style={{ color: 'var(--grey-800)' }}>{item.question}</p>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full px-3 py-1 text-sm font-bold text-white" style={{ backgroundColor: item.answer ? '#059669' : '#ef4444' }}>
                              {item.answer ? 'O' : 'X'}
                            </span>
                            <span className="text-sm" style={{ color: 'var(--grey-600)' }}>{item.explanation}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                default:
                  return null;
              }
            })}
          </section>
        ))}

        {/* Checklist */}
        <section id="checklist" className="mb-16">
          <h2 className="mb-6 font-bold" style={{ fontSize: 'var(--text-xl)', color: 'var(--grey-900)' }}>
            자가진단 체크리스트
          </h2>
          <Link
            href="/checklist"
            className="flex items-center justify-between rounded-xl border p-5 transition-colors hover:bg-[var(--grey-50)]"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div>
              <p className="font-bold" style={{ color: 'var(--grey-900)' }}>교섭 의무 · 사용자성 자가진단</p>
              <p className="text-sm" style={{ color: 'var(--grey-500)' }}>체크리스트로 귀사의 교섭 의무 가능성을 진단해 보세요</p>
            </div>
            <span style={{ color: 'var(--color-accent)' }}>→</span>
          </Link>
        </section>

        {/* Timeline */}
        <section id="timeline" className="mb-16">
          <h2 className="mb-6 font-bold" style={{ fontSize: 'var(--text-xl)', color: 'var(--grey-900)' }}>
            입법 경과
          </h2>
          <div className="relative pl-8">
            <div className="absolute left-3 top-2 bottom-2 w-0.5" style={{ backgroundColor: 'var(--grey-200)' }} />
            {timeline.map((t, i) => (
              <div key={i} className="relative mb-4 flex items-start gap-4">
                <div
                  className="absolute left-[-22px] mt-1.5 h-3 w-3 rounded-full border-2"
                  style={{
                    borderColor: (t as { highlight?: boolean }).highlight ? 'var(--color-accent)' : 'var(--grey-300)',
                    backgroundColor: (t as { highlight?: boolean }).highlight ? 'var(--color-accent)' : 'var(--color-bg-surface)',
                  }}
                />
                <span className="shrink-0 text-sm font-mono font-bold" style={{ color: (t as { highlight?: boolean }).highlight ? 'var(--color-accent)' : 'var(--grey-500)', minWidth: '80px' }}>{t.date}</span>
                <span className="text-[15px]" style={{ color: 'var(--grey-700)', fontWeight: (t as { highlight?: boolean }).highlight ? 700 : 400 }}>{t.event}</span>
              </div>
            ))}
          </div>
        </section>
      </article>

      {/* Right TOC */}
      <aside className="docs-toc sticky top-14 hidden h-[calc(100vh-56px)] overflow-y-auto p-5 xl:block">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--grey-400)' }}>목차</h3>
        <GuideScrollTracker sections={tocSections} />
      </aside>
    </div>
  );
}
