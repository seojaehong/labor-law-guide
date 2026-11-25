'use client';

// 퇴고 체험 — 글을 받아 브라우저 안에서 엔진 판정(engine.bundle.mjs = 엔진 checkProse·checkNorms 묶음)을 돌리고,
// 걸린 곳을 원문에 칠하고 목록으로 보여 준다. 글은 이 컴포넌트 밖(서버·저장소·주소·분석)으로 나가지 않는다 —
// fetch·저장 API 를 부르지 않고 <form> 제출도 쓰지 않는다(분석 도구의 양식 추적에도 걸리지 않게).
import { useMemo, useRef, useState } from 'react';
import { runToegoBrowser, type ToegoResult } from '@/lib/toego/engine.bundle.mjs';
import { CHECKS, collectMarks, segments, type CheckKey, type Mark } from '@/lib/toego/highlight';
import { CHECK_LABELS, EXAMPLES, GENRE_OPTIONS, GRADE_LABELS, TRIAL, type ToegoGenre } from './copy';

const brandBtn = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md px-5 py-2.5 text-[15px] font-semibold transition-[background-color,transform] hover:-translate-y-px bg-[var(--color-brand-solid)] text-[#191f28] hover:bg-[var(--brand-500)] disabled:cursor-not-allowed disabled:opacity-50';
const subBtn = 'inline-flex min-h-[44px] items-center rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:border-[var(--grey-400)]';

type Checked = { text: string; genre: ToegoGenre; result: ToegoResult };

const cpCount = (s: string) => {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xdc00 && c <= 0xdfff && i > 0 && (s.charCodeAt(i - 1) & 0xfc00) === 0xd800) continue;
    n++;
  }
  return n;
};

function basisOf(m: Mark): string {
  if (m.check === 'prose') return 'im-not-ai 사전(MIT 라이선스)';
  if (m.check === 'spacing') return `한글 맞춤법 ${m.basis ?? ''}`.trim();
  if (m.check === 'punct') return `한글 맞춤법 부록 「문장 부호」 ${m.basis ?? ''}`.trim();
  return '업무 문서 관행(맞춤법 규정이 아님)';
}

/** 점검을 끝낸 응답(멈춤이 아닌 것) */
type Done = ToegoResult & { prose: NonNullable<ToegoResult['prose']>; norms: NonNullable<ToegoResult['norms']> };
const isDone = (r: ToegoResult | undefined): r is Done => Boolean(r?.prose && r.norms);

function partOf(r: Done, check: CheckKey) {
  return check === 'prose' ? r.prose : r.norms[check];
}

