'use client';

import { useMemo, useState } from 'react';
import { calcChildcareReduction } from '@/lib/calc/childcare-reduction';
import ResultBlock from '@/components/tool-result/ResultBlock';
import FoldedDetail from '@/components/tool/FoldedDetail';
import { card, choiceLabel, inputCls, ink, muted, small } from '@/lib/tool-kit';
import {
  EMPTY_FORM, applyLines, checkGroups, childcareReductionView, formulaLines, isPlain, mergedNeeds, scheduleRows, shownAssumptions, toEngineInput,
  type FormState, type YesNo,
} from './result';
import Work24Handoff, { HANDOFF_COPY } from './Work24Handoff';

/** 예 · 아니오 · 모름 — 모름이면 엔진에 넘기지 않아 「확인 필요」로 남는다 */
function YesNoField({ legend, name, value, onChange, hint }: { legend: string; name: string; value: YesNo; onChange: (v: YesNo) => void; hint?: string }) {
  const opts: [YesNo, string][] = [['yes', '예'], ['no', '아니오'], ['', '모름']];
  return (
    <fieldset className={`${small} sm:col-span-2`} style={muted}>
      <legend className="mb-1">{legend}</legend>
      <div className="flex flex-wrap gap-4">
        {opts.map(([v, label]) => (
          <label key={label} className={choiceLabel}>
            <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} /> {label}
          </label>
        ))}
      </div>
      {hint && <p className="mt-1">{hint}</p>}
    </fieldset>
  );
}

