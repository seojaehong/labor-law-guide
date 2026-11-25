import type { ReactNode } from 'react';
import { card, ink } from '@/lib/tool-kit';

// 접힌 상세 — 날짜별 계산·산식처럼 확인하고 싶은 사람만 펼쳐 보는 것.

export default function FoldedDetail({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className={card}>
      {/* 히트 44px — 위아래 10px 패딩을 음수 여백으로 상쇄해 카드 안 위치는 그대로 둔다(§5.1) */}
      <summary className="-my-[10px] min-h-[44px] cursor-pointer py-[10px] text-base font-semibold" style={ink}>{summary}</summary>
      <div className="mt-4 space-y-4">{children}</div>
    </details>
  );
}
