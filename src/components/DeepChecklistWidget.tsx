'use client';

import { useState } from 'react';
import { AlertTriangle, Shield, ShieldAlert, ShieldCheck, ShieldX, CheckCircle } from 'lucide-react';
import { deepChecklist, deepChecklistResults, deepChecklistTitle, deepChecklistDescription } from '@/content/checklist-data';
import type { DeepChecklistItem } from '@/content/checklist-data';

type Answer = 'full' | 'partial' | 'slight' | 'none';

const SCORE_MAP: Record<Answer, number> = {
  full: 1,
  partial: 0.7,
  slight: 0.3,
  none: 0,
};

const ANSWER_OPTIONS: { value: Answer; label: string; activeBg: string; activeText: string }[] = [
  { value: 'full', label: '명확히 해당', activeBg: '#dc2626', activeText: '#fff' },
  { value: 'partial', label: '어느 정도 해당', activeBg: '#f59e0b', activeText: '#fff' },
  { value: 'slight', label: '약간 해당', activeBg: '#3b82f6', activeText: '#fff' },
  { value: 'none', label: '해당없음', activeBg: 'var(--grey-200)', activeText: 'var(--grey-600)' },
];

const LEVEL_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  critical: { bg: '#fef2f2', border: '#f87171', text: '#991b1b' },
  high: { bg: '#fff1f2', border: '#fda4af', text: '#9f1239' },
  medium: { bg: '#fef3c7', border: '#fde68a', text: '#92400e' },
  caution: { bg: '#fefce8', border: '#fef08a', text: '#854d0e' },
  low: { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' },
  safe: { bg: '#ecfdf5', border: '#6ee7b7', text: '#065f46' },
};

export default function DeepChecklistWidget() {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [showResult, setShowResult] = useState(false);

  function setAnswer(id: string, value: Answer) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    setShowResult(false);
  }

  function getTotalScore() {
    let score = 0;
    for (const item of deepChecklist) {
      const ans = answers[item.id];
      if (ans) score += SCORE_MAP[ans];
    }
    return score;
  }

  function getResult() {
    const score = getTotalScore();
    return deepChecklistResults.find((r) => score >= r.minCount && score <= r.maxCount)
      || deepChecklistResults[deepChecklistResults.length - 1];
  }

  const answeredCount = Object.keys(answers).length;
  const totalCount = deepChecklist.length;
  const categories = [...new Set(deepChecklist.map((i) => i.category))];
  const result = getResult();
  const totalScore = getTotalScore();
  const style = LEVEL_STYLES[result.level] || LEVEL_STYLES.medium;

  return (
    <div className="rounded-2xl border p-6" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
      <h3 className="mb-1 text-lg font-bold" style={{ color: 'var(--grey-900)' }}>{deepChecklistTitle}</h3>
      <p className="mb-2 text-sm" style={{ color: 'var(--grey-500)' }}>{deepChecklistDescription}</p>

      {/* 진행률 */}
      <div className="mb-6 flex items-center gap-3">
        <div className="h-2 flex-1 rounded-full" style={{ backgroundColor: 'var(--grey-100)' }}>
          <div className="h-2 rounded-full transition-all" style={{ width: `${(answeredCount / totalCount) * 100}%`, backgroundColor: 'var(--color-accent)' }} />
        </div>
        <span className="shrink-0 text-xs font-medium" style={{ color: 'var(--grey-500)' }}>{answeredCount}/{totalCount} 응답</span>
      </div>

      {categories.map((cat) => (
        <div key={cat} className="mb-5">
          <h4 className="mb-2 text-sm font-bold" style={{ color: 'var(--grey-600)' }}>{cat}</h4>
          <div className="space-y-3">
            {deepChecklist.filter((i) => i.category === cat).map((item) => (
              <DeepCheckItemRow key={item.id} item={item} selected={answers[item.id] ?? null} onSelect={(v) => setAnswer(item.id, v)} />
            ))}
          </div>
        </div>
      ))}

      <button
        onClick={() => setShowResult(true)}
        disabled={answeredCount === 0}
        className="mt-4 w-full rounded-lg py-3 font-medium text-white disabled:opacity-40"
        style={{ backgroundColor: 'var(--color-accent)' }}
      >
        진단 결과 보기
      </button>

      {showResult && (
        <div className="mt-4 space-y-4">
          {/* 점수 게이지 */}
          <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)' }}>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-sm font-medium" style={{ color: 'var(--grey-600)' }}>환산 점수</span>
              <span className="text-2xl font-bold" style={{ color: style.text }}>
                {totalScore.toFixed(1)} / {totalCount}
              </span>
            </div>
            <div className="h-3 w-full rounded-full" style={{ backgroundColor: 'var(--grey-100)' }}>
              <div className="h-3 rounded-full transition-all" style={{ width: `${(totalScore / totalCount) * 100}%`, backgroundColor: style.text }} />
            </div>
            <div className="mt-1 text-right text-xs" style={{ color: 'var(--grey-400)' }}>
              4지선다 환산: 명확히=1, 어느정도=0.7, 약간=0.3, 해당없음=0
            </div>
          </div>

          {/* 결과 카드 */}
          <div className="rounded-xl border-l-4 p-5" style={{ backgroundColor: style.bg, borderLeftColor: style.border }}>
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-full px-2.5 py-1 text-xs font-bold text-white" style={{ backgroundColor: style.text }}>
                {result.tag}
              </span>
              <span className="font-bold" style={{ color: style.text }}>{result.title}</span>
            </div>
            <p className="mb-2 text-[15px]" style={{ color: 'var(--grey-700)' }}>{result.description}</p>
            <div className="mt-4 text-center">
              <a href="/contact" className="inline-flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ backgroundColor: 'var(--color-accent)' }}>
                전문가 상담 문의하기
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DeepCheckItemRow({ item, selected, onSelect }: { item: DeepChecklistItem; selected: Answer | null; onSelect: (v: Answer) => void }) {
  return (
    <div className="rounded-lg p-3" style={{ backgroundColor: selected ? 'var(--grey-50)' : 'transparent' }}>
      <div className="mb-1 text-[15px] font-medium" style={{ color: 'var(--color-text-primary)' }}>{item.question}</div>
      <div className="mb-2 text-xs" style={{ color: 'var(--color-text-primary)' }}>{item.helpText}</div>
      <div className="flex flex-wrap gap-1.5">
        {ANSWER_OPTIONS.map((opt) => {
          const isActive = selected === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onSelect(opt.value)}
              className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
              style={{
                backgroundColor: isActive ? opt.activeBg : 'var(--grey-100)',
                color: isActive ? opt.activeText : 'var(--grey-400)',
                border: isActive ? 'none' : '1px solid var(--grey-200)',
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
