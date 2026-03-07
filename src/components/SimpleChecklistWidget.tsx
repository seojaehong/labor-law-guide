'use client';

import { useState } from 'react';
import { AlertTriangle, Shield, ShieldCheck } from 'lucide-react';
import type { ChecklistItem, ChecklistResult } from '@/content/checklist-data';

interface SimpleChecklistWidgetProps {
  title: string;
  description: string;
  items: ChecklistItem[];
  results: ChecklistResult[];
}

export default function SimpleChecklistWidget({ title, description, items, results }: SimpleChecklistWidgetProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [showResult, setShowResult] = useState(false);

  function toggle(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
    setShowResult(false);
  }

  function getMaxScore() {
    return items.reduce((sum, item) => sum + ({ high: 3, medium: 2, low: 1 }[item.weight]), 0);
  }

  function getScore() {
    let score = 0;
    for (const item of items) {
      if (checked[item.id]) score += { high: 3, medium: 2, low: 1 }[item.weight];
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

  const checkedCount = Object.values(checked).filter(Boolean).length;
  const totalCount = items.length;
  const categories = [...new Set(items.map((i) => i.category))];
  const result = getResult();
  const percent = getPercent();

  const levelColors = {
    low: { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' },
    medium: { bg: '#fef3c7', border: '#fde68a', text: '#92400e' },
    high: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
  };
  const levelIcons = { low: Shield, medium: AlertTriangle, high: ShieldCheck };

  return (
    <div className="rounded-2xl border p-6" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
      <h3 className="mb-1 text-lg font-bold" style={{ color: 'var(--grey-900)' }}>{title}</h3>
      <p className="mb-2 text-sm" style={{ color: 'var(--grey-500)' }}>{description}</p>

      <div className="mb-6 flex items-center gap-3">
        <div className="h-2 flex-1 rounded-full" style={{ backgroundColor: 'var(--grey-100)' }}>
          <div className="h-2 rounded-full transition-all" style={{ width: `${(checkedCount / totalCount) * 100}%`, backgroundColor: 'var(--color-accent)' }} />
        </div>
        <span className="shrink-0 text-xs font-medium" style={{ color: 'var(--grey-500)' }}>{checkedCount}/{totalCount} 체크</span>
      </div>

      {categories.map((cat) => (
        <div key={cat} className="mb-5">
          <h4 className="mb-2 text-sm font-bold" style={{ color: 'var(--grey-600)' }}>{cat}</h4>
          <div className="space-y-2">
            {items.filter((i) => i.category === cat).map((item) => {
              const badge = { high: { bg: '#fef2f2', text: '#991b1b', label: '중요' }, medium: { bg: '#fef3c7', text: '#92400e', label: '보통' }, low: { bg: 'var(--grey-100)', text: 'var(--grey-600)', label: '참고' } }[item.weight];
              return (
                <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-lg p-3 transition-colors" style={{ backgroundColor: checked[item.id] ? 'var(--grey-50)' : 'transparent' }}>
                  <input type="checkbox" checked={!!checked[item.id]} onChange={() => toggle(item.id)} className="mt-0.5 h-4 w-4 rounded accent-blue-600" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px]" style={{ color: 'var(--grey-900)' }}>{item.question}</span>
                      <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: badge.bg, color: badge.text }}>{badge.label}</span>
                    </div>
                    <div className="mt-0.5 text-xs" style={{ color: 'var(--grey-400)' }}>{item.helpText}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      ))}

      <button onClick={() => setShowResult(true)} disabled={checkedCount === 0} className="mt-4 w-full rounded-lg py-3 font-medium text-white disabled:opacity-40" style={{ backgroundColor: 'var(--color-accent)' }}>
        진단 결과 보기
      </button>

      {showResult && (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)' }}>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-sm font-medium" style={{ color: 'var(--grey-600)' }}>종합 점수</span>
              <span className="text-2xl font-bold" style={{ color: levelColors[result.level].text }}>{percent}%</span>
            </div>
            <div className="h-3 w-full rounded-full" style={{ backgroundColor: 'var(--grey-100)' }}>
              <div className="h-3 rounded-full transition-all" style={{ width: `${percent}%`, backgroundColor: levelColors[result.level].text }} />
            </div>
            <div className="mt-1 text-right text-xs" style={{ color: 'var(--grey-400)' }}>{getScore()} / {getMaxScore()} 점</div>
          </div>

          <div className="rounded-xl border-l-4 p-5" style={{ backgroundColor: levelColors[result.level].bg, borderLeftColor: levelColors[result.level].border }}>
            <div className="mb-2 flex items-center gap-2">
              {(() => { const Icon = levelIcons[result.level]; return <Icon size={18} style={{ color: levelColors[result.level].text }} />; })()}
              <span className="font-bold" style={{ color: levelColors[result.level].text }}>{result.title}</span>
            </div>
            <p className="mb-2 text-[15px]" style={{ color: 'var(--grey-700)' }}>{result.description}</p>
            <p className="text-sm" style={{ color: 'var(--grey-500)' }}>{result.recommendation}</p>
            <div className="mt-4 text-center">
              <a href="/contact" className="inline-flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ backgroundColor: 'var(--color-accent)' }}>전문가 상담 문의하기</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
