'use client';

import { useState } from 'react';
import ChecklistWidget from '@/components/ChecklistWidget';
import SimpleChecklistWidget from '@/components/SimpleChecklistWidget';
import DeepChecklistWidget from '@/components/DeepChecklistWidget';
import {
  subcontractChecklist, subcontractChecklistResults, subcontractChecklistTitle, subcontractChecklistDescription,
  employerChecklist, employerChecklistResults, employerChecklistTitle, employerChecklistDescription,
} from '@/content/checklist-data';
import { ClipboardCheck, Building2, Zap, Search } from 'lucide-react';

type MainTab = 'simple' | 'deep';
type SubTab = 'subcontract' | 'employer';

export default function ChecklistPageClient() {
  const [mainTab, setMainTab] = useState<MainTab>('simple');
  const [subTab, setSubTab] = useState<SubTab>('subcontract');

  return (
    <>
      {/* 메인 탭: 약식 / 심층 */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <button
          onClick={() => setMainTab('simple')}
          className="flex items-center gap-3 rounded-xl border p-4 text-left transition-all"
          style={{
            borderColor: mainTab === 'simple' ? 'var(--color-accent)' : 'var(--color-border)',
            backgroundColor: mainTab === 'simple' ? 'var(--blue-50)' : 'var(--color-bg-surface)',
            boxShadow: mainTab === 'simple' ? '0 0 0 2px var(--color-accent)' : 'none',
          }}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: mainTab === 'simple' ? 'var(--color-accent)' : 'var(--grey-100)' }}>
            <Zap size={18} style={{ color: mainTab === 'simple' ? 'white' : 'var(--grey-500)' }} />
          </div>
          <div>
            <div className="text-sm font-bold" style={{ color: mainTab === 'simple' ? 'var(--color-accent)' : 'var(--grey-800)' }}>약식 진단</div>
            <div className="text-xs" style={{ color: 'var(--grey-500)' }}>체크박스로 빠르게</div>
          </div>
        </button>
        <button
          onClick={() => setMainTab('deep')}
          className="flex items-center gap-3 rounded-xl border p-4 text-left transition-all"
          style={{
            borderColor: mainTab === 'deep' ? 'var(--color-accent)' : 'var(--color-border)',
            backgroundColor: mainTab === 'deep' ? 'var(--blue-50)' : 'var(--color-bg-surface)',
            boxShadow: mainTab === 'deep' ? '0 0 0 2px var(--color-accent)' : 'none',
          }}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: mainTab === 'deep' ? 'var(--color-accent)' : 'var(--grey-100)' }}>
            <Search size={18} style={{ color: mainTab === 'deep' ? 'white' : 'var(--grey-500)' }} />
          </div>
          <div>
            <div className="text-sm font-bold" style={{ color: mainTab === 'deep' ? 'var(--color-accent)' : 'var(--grey-800)' }}>심층 진단</div>
            <div className="text-xs" style={{ color: 'var(--grey-500)' }}>18항목 4단계 평가</div>
          </div>
        </button>
      </div>

      {mainTab === 'simple' && (
        <>
          <SubTabSelector subTab={subTab} setSubTab={setSubTab} />
          {subTab === 'subcontract' && (
            <SimpleChecklistWidget title={subcontractChecklistTitle} description={subcontractChecklistDescription} items={subcontractChecklist} results={subcontractChecklistResults} />
          )}
          {subTab === 'employer' && (
            <SimpleChecklistWidget title={employerChecklistTitle} description={employerChecklistDescription} items={employerChecklist} results={employerChecklistResults} />
          )}
        </>
      )}

      {mainTab === 'deep' && (
        <>
          <SubTabSelector subTab={subTab} setSubTab={setSubTab} />
          {subTab === 'subcontract' && (
            <ChecklistWidget title={subcontractChecklistTitle} description={subcontractChecklistDescription} items={subcontractChecklist} results={subcontractChecklistResults} />
          )}
          {subTab === 'employer' && (
            <DeepChecklistWidget />
          )}
        </>
      )}
    </>
  );
}

function SubTabSelector({ subTab, setSubTab }: { subTab: SubTab; setSubTab: (v: SubTab) => void }) {
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2">
      <button
        onClick={() => setSubTab('subcontract')}
        className="flex items-center gap-3 rounded-xl border p-4 text-left transition-all"
        style={{
          borderColor: subTab === 'subcontract' ? 'var(--color-accent)' : 'var(--color-border)',
          backgroundColor: subTab === 'subcontract' ? 'var(--blue-50)' : 'var(--color-bg-surface)',
          boxShadow: subTab === 'subcontract' ? '0 0 0 2px var(--color-accent)' : 'none',
        }}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: subTab === 'subcontract' ? 'var(--color-accent)' : 'var(--grey-100)' }}>
          <Building2 size={18} style={{ color: subTab === 'subcontract' ? 'white' : 'var(--grey-500)' }} />
        </div>
        <div>
          <div className="text-sm font-bold" style={{ color: subTab === 'subcontract' ? 'var(--color-accent)' : 'var(--grey-800)' }}>교섭 의무 진단</div>
          <div className="text-xs" style={{ color: 'var(--grey-500)' }}>하청이 교섭을 요구해 왔을 때</div>
        </div>
      </button>
      <button
        onClick={() => setSubTab('employer')}
        className="flex items-center gap-3 rounded-xl border p-4 text-left transition-all"
        style={{
          borderColor: subTab === 'employer' ? 'var(--color-accent)' : 'var(--color-border)',
          backgroundColor: subTab === 'employer' ? 'var(--blue-50)' : 'var(--color-bg-surface)',
          boxShadow: subTab === 'employer' ? '0 0 0 2px var(--color-accent)' : 'none',
        }}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: subTab === 'employer' ? 'var(--color-accent)' : 'var(--grey-100)' }}>
          <ClipboardCheck size={18} style={{ color: subTab === 'employer' ? 'white' : 'var(--grey-500)' }} />
        </div>
        <div>
          <div className="text-sm font-bold" style={{ color: subTab === 'employer' ? 'var(--color-accent)' : 'var(--grey-800)' }}>사용자성 진단</div>
          <div className="text-xs" style={{ color: 'var(--grey-500)' }}>원청의 사용자 해당 가능성</div>
        </div>
      </button>
    </div>
  );
}
