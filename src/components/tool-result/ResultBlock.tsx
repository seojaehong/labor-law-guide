import Link from 'next/link';
import type { ReactNode } from 'react';
import s from './ResultBlock.module.css';
import { isStaticHtmlHref, type ResultView } from './result-view';

// 계산기 공용 결과 블록(261124) — /exit 「확인용 추정」 띠를 기준으로 모든 Next 계산기의 결과를 같은 순서·무게로 보여준다.
// 상태 → 판정 → 금액(tabular) → 산식 → 주의 → 근거 조문 → 기준일·확인일 → 한계 → 다음 할 일.
// 입력이 바뀌면 화면 읽기 프로그램이 새 결과를 읽도록 aria-live 를 단다(verify-llg 손잡이 section[aria-live]).

export default function ResultBlock({ view, label = '계산 결과', children }: {
  view: ResultView;
  /** 영역 이름(aria-label) */
  label?: string;
  /** 근거·다음 할 일 앞에 붙는 덧붙임 */
  children?: ReactNode;
}) {
  const { status, verdict, meta, amounts, formula, warnings, basis, asOf, caveat, nextNote, next } = view;
  const [lead, ...rest] = verdict;
  return (
    <section className={s.block} aria-live="polite" aria-label={label}>
      <p className={s.status}>{status}</p>
      <p className={s.verdict}>{lead}</p>
      {rest.map((l, i) => <p key={`${i}-${l}`} className={s.verdictMore}>{l}</p>)}
      {meta?.map((l, i) => <p key={`${i}-${l}`} className={s.meta}>{l}</p>)}

      {amounts.length > 0 && (
        <dl className={amounts.length > 1 ? `${s.amounts} ${s.amountsTwo}` : s.amounts}>
          {amounts.map((a, i) => (
            <div key={`${i}-${a.label}`} className={s.amount}>
              <dt className={s.amountLabel}>{a.label}</dt>
              <dd className={s.amountValue}>{a.value}</dd>
              {a.note?.map((n, j) => <dd key={`${j}-${n}`} className={s.amountNote}>{n}</dd>)}
            </div>
          ))}
        </dl>
      )}

      {formula && <p className={s.formula}>{formula}</p>}
      {warnings?.map((w, i) => <p key={`${i}-${w}`} className={s.warning}>{w}</p>)}
      {nextNote && <p className={s.nextNote}>{nextNote}</p>}
      {children}

      {(basis.length > 0 || asOf.length > 0 || caveat) && (
        <div className={s.sources}>
          {basis.length > 0 && (
            <p>
              <span className={s.sourceKey}>근거</span>{' '}
              {basis.map((b, i) => (
                <span key={`${i}-${b.href}`}>
                  {i > 0 && ' · '}
                  <a href={b.href} target="_blank" rel="noopener noreferrer">{b.label}</a>
                </span>
              ))}
            </p>
          )}
          {asOf.map((l, i) => <p key={`${i}-${l}`}>{l}</p>)}
          {caveat && <p>{caveat}</p>}
        </div>
      )}

      {next.length > 0 && (
        <nav className={s.next} aria-label="다음 할 일">
          {next.map((n, i) => (
            n.href.startsWith('/') && !isStaticHtmlHref(n.href)
              ? <Link key={`${i}-${n.href}`} href={n.href} className={i === 0 ? s.nextPrimary : s.nextGhost}>{n.label}</Link>
              : <a key={`${i}-${n.href}`} href={n.href} className={i === 0 ? s.nextPrimary : s.nextGhost}>{n.label}</a>
          ))}
        </nav>
      )}
    </section>
  );
}
