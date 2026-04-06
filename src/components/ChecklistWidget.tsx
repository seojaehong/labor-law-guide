'use client';

import { useState } from 'react';
import { AlertTriangle, Shield, ShieldCheck } from 'lucide-react';
import type { ChecklistItem, ChecklistResult } from '@/content/checklist-data';

type Answer = '상' | '중' | '하' | 'none';

interface ChecklistWidgetProps {
  title: string;
  description: string;
  items: ChecklistItem[];
  results: ChecklistResult[];
}

const SCORE_MAP: Record<Answer, Record<ChecklistItem['weight'], number>> = {
  '상': { high: 3, medium: 2, low: 1 },
  '중': { high: 2, medium: 1.5, low: 1 },
  '하': { high: 1, medium: 0.5, low: 0.5 },
  'none': { high: 0, medium: 0, low: 0 },
};

const ANSWER_OPTIONS: { value: Answer; label: string; color: string; activeBg: string; activeText: string }[] = [
  { value: '상', label: '명확히 해당', color: 'var(--grey-400)', activeBg: '#dc2626', activeText: '#fff' },
  { value: '중', label: '어느 정도 해당', color: 'var(--grey-400)', activeBg: '#f59e0b', activeText: '#fff' },
  { value: '하', label: '약간 해당', color: 'var(--grey-400)', activeBg: '#3b82f6', activeText: '#fff' },
  { value: 'none', label: '해당없음', color: 'var(--grey-400)', activeBg: 'var(--grey-200)', activeText: 'var(--grey-600)' },
];

export default function ChecklistWidget({ title, description, items, results }: ChecklistWidgetProps) {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [showResult, setShowResult] = useState(false);

  function setAnswer(id: string, value: Answer) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    setShowResult(false);
  }

  function getMaxScore() {
    return items.reduce((sum, item) => sum + SCORE_MAP['상'][item.weight], 0);
  }

  function getScore() {
    let score = 0;
    for (const item of items) {
      const ans = answers[item.id];
      if (ans) score += SCORE_MAP[ans][item.weight];
    }
    return score;
  }

  function getPercent() {
    const max = getMaxScore();
    if (max === 0) return 0;
    return Math.round((getScore() / max) * 100);
  }

  function getResult() {
    const pct = getPercent();
    return results.find((r) => pct >= r.minScore && pct <= r.maxScore) || results[0];
  }

  const answeredCount = Object.keys(answers).length;
  const totalCount = items.length;
  const categories = [...new Set(items.map((i) => i.category))];
  const result = getResult();
  const percent = getPercent();

  const levelIcons = { low: Shield, medium: AlertTriangle, high: ShieldCheck };
  const levelColors = {
    low: { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' },
    medium: { bg: '#fef3c7', border: '#fde68a', text: '#92400e' },
    high: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
  };

  return (
    <div className="rounded-2xl border p-6" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
      <h3 className="mb-1 text-lg font-bold" style={{ color: 'var(--grey-900)' }}>{title}</h3>
      <p className="mb-2 text-sm" style={{ color: 'var(--grey-500)' }}>{description}</p>

      {/* 진행률 */}
      <div className="mb-6 flex items-center gap-3">
        <div className="h-2 flex-1 rounded-full" style={{ backgroundColor: 'var(--grey-100)' }} role="progressbar" aria-valuenow={answeredCount} aria-valuemin={0} aria-valuemax={totalCount} aria-label={`${answeredCount}/${totalCount} 응답 완료`}>
          <div
            className="h-2 rounded-full transition-all"
            style={{ width: `${(answeredCount / totalCount) * 100}%`, backgroundColor: 'var(--color-accent)' }}
          />
        </div>
        <span className="shrink-0 text-xs font-medium" style={{ color: 'var(--grey-500)' }}>
          {answeredCount}/{totalCount} 응답
        </span>
      </div>

      {categories.map((cat) => (
        <div key={cat} className="mb-5">
          <h4 className="mb-2 text-sm font-bold" style={{ color: 'var(--grey-600)' }}>{cat}</h4>
          <div className="space-y-3">
            {items.filter((i) => i.category === cat).map((item) => (
              <CheckItemRow key={item.id} item={item} selected={answers[item.id] ?? null} onSelect={(v) => setAnswer(item.id, v)} />
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
              <span className="text-sm font-medium" style={{ color: 'var(--grey-600)' }}>종합 점수</span>
              <span className="text-2xl font-bold" style={{ color: levelColors[result.level].text }}>
                {percent}%
              </span>
            </div>
            <div className="h-3 w-full rounded-full" style={{ backgroundColor: 'var(--grey-100)' }}>
              <div
                className="h-3 rounded-full transition-all"
                style={{
                  width: `${percent}%`,
                  backgroundColor: levelColors[result.level].text,
                }}
              />
            </div>
            <div className="mt-1 text-right text-xs" style={{ color: 'var(--grey-400)' }}>
              {getScore().toFixed(1)} / {getMaxScore()} 점
            </div>
          </div>

          {/* 결과 카드 */}
          <div className="rounded-xl border-l-4 p-5" style={{ backgroundColor: levelColors[result.level].bg, borderLeftColor: levelColors[result.level].border }}>
            <div className="mb-2 flex items-center gap-2">
              {(() => { const Icon = levelIcons[result.level]; return <Icon size={18} style={{ color: levelColors[result.level].text }} />; })()}
              <span className="font-bold" style={{ color: levelColors[result.level].text }}>{result.title}</span>
            </div>
            <p className="mb-2 text-[15px]" style={{ color: 'var(--grey-700)' }}>{result.description}</p>
            <p className="text-sm" style={{ color: 'var(--grey-500)' }}>{result.recommendation}</p>
            <div className="mt-4 text-center">
              <a
                href="/contact"
                className="inline-flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium text-white"
                style={{ backgroundColor: 'var(--color-accent)' }}
              >
                전문가 상담 문의하기
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CheckItemRow({ item, selected, onSelect }: { item: ChecklistItem; selected: Answer | null; onSelect: (v: Answer) => void }) {
  const weightBadge = {
    high: { bg: '#fef2f2', text: '#991b1b', label: '중요' },
    medium: { bg: '#fef3c7', text: '#92400e', label: '보통' },
    low: { bg: 'var(--grey-100)', text: 'var(--grey-600)', label: '참고' },
  };
  const badge = weightBadge[item.weight];

  return (
    <div className="rounded-lg p-3" style={{ backgroundColor: selected ? 'var(--grey-50)' : 'transparent' }}>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[15px]" style={{ color: 'var(--grey-900)' }}>{item.question}</span>
        <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: badge.bg, color: badge.text }}>{badge.label}</span>
      </div>
      <div className="mb-1 text-xs" style={{ color: 'var(--grey-400)' }}>{item.helpText}</div>
      <div className="flex gap-1.5">
        {ANSWER_OPTIONS.map((opt) => {
          const isActive = selected === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onSelect(opt.value)}
              aria-pressed={isActive}
              className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
              style={{
                backgroundColor: isActive ? opt.activeBg : 'var(--grey-100)',
                color: isActive ? opt.activeText : opt.color,
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
