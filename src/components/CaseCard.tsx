'use client';

import { useState } from 'react';
import { Gavel, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  caseNumber: string;
  court: string;
  summary: string;
}

export default function CaseCard({ caseNumber, court, summary }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="my-4 rounded-xl border-l-4 bg-white p-5" style={{ borderLeftColor: 'var(--blue-500)', boxShadow: 'var(--shadow-sm)' }}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left">
        <div className="flex items-center gap-2">
          <Gavel size={16} style={{ color: 'var(--blue-600)' }} />
          <span className="text-sm font-bold" style={{ color: 'var(--blue-700)' }}>판례</span>
          <span className="text-xs" style={{ color: 'var(--grey-400)' }}>{court} {caseNumber}</span>
        </div>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <p className="mt-3 text-[15px] leading-relaxed" style={{ color: 'var(--grey-700)' }}>{summary}</p>
      )}
    </div>
  );
}
