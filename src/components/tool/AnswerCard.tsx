import type { ReactNode } from 'react';
import { card, ink } from '@/lib/tool-kit';

// 답 카드 — 맨 위 굵은 한 문장(여러 줄 가능), 그 아래 근거와 그래서 생기는 일.
// 입력이 바뀌면 화면 읽기 프로그램이 새 답을 읽도록 aria-live 를 단다.

export default function AnswerCard({ lines, children }: { lines: string[]; children?: ReactNode }) {
  const [lead, ...rest] = lines;
  return (
    <section className={card} aria-live="polite">
      <p className="text-lg font-bold leading-snug sm:text-xl" style={ink}>{lead}</p>
      {rest.map((l) => <p key={l} className="mt-1 text-lg font-bold" style={ink}>{l}</p>)}
      {children}
    </section>
  );
}
