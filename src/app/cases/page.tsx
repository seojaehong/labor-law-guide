'use client';

import { useState } from 'react';
import { keyCases } from '@/content/key-cases-data';
import { ChevronDown, ChevronUp, Gavel, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function CasesPage() {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-[800px] px-5 py-10">
      <h1 className="mb-2 font-bold" style={{ fontSize: 'var(--text-2xl)', color: 'var(--grey-900)' }}>
        핵심판례
      </h1>
      <p className="mb-8 text-sm" style={{ color: 'var(--grey-500)' }}>
        개정 노동조합법 사용자성 판단에 활용된 핵심 판례 6건을 쟁점별로 정리했습니다.
      </p>

      <div className="space-y-4">
        {keyCases.map((c) => {
          const isOpen = openId === c.id;
          return (
            <div key={c.id} className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
              <button
                onClick={() => setOpenId(isOpen ? null : c.id)}
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--color-accent-light)' }}>
                  <Gavel size={16} style={{ color: 'var(--color-accent)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ backgroundColor: 'var(--color-accent-light)', color: 'var(--color-accent)' }}>
                      {c.issue}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--grey-400)' }}>{c.court} {c.caseNumber}</span>
                  </div>
                  <div className="mt-1 text-[15px] font-medium" style={{ color: 'var(--grey-900)' }}>{c.title}</div>
                  <div className="mt-0.5 text-xs" style={{ color: 'var(--grey-500)' }}>{c.significance}</div>
                </div>
                {isOpen ? <ChevronUp size={18} style={{ color: 'var(--grey-400)' }} /> : <ChevronDown size={18} style={{ color: 'var(--grey-400)' }} />}
              </button>

              {isOpen && (
                <div className="border-t px-4 pb-4 pt-3 space-y-3" style={{ borderColor: 'var(--color-border)' }}>
                  <Section label="핵심 판시" text={c.keyHolding} />
                  <Section label="개정법과의 연결" text={c.connectionToAct} />
                  <Section label="실무 시사점" text={c.kotraImplication} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-10 text-center">
        <Link
          href="/database"
          className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          더 많은 판례 검색하기 <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}

function Section({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-bold" style={{ color: 'var(--grey-500)' }}>{label}</div>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--grey-700)' }}>{text}</p>
    </div>
  );
}