export default function ToegoTrial() {
  const [genre, setGenre] = useState<ToegoGenre>('legal');
  const [text, setText] = useState('');
  const [running, setRunning] = useState(false);
  const [checked, setChecked] = useState<Checked | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const originalRef = useRef<HTMLDivElement>(null);
  const count = useMemo(() => cpCount(text), [text]);

  const run = (t: string, g: ToegoGenre) => {
    setRunning(true);
    setFocus(null);
    // 「점검 중입니다」가 먼저 그려지게 한 박자 미룬다(긴 글은 수백 ms 걸린다)
    window.setTimeout(() => {
      try {
        setChecked({ text: t, genre: g, result: runToegoBrowser({ text: t, genre: g }) });
      } finally {
        setRunning(false);
      }
    }, 0);
  };

  const loadExample = (i: number) => {
    const e = EXAMPLES[i];
    setText(e.text);
    setGenre(e.genre);
    run(e.text, e.genre);
  };

  const view = useMemo(() => {
    if (!checked || !isDone(checked.result)) return null;
    const marks = collectMarks(checked.text, checked.result);
    return { marks, segs: segments(checked.text, marks) };
  }, [checked]);

  const showMark = (id: number) => {
    setFocus(id);
    const el = originalRef.current?.querySelector(`[data-mark-first~="${id}"]`);
    if (el instanceof HTMLElement) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const r = checked?.result;
  const done = isDone(r) ? r : null;
  const totals = done
    ? CHECKS.reduce((t, c) => ({ A: t.A + partOf(done, c).counts.A, B: t.B + partOf(done, c).counts.B }), { A: 0, B: 0 })
    : null;
  const truncated = done ? CHECKS.some((c) => partOf(done, c).truncated) : false;

  return (
    <section aria-labelledby="toego-trial" className="mt-2">
      <h2 id="toego-trial" className="t-h3 mb-3" style={{ color: 'var(--color-text-primary)' }}>{TRIAL.heading}</h2>

      <fieldset className="mb-4">
        <legend className="mb-2 text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{TRIAL.genreLabel}</legend>
        <div className="toego-genres">
          {GENRE_OPTIONS.map((o) => (
            <button key={o.value} type="button" className="toego-genre" aria-pressed={genre === o.value} onClick={() => setGenre(o.value)}>
              <span className="text-sm font-semibold">{o.label}</span>
              <small>{o.hint}</small>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{TRIAL.examplesLabel}</span>
        {EXAMPLES.map((e, i) => (
          <button key={e.label} type="button" className={subBtn} onClick={() => loadExample(i)}>{`예시: ${e.label}`}</button>
        ))}
      </div>

      <label htmlFor="toego-text" className="mb-1.5 block text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{TRIAL.textLabel}</label>
      <textarea
        id="toego-text"
        className="toego-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={TRIAL.placeholder}
        spellCheck={false}
        autoComplete="off"
      />
      <p className="mt-1 text-xs tabular-nums" style={{ color: 'var(--grey-700)' }}>
        {`${count.toLocaleString('ko-KR')}자 · ${TRIAL.limit}`}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={brandBtn} disabled={running || !text} onClick={() => run(text, genre)}>{TRIAL.run}</button>
        <button type="button" className={subBtn} onClick={() => { setText(''); setChecked(null); setFocus(null); }}>{TRIAL.clear}</button>
      </div>

      <div className="mt-6">
        {running && <p role="status" className="text-sm" style={{ color: 'var(--grey-700)' }}>{TRIAL.running}</p>}
        {!running && r && <ResultView r={r} view={view} totals={totals} truncated={truncated} focus={focus} onShow={showMark} originalRef={originalRef} />}
      </div>
    </section>
  );
}

function ResultView({ r, view, totals, truncated, focus, onShow, originalRef }: {
  r: ToegoResult;
  view: { marks: Mark[]; segs: ReturnType<typeof segments> } | null;
  totals: { A: number; B: number } | null;
  truncated: boolean;
  focus: number | null;
  onShow: (id: number) => void;
  originalRef: React.RefObject<HTMLDivElement | null>;
}) {
  if (!isDone(r)) {
    // 멈춤 — 엔진과 같은 문구를 그대로 보인다
    if (r.rrnLines?.length) {
      return (
        <div role="alert" data-toego-stop className="rounded-lg border-l-4 border-[var(--color-warn)] bg-[var(--color-warn-bg)] p-4 text-sm" style={{ color: 'var(--color-text-primary)' }}>
          <p>{r.error}</p>
          <p className="mt-1">{`${TRIAL.rrnLines}: ${r.rrnLines.map((n) => `${n}줄`).join(', ')}`}</p>
        </div>
      );
    }
    const msg = r.reason === '빈 글' ? TRIAL.empty : r.reason ? `${r.reason} — ${TRIAL.tooLong}` : TRIAL.failed;
    return <p role="alert" data-toego-stop className="text-sm" style={{ color: 'var(--color-warn-ink)' }}>{msg}</p>;
  }
  if (!r.ok) return <p role="alert" data-toego-stop className="text-sm" style={{ color: 'var(--color-warn-ink)' }}>{TRIAL.failed}</p>;

  const marks = view?.marks ?? [];
  const firstSeg = new Map<number, number>();
  view?.segs.forEach((s, k) => s.marks.forEach((id) => { if (!firstSeg.has(id)) firstSeg.set(id, k); }));

  return (
    <div data-toego-result>
      <h3 className="t-h4 mb-2">{TRIAL.resultHeading}</h3>
      <p role="status" className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }} data-toego-summary>
        {totals && totals.A + totals.B > 0
          ? `${GRADE_LABELS.A} ${totals.A}곳 · ${GRADE_LABELS.B} ${totals.B}곳`
          : TRIAL.none}
      </p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm" style={{ color: 'var(--grey-700)' }} data-toego-counts>
        {CHECKS.map((c) => {
          const n = (c === 'prose' ? r.prose : r.norms[c]).counts;
          return <li key={c}>{`${CHECK_LABELS[c]} ${GRADE_LABELS.A} ${n.A} · ${GRADE_LABELS.B} ${n.B}`}</li>;
        })}
      </ul>
      <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--grey-700)' }}>{TRIAL.gradeNote}</p>
      {truncated && <p className="mt-1 text-xs" style={{ color: 'var(--grey-700)' }}>{TRIAL.truncated}</p>}

      {marks.length > 0 && view && (
        <>
          <h4 className="mb-2 mt-5 text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{TRIAL.originalHeading}</h4>
          <div ref={originalRef} className="toego-original" data-toego-original tabIndex={0} aria-label={TRIAL.originalHeading}>
            {view.segs.map((s, k) => {
              if (!s.marks.length) return <span key={k}>{s.text}</span>;
              const grade = s.marks.some((id) => marks[id].grade === 'A') ? 'A' : 'B';
              const firsts = s.marks.filter((id) => firstSeg.get(id) === k);
              const title = s.marks.map((id) => `${CHECK_LABELS[marks[id].check]} · ${GRADE_LABELS[marks[id].grade]} · ${marks[id].reason}`).join('\n');
              return (
                <mark key={k} data-grade={grade} title={title} data-mark-first={firsts.length ? firsts.join(' ') : undefined}
                  className={focus !== null && s.marks.includes(focus) ? 'is-focus' : undefined}>
                  {s.text}
                </mark>
              );
            })}
          </div>

          <h4 className="mb-1 mt-5 text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{TRIAL.listHeading}</h4>
          {CHECKS.map((c) => {
            const mine = marks.map((m, id) => ({ m, id })).filter((x) => x.m.check === c);
            if (!mine.length) return null;
            return (
              <div key={c} className="mt-3" data-toego-check={c}>
                <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{CHECK_LABELS[c]}</p>
                <ul className="toego-hits">
                  {mine.map(({ m, id }) => (
                    <li key={id} data-grade={m.grade}>
                      <div className="toego-hit-head">
                        <span className="toego-badge" data-grade={m.grade}>{GRADE_LABELS[m.grade]}</span>
                        <span className="toego-piece">{`「${m.piece}」`}</span>
                        <button type="button" className="toego-hit-pos" onClick={() => onShow(id)} aria-label={`${m.line}줄 ${m.col}칸 원문에서 보기`}>
                          {`${m.line}줄 ${m.col}칸`}
                        </button>
                      </div>
                      <p className="mt-1 text-sm" style={{ color: 'var(--color-text-primary)' }}>{m.reason}</p>
                      {m.fix && <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--grey-700)' }}>{`${TRIAL.fixLabel}: ${m.fix}`}</p>}
                      <p className="mt-0.5 text-xs" style={{ color: 'var(--grey-700)' }}>{`${TRIAL.basisLabel}: ${basisOf(m)}`}</p>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </>
      )}
      {r.prose.notes.length > 0 && (
        <ul className="mt-4 list-disc pl-5 text-sm" style={{ color: 'var(--color-text-primary)' }}>
          {r.prose.notes.map((n, i) => <li key={i}>{n.text}</li>)}
        </ul>
      )}
      <p className="mt-4 text-xs" style={{ color: 'var(--grey-700)' }}>{TRIAL.caption}</p>
    </div>
  );
}
