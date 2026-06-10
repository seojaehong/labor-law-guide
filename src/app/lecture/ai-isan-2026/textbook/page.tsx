'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronUp, BookOpen, Menu, X, Download, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { CHAPTERS, CONTENT, TEXTBOOK_META } from './content';

export default function TextbookPage() {
  const [tocOpen, setTocOpen] = useState(false);
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 800);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function scrollTo(anchor: string) {
    const el = document.getElementById(anchor);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTocOpen(false);
    }
  }

  function downloadMd() {
    const blob = new Blob([CONTENT], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '노무사를_위한_Claude_Codex_실전.md';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="relative">
      {/* 상단 바 */}
      <header className="sticky top-0 z-30 border-b backdrop-blur"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'color-mix(in srgb, var(--color-bg) 92%, transparent)' }}>
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center gap-3">
          <Link href="/lecture/ai-isan-2026" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft size={14} /> 강의 슬라이드
          </Link>
          <div className="ml-2 flex-1">
            <h1 className="text-sm font-bold flex items-center gap-1">
              <BookOpen size={14} /> {TEXTBOOK_META.title} <span className="text-muted-foreground font-normal">— 교재</span>
            </h1>
          </div>
          <button onClick={downloadMd} className="text-xs flex items-center gap-1 rounded border px-2 py-1"
                  style={{ borderColor: 'var(--color-border)' }}>
            <Download size={12} /> MD
          </button>
          <button onClick={() => setTocOpen(!tocOpen)} className="text-xs flex items-center gap-1 rounded border px-2 py-1 lg:hidden"
                  style={{ borderColor: 'var(--color-border)' }}>
            {tocOpen ? <X size={12} /> : <Menu size={12} />} 목차
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 grid lg:grid-cols-[260px_minmax(0,1fr)] gap-6">
        {/* TOC 사이드바 */}
        <aside className={`${tocOpen ? 'block' : 'hidden lg:block'} lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-6rem)] overflow-y-auto`}>
          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--color-border)' }}>
            <h2 className="text-xs font-bold mb-2 text-muted-foreground">목차</h2>
            <nav className="space-y-1">
              {CHAPTERS.map((c) => (
                <button key={c.id} onClick={() => scrollTo(c.anchor)}
                        className="block w-full text-left text-xs py-1.5 px-2 rounded hover:bg-muted">
                  {c.title}
                </button>
              ))}
            </nav>
          </div>
          <div className="mt-3 rounded-lg border p-3 text-xs text-muted-foreground" style={{ borderColor: 'var(--color-border)' }}>
            <div className="mb-1"><strong>{TEXTBOOK_META.author}</strong></div>
            <div>{TEXTBOOK_META.org} · {TEXTBOOK_META.date}</div>
            <div className="mt-2 text-[10px]">{TEXTBOOK_META.pages}</div>
            <div className="mt-1 text-[10px]">{TEXTBOOK_META.version}</div>
          </div>
        </aside>

        {/* 본문 */}
        <article className="prose prose-zinc dark:prose-invert max-w-none prose-headings:scroll-mt-20
                            prose-h1:text-3xl prose-h1:font-bold prose-h1:mt-12 prose-h1:mb-6
                            prose-h2:text-2xl prose-h2:font-bold prose-h2:mt-10 prose-h2:mb-4
                            prose-h3:text-lg prose-h3:font-semibold prose-h3:mt-6 prose-h3:mb-3
                            prose-p:leading-relaxed prose-li:leading-relaxed
                            prose-table:text-sm prose-th:bg-muted prose-th:px-3 prose-th:py-2
                            prose-td:px-3 prose-td:py-2 prose-td:border-t
                            prose-blockquote:border-l-primary prose-blockquote:bg-muted/30 prose-blockquote:py-2 prose-blockquote:px-4
                            prose-code:bg-muted prose-code:px-1 prose-code:rounded prose-code:text-[13px]
                            prose-hr:my-12">
          <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml={false}
                         components={{
                           // a 태그가 anchor id 역할도 함
                           a: ({ node, ...props }) =>
                             props.id ? <a id={props.id} {...props} /> : <a {...props} target="_blank" rel="noopener noreferrer" />,
                         }}>
            {CONTENT}
          </ReactMarkdown>
        </article>
      </div>

      {/* 맨 위로 */}
      {showTop && (
        <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="fixed bottom-5 right-5 z-40 rounded-full p-3 shadow-lg"
                style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}
                aria-label="맨 위로">
          <ChevronUp size={20} />
        </button>
      )}
    </div>
  );
}
