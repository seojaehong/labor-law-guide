'use client';

import { useState, useEffect, useCallback } from 'react';
import ChatInterface from '@/components/ChatInterface';
import { glossary } from '@/content/checklist-data';
import { Search, BookOpen, MessageCircleQuestion, ChevronDown } from 'lucide-react';
import Link from 'next/link';

interface DbFaq {
  id: number;
  unified_category: string;
  question: string;
  answer: string;
}

const POPULAR_CATEGORIES = ['연차유급휴가', '퇴직금', '임금체불/지연이자', '해고/해고예고', '주휴수당', '통상임금'];

export default function AIPage() {
  const [tab, setTab] = useState<'chat' | 'faq' | 'glossary'>('chat');
  const [pendingQuestion, setPendingQuestion] = useState<string | undefined>();
  const [faqCategory, setFaqCategory] = useState<string | null>(null);
  const [faqSearch, setFaqSearch] = useState('');
  const [dbFaqs, setDbFaqs] = useState<DbFaq[]>([]);
  const [faqTotal, setFaqTotal] = useState(0);
  const [faqPage, setFaqPage] = useState(1);
  const [faqLoading, setFaqLoading] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [sidebarFaqs, setSidebarFaqs] = useState<DbFaq[]>([]);

  const fetchFaqs = useCallback(async (cat: string | null, q: string, page: number) => {
    setFaqLoading(true);
    try {
      const params = new URLSearchParams();
      if (cat) params.set('category', cat);
      if (q) params.set('q', q);
      params.set('page', String(page));
      params.set('size', '15');
      const res = await fetch(`/api/faq?${params}`);
      const data = await res.json();
      setDbFaqs(data.faqs || []);
      setFaqTotal(data.total || 0);
    } catch { /* keep existing */ }
    finally { setFaqLoading(false); }
  }, []);

  useEffect(() => {
    fetch('/api/faq?size=6').then(r => r.json()).then(d => setSidebarFaqs(d.faqs || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === 'faq') fetchFaqs(faqCategory, faqSearch, faqPage);
  }, [tab, faqCategory, faqPage, fetchFaqs]);

  const handleFaqSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFaqSearch(e.target.value);
    setFaqPage(1);
    const q = e.target.value;
    const timer = setTimeout(() => fetchFaqs(faqCategory, q, 1), 400);
    return () => clearTimeout(timer);
  }, [faqCategory, fetchFaqs]);

  const faqTotalPages = Math.max(1, Math.ceil(faqTotal / 15));

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-10">
      <h1 className="mb-2 font-bold" style={{ fontSize: 'var(--text-2xl)', color: 'var(--grey-900)' }}>
        AI 상담 & 참고자료
      </h1>
      <p className="mb-8 text-sm" style={{ color: 'var(--grey-500)' }}>
        노동법 전반에 대한 궁금증을 AI가 답변해 드립니다 | 노무법인 위너스
      </p>

      {/* Tabs */}
      <div className="mb-6 flex gap-2" role="tablist" aria-label="AI 상담 메뉴">
        {[
          { key: 'chat' as const, label: 'AI 채팅', icon: Search },
          { key: 'faq' as const, label: 'FAQ DB', icon: MessageCircleQuestion },
          { key: 'glossary' as const, label: '용어사전', icon: BookOpen },
        ].map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            aria-controls={`ai-tabpanel-${t.key}`}
            onClick={() => setTab(t.key)}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: tab === t.key ? 'var(--color-accent)' : 'var(--grey-100)',
              color: tab === t.key ? 'white' : 'var(--grey-600)',
            }}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      <div id="ai-tabpanel-chat" role="tabpanel" style={{ display: tab === 'chat' ? undefined : 'none' }}>
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <ChatInterface injectedQuestion={pendingQuestion} />
          <div className="space-y-4">
            <h3 className="text-sm font-bold" style={{ color: 'var(--grey-600)' }}>자주 묻는 질문</h3>
            {sidebarFaqs.map((qa) => (
              <button
                key={qa.id}
                className="w-full rounded-xl border p-4 text-left transition-colors hover:bg-[var(--grey-50)]"
                style={{ borderColor: 'var(--color-border)' }}
                onClick={() => setPendingQuestion(qa.question + '_' + Date.now())}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: 'var(--blue-50)', color: 'var(--blue-600)' }}>{qa.unified_category}</span>
                </div>
                <p className="text-sm font-medium" style={{ color: 'var(--grey-800)' }}>{qa.question}</p>
              </button>
            ))}
            <Link href="/faq" className="block text-center text-sm font-medium" style={{ color: 'var(--color-accent)' }}>
              전체 FAQ 보기 →
            </Link>
          </div>
        </div>
      </div>

      {tab === 'faq' && (
        <div id="ai-tabpanel-faq" role="tabpanel" className="max-w-[900px]">
          {/* Category filter */}
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              onClick={() => { setFaqCategory(null); setFaqPage(1); }}
              className="rounded-full px-3 py-1 text-sm transition-colors"
              style={{ backgroundColor: !faqCategory ? 'var(--color-accent)' : 'var(--grey-100)', color: !faqCategory ? 'white' : 'var(--grey-600)' }}
            >
              전체
            </button>
            {POPULAR_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => { setFaqCategory(cat); setFaqPage(1); }}
                className="rounded-full px-3 py-1 text-sm transition-colors"
                style={{ backgroundColor: faqCategory === cat ? 'var(--color-accent)' : 'var(--grey-100)', color: faqCategory === cat ? 'white' : 'var(--grey-600)' }}
              >
                {cat}
              </button>
            ))}
            <Link href="/faq" className="rounded-full px-3 py-1 text-sm" style={{ color: 'var(--color-accent)', backgroundColor: 'var(--blue-50)' }}>
              33개 전체 카테고리 →
            </Link>
          </div>

          {/* Search */}
          <div className="relative mb-6">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--grey-400)' }} />
            <input
              type="text"
              value={faqSearch}
              onChange={handleFaqSearch}
              placeholder="질문 또는 답변 검색..."
              className="w-full rounded-xl border py-2.5 pl-10 pr-4 text-[14px] outline-none focus:border-[var(--color-accent)]"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}
            />
          </div>

          {faqLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse rounded-xl border p-5" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="h-4 w-3/4 rounded" style={{ backgroundColor: 'var(--grey-100)' }} />
                </div>
              ))}
            </div>
          ) : dbFaqs.length === 0 ? (
            <div className="py-16 text-center" style={{ color: 'var(--color-text-tertiary)' }}>검색 결과가 없습니다.</div>
          ) : (
            <div className="space-y-2">
              {dbFaqs.map((faq) => (
                <div key={faq.id} className="rounded-xl border overflow-hidden" style={{ borderColor: expandedFaq === faq.id ? 'var(--color-accent)' : 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
                  <button onClick={() => setExpandedFaq(expandedFaq === faq.id ? null : faq.id)} className="flex w-full items-start gap-3 p-5 text-left">
                    <span className="mt-0.5 shrink-0 text-sm font-bold" style={{ color: 'var(--color-accent)' }}>Q</span>
                    <div className="flex-1">
                      <div className="text-[14px] font-medium" style={{ color: 'var(--color-text-primary)' }}>{faq.question}</div>
                      <span className="mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: 'var(--blue-50)', color: 'var(--blue-600)' }}>{faq.unified_category}</span>
                    </div>
                    <ChevronDown size={16} className="mt-0.5 shrink-0 transition-transform" style={{ color: 'var(--grey-400)', transform: expandedFaq === faq.id ? 'rotate(180deg)' : undefined }} />
                  </button>
                  {expandedFaq === faq.id && (
                    <div className="border-t px-5 py-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--grey-50)' }}>
                      <div className="flex gap-3">
                        <span className="mt-0.5 shrink-0 text-sm font-bold" style={{ color: '#059669' }}>A</span>
                        <div className="whitespace-pre-line text-[14px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{faq.answer}</div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {faqTotalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <button disabled={faqPage <= 1} onClick={() => setFaqPage(faqPage - 1)} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40" style={{ borderColor: 'var(--color-border)' }}>이전</button>
              <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{faqPage} / {faqTotalPages}</span>
              <button disabled={faqPage >= faqTotalPages} onClick={() => setFaqPage(faqPage + 1)} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40" style={{ borderColor: 'var(--color-border)' }}>다음</button>
            </div>
          )}
        </div>
      )}

      {tab === 'glossary' && (
        <div id="ai-tabpanel-glossary" role="tabpanel" className="max-w-[800px]">
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
            {glossary.map((item, i) => (
              <div
                key={i}
                className="flex gap-4 border-b p-5 last:border-b-0"
                style={{ borderColor: 'var(--color-border)', backgroundColor: i % 2 === 0 ? 'var(--color-bg-surface)' : 'var(--grey-50)' }}
              >
                <span className="shrink-0 font-bold" style={{ color: 'var(--blue-600)', minWidth: '140px', fontSize: 'var(--text-sm)' }}>{item.term}</span>
                <span className="text-[15px]" style={{ color: 'var(--grey-700)' }}>{item.definition}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
