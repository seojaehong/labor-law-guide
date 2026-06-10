'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, BookOpen, Sparkles, ListChecks, Copy, Check } from 'lucide-react';
import { META, BLOCKS, SLIDES, WORKBOOK, PROMPTS } from './data';

type Tab = 'slides' | 'workbook' | 'prompts';

export default function LectureIsanPage() {
  const [tab, setTab] = useState<Tab>('slides');
  const [slideIdx, setSlideIdx] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const goPrev = useCallback(() => setSlideIdx((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setSlideIdx((i) => Math.min(SLIDES.length - 1, i + 1)), []);

  useEffect(() => {
    if (tab !== 'slides') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault(); goNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault(); goPrev();
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === 'Escape' && fullscreen) {
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab, goNext, goPrev, fullscreen]);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
      setFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setFullscreen(false);
    }
  }

  async function copyPrompt(id: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  const slide = SLIDES[slideIdx];
  const block = BLOCKS.find((b) => b.idx === slide.block);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* 헤더 */}
      <header className="mb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{META.title}</h1>
            <p className="text-sm text-muted-foreground mt-1">{META.subtitle}</p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div>{META.org} · {META.date}</div>
            <div>{META.speaker}</div>
            <div>{META.duration}</div>
          </div>
        </div>
      </header>

      {/* 탭 */}
      <nav className="flex gap-2 border-b mb-6" style={{ borderColor: 'var(--color-border)' }}>
        <TabBtn active={tab === 'slides'} onClick={() => setTab('slides')} icon={<Sparkles size={14} />} label={`슬라이드 (${SLIDES.length})`} />
        <TabBtn active={tab === 'workbook'} onClick={() => setTab('workbook')} icon={<BookOpen size={14} />} label={`워크북 (${WORKBOOK.length})`} />
        <TabBtn active={tab === 'prompts'} onClick={() => setTab('prompts')} icon={<ListChecks size={14} />} label={`프롬프트 (${PROMPTS.length})`} />
      </nav>

      {/* 슬라이드 */}
      {tab === 'slides' && (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded bg-muted px-2 py-1 font-semibold">Block {block?.idx} · {block?.minutes}'</span>
            <span className="text-muted-foreground">{block?.title}</span>
            <span className="ml-auto text-muted-foreground">{slideIdx + 1} / {SLIDES.length}</span>
            <button onClick={toggleFullscreen} className="rounded border px-2 py-1 text-xs" style={{ borderColor: 'var(--color-border)' }}>
              {fullscreen ? <Minimize2 size={12} className="inline mr-1" /> : <Maximize2 size={12} className="inline mr-1" />}
              {fullscreen ? 'Exit' : 'Full'} (F)
            </button>
          </div>

          {/* 슬라이드 본체 */}
          <article className="rounded-2xl border p-8 sm:p-12 min-h-[60vh] flex flex-col"
                   style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
            <h2 className="text-3xl sm:text-4xl font-bold leading-tight mb-3">{slide.title}</h2>
            {slide.subtitle && (
              <p className="text-lg text-muted-foreground mb-6">{slide.subtitle}</p>
            )}
            {slide.bullets && slide.bullets.length > 0 && (
              <ul className="space-y-3 text-lg sm:text-xl mb-6">
                {slide.bullets.map((b, i) => (
                  <li key={i} className="flex gap-3">
                    <span style={{ color: 'var(--color-accent)' }}>▸</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
            {slide.callout && (
              <div className="mt-auto rounded-xl border-l-4 p-4 text-base"
                   style={{ borderLeftColor: 'var(--color-accent)', backgroundColor: 'var(--color-bg)' }}>
                <strong>💡 </strong>{slide.callout}
              </div>
            )}
            {slide.demo && (
              <div className="mt-6 space-y-3 text-sm">
                {slide.demo.prompt && (
                  <div className="rounded-lg border p-4 font-mono text-[13px] whitespace-pre-wrap"
                       style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
                    <div className="text-[10px] font-bold text-muted-foreground mb-1">PROMPT</div>
                    {slide.demo.prompt}
                  </div>
                )}
                {slide.demo.result && (
                  <div className="text-[13px] text-muted-foreground whitespace-pre-wrap">
                    → {slide.demo.result}
                  </div>
                )}
              </div>
            )}
            {slide.speakerNote && (
              <details className="mt-6 text-xs text-muted-foreground">
                <summary className="cursor-pointer">강사 노트</summary>
                <p className="mt-2 italic">{slide.speakerNote}</p>
              </details>
            )}
          </article>

          {/* 네비 */}
          <div className="mt-4 flex items-center gap-2">
            <button onClick={goPrev} disabled={slideIdx === 0}
                    className="rounded-lg border px-4 py-2 text-sm disabled:opacity-30"
                    style={{ borderColor: 'var(--color-border)' }}>
              <ChevronLeft size={14} className="inline" /> 이전
            </button>
            <button onClick={goNext} disabled={slideIdx === SLIDES.length - 1}
                    className="rounded-lg border px-4 py-2 text-sm disabled:opacity-30"
                    style={{ borderColor: 'var(--color-border)' }}>
              다음 <ChevronRight size={14} className="inline" />
            </button>
            <span className="ml-3 text-xs text-muted-foreground">키: ← → Space · F=풀스크린</span>
          </div>

          {/* 미니맵 */}
          <div className="mt-6 flex flex-wrap gap-1">
            {SLIDES.map((s, i) => (
              <button key={s.id} onClick={() => setSlideIdx(i)}
                      title={`${i + 1}. ${s.title}`}
                      className={`h-2 w-8 rounded ${i === slideIdx ? '' : 'opacity-30'}`}
                      style={{ backgroundColor: 'var(--color-accent)' }} />
            ))}
          </div>
        </div>
      )}

      {/* 워크북 */}
      {tab === 'workbook' && (
        <div className="space-y-6">
          {WORKBOOK.map((wb) => (
            <article key={wb.id} className="rounded-xl border p-6" style={{ borderColor: 'var(--color-border)' }}>
              <h3 className="text-lg font-bold mb-3">{wb.title}</h3>
              <ol className="space-y-2 mb-4 text-sm">
                {wb.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
              <div className="text-xs text-muted-foreground rounded bg-muted px-3 py-2">
                <strong>산출:</strong> {wb.output}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* 프롬프트 */}
      {tab === 'prompts' && (
        <div className="space-y-3">
          {PROMPTS.map((p) => (
            <article key={p.id} className="rounded-lg border p-4" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-semibold">{p.tag}</span>
                <button onClick={() => copyPrompt(p.id, p.text)}
                        className="rounded border px-2 py-1 text-xs flex items-center gap-1"
                        style={{ borderColor: 'var(--color-border)' }}>
                  {copiedId === p.id ? <><Check size={12} /> 복사됨</> : <><Copy size={12} /> 복사</>}
                </button>
              </div>
              <pre className="whitespace-pre-wrap text-[13px] font-mono leading-relaxed">{p.text}</pre>
            </article>
          ))}
        </div>
      )}

      <footer className="mt-12 pt-6 border-t text-center text-xs text-muted-foreground" style={{ borderColor: 'var(--color-border)' }}>
        {META.speaker} · {META.org} · {META.date}
        <div className="mt-1">노란봉투법 가이드 · yellowenvelope.kr</div>
      </footer>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick}
            className={`flex items-center gap-1 px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${active ? 'border-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
      {icon} {label}
    </button>
  );
}
