'use client';

import { useState } from 'react';
import { CheckCircle, Circle, AlertTriangle, Shield, ShieldCheck } from 'lucide-react';
import type { ChecklistItem, ChecklistResult } from '@/content/checklist-data';

interface ChecklistWidgetProps {
  title: string;
  description: string;
  items: ChecklistItem[];
  results: ChecklistResult[];
}

export default function ChecklistWidget({ title, description, items, results }: ChecklistWidgetProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [showResult, setShowResult] = useState(false);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setShowResult(false);
  }

  function getScore() {
    let score = 0;
    for (const item of items) {
      if (checked.has(item.id)) {
        score += item.weight === 'high' ? 2 : item.weight === 'medium' ? 1 : 0.5;
      }
    }
    return Math.round(score);
  }

  function getResult() {
    const score = getScore();
    return results.find((r) => score >= r.minScore && score <= r.maxScore) || results[0];
  }

  const categories = [...new Set(items.map((i) => i.category))];
  const result = getResult();

  const levelIcons = { low: Shield, medium: AlertTriangle, high: ShieldCheck };
  const levelColors = {
    low: { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' },
    medium: { bg: '#fef3c7', border: '#fde68a', text: '#92400e' },
    high: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
  };

  return (
    <div className="rounded-2xl border p-6" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
      <h3 className="mb-1 text-lg font-bold" style={{ color: 'var(--grey-900)' }}>{title}</h3>
      <p className="mb-6 text-sm" style={{ color: 'var(--grey-500)' }}>{description}</p>

      {categories.map((cat) => (
        <div key={cat} className="mb-5">
          <h4 className="mb-2 text-sm font-bold" style={{ color: 'var(--grey-600)' }}>{cat}</h4>
          <div className="space-y-2">
            {items.filter((i) => i.category === cat).map((item) => (
              <CheckItem key={item.id} item={item} isChecked={checked.has(item.id)} onToggle={() => toggle(item.id)} />
            ))}
          </div>
        </div>
      ))}

      <button
        onClick={() => setShowResult(true)}
        className="mt-4 w-full rounded-lg py-3 font-medium text-white"
        style={{ backgroundColor: 'var(--color-accent)' }}
      >
        진단 결과 보기
      </button>

      {showResult && (
        <div className="mt-4 rounded-xl border-l-4 p-5" style={{ backgroundColor: levelColors[result.level].bg, borderLeftColor: levelColors[result.level].border }}>
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
      )}
    </div>
  );
}

function CheckItem({ item, isChecked, onToggle }: { item: ChecklistItem; isChecked: boolean; onToggle: () => void }) {
  const weightBadge = {
    high: { bg: '#fef2f2', text: '#991b1b', label: '중요' },
    medium: { bg: '#fef3c7', text: '#92400e', label: '보통' },
    low: { bg: 'var(--grey-100)', text: 'var(--grey-600)', label: '참고' },
  };
  const badge = weightBadge[item.weight];

  return (
    <button onClick={onToggle} className="flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors hover:bg-[var(--grey-50)]">
      {isChecked
        ? <CheckCircle size={20} className="mt-0.5 shrink-0" style={{ color: 'var(--color-accent)' }} />
        : <Circle size={20} className="mt-0.5 shrink-0" style={{ color: 'var(--grey-300)' }} />
      }
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[15px]" style={{ color: isChecked ? 'var(--grey-900)' : 'var(--grey-700)' }}>{item.question}</span>
          <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: badge.bg, color: badge.text }}>{badge.label}</span>
        </div>
        <span className="text-xs" style={{ color: 'var(--grey-400)' }}>{item.helpText}</span>
      </div>
    </button>
  );
}
