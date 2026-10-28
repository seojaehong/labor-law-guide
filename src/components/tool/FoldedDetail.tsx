import type { ReactNode } from 'react';
import { card, ink } from '@/lib/tool-kit';

// 접힌 상세 — 날짜별 계산·산식처럼 확인하고 싶은 사람만 펼쳐 보는 것.

export default function FoldedDetail({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className={card}>
      <summary className="cursor-pointer text-base font-semibold" style={ink}>{summary}</summary>
      <div className="mt-4 space-y-4">{children}</div>
    </details>
  );
}
