import StepDiagram from '@/components/StepDiagram';
import { negotiationSteps, unitSeparation } from '@/content/manual-data';
import { unionPrepChecklist, employerPrepChecklist } from '@/content/checklist-data';
import CalloutBox from '@/components/CalloutBox';
import { CheckCircle, FileText } from 'lucide-react';

export default function ManualPage() {
  return (
    <div className="mx-auto max-w-[820px] px-5 py-10">
      <h1 className="t-h2 mb-2" style={{ color: 'var(--color-text-primary)' }}>
        원·하청 교섭절차 가이드
      </h1>
      <p className="mb-10 text-sm" style={{ color: 'var(--grey-500)' }}>
        교섭요구부터 단체교섭까지 6단계 절차 | 고용노동부 매뉴얼 기반
      </p>

      <CalloutBox variant="info" text="개정 노동조합법에 따라 하청노동조합은 원청사용자를 상대로 교섭창구 단일화 절차를 거쳐 단체교섭을 진행할 수 있습니다." />

      {/* Step Diagram */}
      <section className="my-12">
        <h2 className="t-h3 mb-6" style={{ color: 'var(--color-text-primary)' }}>교섭절차 6단계</h2>
        <StepDiagram steps={negotiationSteps} />
      </section>

      {/* Unit Separation */}
      <section className="my-12">
        <h2 className="t-h3 mb-4" style={{ color: 'var(--color-text-primary)' }}>{unitSeparation.title}</h2>
        <p className="mb-6 text-[15px]" style={{ color: 'var(--grey-600)' }}>{unitSeparation.description}</p>

        <h3 className="mb-3 text-sm font-bold" style={{ color: 'var(--grey-700)' }}>노동위원회 고려사항</h3>
        <ul className="mb-6 space-y-2">
          {unitSeparation.considerations.map((c, i) => (
            <li key={i} className="flex gap-2 text-[15px]" style={{ color: 'var(--grey-700)' }}>
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: 'var(--blue-500)' }} />
              {c}
            </li>
          ))}
        </ul>

        <h3 className="mb-3 text-sm font-bold" style={{ color: 'var(--grey-700)' }}>분리 예시</h3>
        <div className="grid gap-3 md:grid-cols-3">
          {unitSeparation.examples.map((ex) => (
            <div key={ex.title} className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)' }}>
              <h4 className="mb-1 font-bold text-sm" style={{ color: 'var(--grey-800)' }}>{ex.title}</h4>
              <p className="text-sm" style={{ color: 'var(--grey-500)' }}>{ex.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Checklists */}
      <section className="my-12 grid gap-8 lg:grid-cols-2">
        <PrepChecklist data={unionPrepChecklist} icon={<FileText size={18} style={{ color: 'var(--blue-500)' }} />} />
        <PrepChecklist data={employerPrepChecklist} icon={<FileText size={18} style={{ color: '#d97706' }} />} />
      </section>
    </div>
  );
}

function PrepChecklist({ data, icon }: { data: typeof unionPrepChecklist; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-6" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
      <div className="mb-1 flex items-center gap-2">
        {icon}
        <h3 className="font-bold" style={{ color: 'var(--color-text-primary)' }}>{data.title}</h3>
      </div>
      <p className="mb-4 text-sm" style={{ color: 'var(--grey-500)' }}>{data.description}</p>
      <ul className="space-y-3">
        {data.items.map((item) => (
          <li key={item.id} className="flex gap-3 text-[15px]">
            <CheckCircle size={18} className="mt-0.5 shrink-0" style={{ color: 'var(--grey-300)' }} />
            <div>
              <span style={{ color: 'var(--grey-700)' }}>{item.text}</span>
              <span className="ml-2 text-xs" style={{ color: 'var(--grey-400)' }}>{item.category}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
