'use client';

import { useState } from 'react';
import ChatInterface from '@/components/ChatInterface';
import { glossary } from '@/content/checklist-data';
import { qaDatabase } from '@/content/ai-knowledge';
import { Search, BookOpen, MessageCircleQuestion } from 'lucide-react';

const categories = ['전체', '일반', '사용자성', '교섭절차', '노동쟁의', '실무'] as const;

export default function AIPage() {
  const [tab, setTab] = useState<'chat' | 'faq' | 'glossary'>('chat');
  const [faqFilter, setFaqFilter] = useState<string>('전체');
  const [pendingQuestion, setPendingQuestion] = useState<string | undefined>();

  const filteredFaq = faqFilter === '전체' ? qaDatabase : qaDatabase.filter((q) => q.category === faqFilter);

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-10">
      <h1 className="mb-2 font-bold" style={{ fontSize: 'var(--text-2xl)', color: 'var(--grey-900)' }}>
        AI 상담 & 참고자료
      </h1>
      <p className="mb-8 text-sm" style={{ color: 'var(--grey-500)' }}>
        개정 노동조합법에 대한 궁금증을 AI가 답변해 드립니다 | 노무법인 위너스
      </p>

      {/* Tabs */}
      <div className="mb-6 flex gap-2" role="tablist" aria-label="AI 상담 메뉴">
        {[
          { key: 'chat' as const, label: 'AI 채팅', icon: Search },
          { key: 'faq' as const, label: `FAQ (${qaDatabase.length})`, icon: MessageCircleQuestion },
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
            {qaDatabase.slice(0, 6).map((qa) => (
              <button
                key={qa.id}
                className="w-full rounded-xl border p-4 text-left transition-colors hover:bg-[var(--grey-50)]"
                style={{ borderColor: 'var(--color-border)' }}
                onClick={() => setPendingQuestion(qa.question + '_' + Date.now())}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: 'var(--blue-50)', color: 'var(--blue-600)' }}>{qa.category}</span>
                </div>
                <p className="text-sm font-medium" style={{ color: 'var(--grey-800)' }}>{qa.question}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === 'faq' && (
        <div id="ai-tabpanel-faq" role="tabpanel" className="max-w-[800px]">
          {/* Category filter */}
          <div className="mb-6 flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setFaqFilter(cat)}
                className="rounded-full px-3 py-1 text-sm transition-colors"
                style={{
                  backgroundColor: faqFilter === cat ? 'var(--color-accent)' : 'var(--grey-100)',
                  color: faqFilter === cat ? 'white' : 'var(--grey-600)',
                }}
              >
                {cat} {cat !== '전체' && `(${qaDatabase.filter((q) => q.category === cat).length})`}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {filteredFaq.map((qa) => (
              <div key={qa.id} className="rounded-xl border p-6" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: 'var(--blue-50)', color: 'var(--blue-600)' }}>{qa.category}</span>
                  {qa.relatedArticle && <span className="text-xs" style={{ color: 'var(--grey-400)' }}>{qa.relatedArticle}</span>}
                </div>
                <h3 className="mb-3 font-bold" style={{ color: 'var(--grey-900)' }}>{qa.question}</h3>
                <div className="whitespace-pre-line text-[15px] leading-relaxed" style={{ color: 'var(--grey-600)' }}>{qa.answer}</div>
              </div>
            ))}
          </div>
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