export default function ChildcareReductionClient() {
  const [f, setF] = useState<FormState>(EMPTY_FORM);
  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) => setF((o) => ({ ...o, [k]: v }));

  const out = useMemo(() => {
    try {
      return { r: calcChildcareReduction(toEngineInput(f)) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [f]);
  const r = 'r' in out ? out.r : undefined;
  const needs = r ? mergedNeeds(r) : [];
  const rows = r ? scheduleRows(r) : [];

  const text = (label: string, k: 'wage' | 'before' | 'after' | 'paid' | 'sharingPaid', mode: 'numeric' | 'decimal' = 'numeric') => (
    <label className={small} style={muted}>
      {label}
      <input inputMode={mode} className={inputCls} value={f[k]} onChange={(e) => set(k)(e.target.value)} />
    </label>
  );
  const date = (label: string, k: 'start' | 'end' | 'sharingStart' | 'sharingEnd') => (
    <label className={small} style={muted}>
      {label}
      <input type="date" className={inputCls} value={f[k]} onChange={(e) => set(k)(e.target.value)} />
    </label>
  );

  return (
    <div className="space-y-4">
      <section className={`${card} grid gap-4 sm:grid-cols-2`} aria-label="임금과 근로시간">
        <div className="sm:col-span-2">{text('월 통상임금(단축 시작일 기준, 단축 전 근로시간으로 받던 금액, 원)', 'wage')}</div>
        {text('단축 전 1주 소정근로시간', 'before', 'decimal')}
        {text('단축 후 1주 소정근로시간', 'after', 'decimal')}
        <p className={`${small} sm:col-span-2`} style={muted}>
          소정근로시간은 근로계약서에 적힌 시간입니다(연장근로는 빼고 넣습니다). 단축 후 시간은 주 15시간 이상 35시간 이하로 정합니다.
        </p>
      </section>

      <section className={`${card} grid gap-4 sm:grid-cols-2`} aria-label="단축 기간">
        {date('단축 시작일', 'start')}
        {date('단축 종료일(그날 포함)', 'end')}
        <p className={`${small} sm:col-span-2`} style={muted}>종료일을 비우면 월액만 셉니다. 종료일을 넣으면 기간별 금액·합계·신청 마감일을 셉니다.</p>
      </section>

      <section className={`${card} grid gap-4 sm:grid-cols-2`} aria-label="요건">
        <YesNoField legend="단축 시작 전 고용보험 피보험 단위기간이 합해 180일 이상입니까" name="insured180" value={f.insured180} onChange={set('insured180')}
          hint="피보험 단위기간은 보수를 받은 날을 셉니다. 고용보험 피보험자격 이력으로 확인합니다." />
        <YesNoField legend="대상 자녀가 만 12세 이하 또는 초등학교 6학년 이하입니까" name="child" value={f.child} onChange={set('child')} />
        <YesNoField legend="회사가 우선지원대상기업입니까" name="priority" value={f.priority} onChange={set('priority')}
          hint="사업주 장려금은 우선지원대상기업에만 지급합니다. 모르면 「모름」으로 두고 업종과 상시 근로자 수로 확인합니다." />
        <YesNoField legend="육아기 근로시간 단축을 처음 허용한 사업장의 첫~세 번째 사례입니까" name="firstTime" value={f.firstTime} onChange={set('firstTime')} />
        <div className="sm:col-span-2">{text('단축 중 회사가 매월 주는 임금·금품 합계(원, 모르면 비움)', 'paid')}</div>
        <p className={`${small} sm:col-span-2`} style={muted}>
          회사가 주는 금액과 단축급여의 합이 단축 시작 직전 월 기준 월 통상임금을 넘으면 넘는 만큼 단축급여에서 뺍니다. 비우면 그 감액을 반영한 지급액은 내지 않습니다.
        </p>
      </section>

      <FoldedDetail summary="업무분담 지원금(사업주, 넣을 때만)">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{text('업무분담자에게 업무분담을 이유로 매월 지급한 금액(원)', 'sharingPaid')}</div>
          {date('업무분담 시작일(비우면 단축 시작일)', 'sharingStart')}
          {date('업무분담 종료일(비우면 단축 종료일)', 'sharingEnd')}
        </div>
      </FoldedDetail>

      {!r ? (
        <section className={card} aria-live="polite"><p className={small} style={ink}>{'error' in out ? out.error : ''}</p></section>
      ) : (
        <ResultBlock view={childcareReductionView(r)}>
          {needs.length > 0 && (
            <div className={`${small} mt-3`}>
              <p className="font-semibold">더 알려 주면 계산하는 것</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {needs.map((n) => <li key={n.key}>{n.question} {n.why}</li>)}
              </ul>
            </div>
          )}
          {checkGroups(r).map((g) => (
            <div key={g.title} className={`${small} mt-3`}>
              <p className="font-semibold">{g.title}</p>
              <ul className="mt-1 space-y-1">
                {g.rows.map((c) => <li key={c.key}><span className="font-semibold">{c.statusLabel}</span> · {c.label} — {c.note}</li>)}
              </ul>
            </div>
          ))}
          {applyLines(r).length > 0 && (
            <div className={`${small} mt-3 space-y-1`}>
              <p className="font-semibold">신청 기간</p>
              {applyLines(r).map((l) => <p key={l}>{l}</p>)}
            </div>
          )}
        </ResultBlock>
      )}

      {r?.worker && (
        <FoldedDetail summary="계산 과정">
          <ol className={`${small} list-decimal space-y-2 pl-5`} style={muted}>
            {formulaLines(r).map((l) => <li key={l}>{l}</li>)}
          </ol>
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className={`${small} w-full min-w-[480px] border-collapse text-left`} style={muted}>
                <thead>
                  <tr><th className="py-1 pr-3">기간</th><th className="py-1 pr-3">일수</th><th className="py-1 pr-3 text-right">금액</th><th className="py-1">비고</th></tr>
                </thead>
                <tbody className="tabular-nums">
                  {rows.map((x) => (
                    <tr key={x.period} className="border-t border-[var(--color-border)]">
                      <td className="py-1 pr-3">{x.period}</td><td className="py-1 pr-3">{x.days}</td><td className="py-1 pr-3 text-right">{x.amount}</td><td className="py-1">{x.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {isPlain(r.worker.payable.note) && <p className={small} style={muted}>{r.worker.payable.note}</p>}
        </FoldedDetail>
      )}

      {r && shownAssumptions(r).length > 0 && (
        <FoldedDetail summary="계산에 둔 전제">
          <ul className={`${small} list-disc space-y-1 pl-5`} style={muted}>
            {shownAssumptions(r).map((a) => <li key={a.key}>{a.note}</li>)}
          </ul>
        </FoldedDetail>
      )}

      <FoldedDetail summary={HANDOFF_COPY.summary}>
        <Work24Handoff f={f} />
      </FoldedDetail>
    </div>
  );
}
