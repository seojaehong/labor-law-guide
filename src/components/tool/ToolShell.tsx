import Link from 'next/link';
import type { ReactNode } from 'react';

// 계산·점검 도구 페이지의 공통 틀 — 뒤로 가기 · 제목 · 한 줄 설명 · 본문 · 계산 기준 상자.
// 계산 기준 상자 끝에는 「입력한 내용은 저장되지 않습니다」가 늘 붙는다.

export default function ToolShell({ title, lead, basis, basisNote, children }: {
  title: string;
  lead: ReactNode;
  /** 계산 기준 — 조문·판례 한 줄씩 */
  basis: ReactNode[];
  /** 계산 기준 아래 덧붙임(관련 도구 링크 등) */
  basisNote?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="layout-tool">
      <div className="mb-6">
        <Link href="/tools" className="text-sm text-[var(--grey-700)] hover:text-[var(--color-text-primary)]">
          ← 계산·점검 도구
        </Link>
      </div>
      <h1 className="t-h2 mb-2" style={{ color: 'var(--color-text-primary)' }}>
        {title}
      </h1>
      <p className="mb-6 text-sm leading-relaxed" style={{ color: 'var(--grey-700)' }}>
        {lead}
      </p>

      {children}

      <div className="mt-10 rounded-xl bg-[var(--grey-100)] p-5 text-sm leading-relaxed" style={{ color: 'var(--grey-700)' }}>
        <div className="mb-2 font-semibold text-[var(--color-text-primary)]">계산 기준</div>
        <ul className="list-disc space-y-1 pl-5">
          {basis.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
        <p className="mt-3">
          {basisNote}
          {basisNote ? ' ' : ''}입력값으로 계산한 참고 결과이며 입력한 내용은 저장되지 않습니다.
        </p>
      </div>
    </div>
  );
}
