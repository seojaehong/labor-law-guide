'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import type { Step } from '@/content/manual-data';

const actorColors: Record<string, { bg: string; text: string; border: string }> = {
  '하청노조': { bg: 'var(--blue-50)', text: 'var(--blue-700)', border: 'var(--blue-200)' },
  '원청사용자': { bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
  '노동위원회': { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0' },
  '노사': { bg: '#faf5ff', text: '#6b21a8', border: '#e9d5ff' },
};

export default function StepDiagram({ steps }: { steps: Step[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="relative">
      {/* 연결선 */}
      <div className="absolute left-[27px] top-8 bottom-8 w-0.5" style={{ backgroundColor: 'var(--grey-200)' }} />

      <div className="space-y-4">
        {steps.map((step) => {
          const colors = actorColors[step.actor] || actorColors['노사'];
          const isOpen = expanded === step.id;

          return (
            <div key={step.id} className="relative pl-16">
              {/* 번호 원 */}
              <div
                className="absolute left-0 flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold"
                style={{ backgroundColor: colors.bg, color: colors.text, border: `2px solid ${colors.border}` }}
              >
                {step.number}
              </div>

              {/* 카드 */}
              <div
                className="rounded-xl border p-5 transition-shadow"
                style={{ backgroundColor: 'var(--color-bg-surface)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}
              >
                <button
                onClick={() => setExpanded(isOpen ? null : step.id)}
                aria-expanded={isOpen}
                aria-controls={`step-panel-${step.id}`}
                className="flex w-full items-center justify-between text-left"
              >
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{ backgroundColor: colors.bg, color: colors.text }}
                      >
                        {step.actor}
                      </span>
                      {step.article && <span className="text-xs" style={{ color: 'var(--grey-400)' }}>{step.article}</span>}
                    </div>
                    <h3 className="mt-1 font-bold" style={{ fontSize: 'var(--text-lg)', color: 'var(--grey-900)' }}>{step.title}</h3>
                  </div>
                  {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>

                <p className="mt-2 text-[15px]" style={{ color: 'var(--grey-600)' }}>{step.description}</p>

                {isOpen && (
                  <div id={`step-panel-${step.id}`} role="region" className="mt-4 space-y-3">
                    <ul className="space-y-2">
                      {step.details.map((d, i) => (
                        <li key={i} className="flex gap-2 text-[15px]" style={{ color: 'var(--grey-700)' }}>
                          <span className="mt-1 shrink-0 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--blue-500)' }} />
                          {d}
                        </li>
                      ))}
                    </ul>
                    {step.caution && (
                      <div className="mt-3 flex gap-2 rounded-lg p-3" style={{ backgroundColor: '#fef3c7' }}>
                        <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: '#d97706' }} />
                        <p className="text-sm" style={{ color: '#92400e' }}>{step.caution}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
