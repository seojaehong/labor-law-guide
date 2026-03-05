'use client';

import { useState } from 'react';
import ChecklistWidget from '@/components/ChecklistWidget';
import {
  subcontractChecklist, subcontractChecklistResults, subcontractChecklistTitle, subcontractChecklistDescription,
  employerChecklist, employerChecklistResults, employerChecklistTitle, employerChecklistDescription,
} from '@/content/checklist-data';
import { ClipboardCheck, Building2 } from 'lucide-react';

const tabs = [
  { key: 'subcontract' as const, label: '교섭 의무 진단', icon: Building2, description: '하청이 교섭을 요구해 왔을 때' },
  { key: 'employer' as const, label: '사용자성 진단', icon: ClipboardCheck, description: '원청의 사용자 해당 가능성' },
];

export default function ChecklistPage() {
  const [active, setActive] = useState<'subcontract' | 'employer'>('subcontract');

  return (
    <div className="mx-auto max-w-[800px] px-5 py-10">
      <h1 className="mb-2 font-bold" style={{ fontSize: 'var(--text-2xl)', color: 'var(--grey-900)' }}>
        자가진단 체크리스트
      </h1>
      <p className="mb-8 text-sm" style={{ color: 'var(--grey-500)' }}>
        개정 노동조합법에 따른 귀사의 교섭 의무와 사용자성을 자가진단해 보세요. (법적 판단이 아닌 참고용입니다)
      </p>

      {/* Tab selector */}
      <div className="mb-8 grid gap-3 sm:grid-cols-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className="flex items-center gap-3 rounded-xl border p-4 text-left transition-all"
            style={{
              borderColor: active === t.key ? 'var(--color-accent)' : 'var(--color-border)',
              backgroundColor: active === t.key ? 'var(--blue-50)' : 'var(--color-bg-surface)',
              boxShadow: active === t.key ? '0 0 0 2px var(--color-accent)' : 'none',
            }}
          >
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ backgroundColor: active === t.key ? 'var(--color-accent)' : 'var(--grey-100)' }}
            >
              <t.icon size={18} style={{ color: active === t.key ? 'white' : 'var(--grey-500)' }} />
            </div>
            <div>
              <div className="text-sm font-bold" style={{ color: active === t.key ? 'var(--color-accent)' : 'var(--grey-800)' }}>{t.label}</div>
              <div className="text-xs" style={{ color: 'var(--grey-500)' }}>{t.description}</div>
            </div>
          </button>
        ))}
      </div>

      {active === 'subcontract' && (
        <ChecklistWidget
          title={subcontractChecklistTitle}
          description={subcontractChecklistDescription}
          items={subcontractChecklist}
          results={subcontractChecklistResults}
        />
      )}

      {active === 'employer' && (
        <ChecklistWidget
          title={employerChecklistTitle}
          description={employerChecklistDescription}
          items={employerChecklist}
          results={employerChecklistResults}
        />
      )}
    </div>
  );
}
