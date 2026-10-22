'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { renderCard, STATUS_TEXT } from '@/lib/pay-check/card';
import { check } from '@/lib/pay-check/check';
import type { CheckResult, PolicyId, Scenario, Status } from '@/lib/pay-check/types';
import {
  BASES, buildInput, fieldsFor, OUTSIDE_NOTE, PICKS, ROUNDING_UNIT_OPTIONS, ROUNDINGS, UNKNOWN_DATE,
  type FieldDef, type PickId, type Rounding,
} from './build-input';
import type { RoundingUnit } from '@/lib/pay-check/policies';

export const DISCLAIMER = '이 결과는 입력하고 확인한 값의 대조이며 법률 판단이 아닙니다.';

const STATUS_CLASS: Record<Status, string> = {
  MATCH: 'ok',
  POTENTIAL_MISMATCH: 'warn',
  NEEDS_CONFIRMATION: 'need',
  OUTSIDE_SCOPE: 'out',
};

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

function Field({ def, value, onChange }: { def: FieldDef; value: string; onChange: (v: string) => void }) {
  const id = `pc-${def.key}`;
  const head = (
    <span className="k">
      {def.label}
      {def.hint && <em>{def.hint}</em>}
    </span>
  );
  if (def.kind === 'choice') {
    return (
      <div className="pc-field pc-field-wide" role="group" aria-label={def.label}>
        {head}
        <div className="pc-opts">
          {def.options.map((o) => (
            <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(value === o.id ? '' : o.id)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (def.kind === 'date-or-unknown') {
    const isUnknown = value === UNKNOWN_DATE;
    return (
      <div className="pc-field">
        <label htmlFor={id}>{head}</label>
        <input id={id} type="date" value={isUnknown ? '' : value} disabled={isUnknown} onChange={(e) => onChange(e.target.value)} />
        <label className="pc-unknown">
          <input type="checkbox" checked={isUnknown} onChange={(e) => onChange(e.target.checked ? UNKNOWN_DATE : '')} />
          모름
        </label>
      </div>
    );
  }
  return (
    <div className="pc-field">
      <label htmlFor={id}>{head}</label>
      {def.kind === 'date' ? (
        <input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <div className="pc-num">
          <input id={id} type="text" inputMode="decimal" autoComplete="off" value={value} placeholder="비워 두면 모름" onChange={(e) => onChange(e.target.value)} />
          <span>{def.unit}</span>
        </div>
      )}
    </div>
  );
}

function ResultCard({ r, onCopy }: { r: CheckResult; onCopy: (text: string, done: string) => void }) {
  return (
    <section className={`pc-result is-${STATUS_CLASS[r.status]}`} aria-live="polite" aria-label="대조 결과">
      <div className="pc-result-head">
        <span className={`pc-badge ${STATUS_CLASS[r.status]}`}>{STATUS_TEXT[r.status]}</span>
      </div>
      <p className="pc-obs">{r.observation}</p>

      {r.expected_amount !== null && r.payslip_amount !== null && r.difference !== null && (
        <dl className="pc-figs">
          <div><dt>명세서</dt><dd>{won(r.payslip_amount)}</dd></div>
          <div><dt>확인한 기준으로 계산</dt><dd>{won(r.expected_amount)}</dd></div>
          <div><dt>차이</dt><dd>{won(Math.abs(r.difference))}</dd></div>
        </dl>
      )}

      {r.grounds.length > 0 && (
        <div className="pc-block">
          <h3>근거</h3>
          <ul>{r.grounds.map((g) => <li key={g}>{g}</li>)}</ul>
        </div>
      )}
      {r.conditions.length > 0 && (
        <div className="pc-block">
          <h3>이 결과가 달라지는 경우</h3>
          <ul>{r.conditions.map((g) => <li key={g}>{g}</li>)}</ul>
        </div>
      )}
      {r.evidence_needed.length > 0 && (
        <div className="pc-block">
          <h3>필요한 자료</h3>
          <ul>{r.evidence_needed.map((g) => <li key={g}>{g}</li>)}</ul>
        </div>
      )}
      {r.required_question && (
        <div className="pc-block pc-ask">
          <h3>회사에 물어볼 문장</h3>
          <p>{r.required_question}</p>
          <button type="button" className="pc-btn" onClick={() => onCopy(r.required_question!, '문의 문장을 복사했습니다')}>
            문의 문장 복사
          </button>
        </div>
      )}
      {r.citations.length > 0 && <p className="pc-cite">관련 조문: {r.citations.join(' · ')}</p>}
      <p className="pc-disclaimer">{DISCLAIMER}</p>
      <button type="button" className="pc-btn pc-btn-ghost" onClick={() => onCopy(renderCard(r), '결과 전체를 복사했습니다')}>
        결과 전체 복사
      </button>
    </section>
  );
}

export default function PayCheckClient() {
  const [pick, setPick] = useState<PickId | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [policy, setPolicy] = useState<PolicyId | null>(null);
  const [rounding, setRounding] = useState<Rounding>('UNKNOWN');
  const [roundingUnit, setRoundingUnit] = useState<RoundingUnit | null>(null);
  const [toast, setToast] = useState('');

  const scenario: Scenario | null = pick && pick !== 'NORMAL_MONTH' && pick !== 'MULTIPLE' ? pick : null;

  const choose = (id: PickId) => {
    setPick(id);
    setValues({});
    setPolicy(null);
    setRounding('UNKNOWN');
    setRoundingUnit(null);
  };
  const set = (k: string) => (v: string) => setValues((prev) => ({ ...prev, [k]: v }));

  const fields = scenario ? fieldsFor(scenario, policy) : null;
  const result = useMemo(
    () => (scenario ? check(buildInput({ scenario, values, policy, rounding, roundingUnit })) : null),
    [scenario, values, policy, rounding, roundingUnit],
  );

  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast(done);
    } catch {
      setToast('복사하지 못했습니다. 브라우저 권한을 확인해 주세요');
    }
    window.setTimeout(() => setToast(''), 2400);
  };

  return (
    <div className="pc">
      <div className="pc-wrap">
        <header className="pc-hero">
          <div className="pc-eyebrow">명세서 한 항목 대조 · 브라우저 안에서만 계산</div>
          <h1 className="pc-h1">월급 대조</h1>
          <p className="pc-lead">
            한 사람의 한 달 급여에서 예외 하나를 골라, 확인한 값과 회사 문서에 적힌 계산 기준으로 명세서 금액을 대조합니다.
            기준이 확인되지 않으면 금액을 만들지 않고, 회사에 무엇을 물어볼지 정리해 드립니다.
          </p>
          <p className="pc-note">
            입력한 값은 이 브라우저 안에서만 계산하며 서버로 보내지 않고 주소창에도 남기지 않습니다. {DISCLAIMER}
          </p>
        </header>

        <section className="pc-step" aria-label="예외 고르기">
          <h2><span>1</span>어떤 예외가 있는 달인가요</h2>
          <div className="pc-picks" role="group" aria-label="예외">
            {PICKS.map((p) => (
              <button key={p.id} type="button" aria-pressed={pick === p.id} onClick={() => choose(p.id)}>
                <span className="n">{p.label}</span>
                <span className="m">{p.note}</span>
              </button>
            ))}
          </div>
        </section>

        {(pick === 'NORMAL_MONTH' || pick === 'MULTIPLE') && (
          <section className="pc-result is-out" aria-live="polite" aria-label="대조 결과">
            <div className="pc-result-head"><span className="pc-badge out">{STATUS_TEXT.OUTSIDE_SCOPE}</span></div>
            <p className="pc-obs">{OUTSIDE_NOTE[pick]}</p>
            <p className="pc-disclaimer">{DISCLAIMER}</p>
          </section>
        )}

        {scenario && fields && result && (
          <>
            <section className="pc-step" aria-label="확인한 값">
              <h2><span>2</span>확인한 값을 넣어 주세요</h2>
              <p className="pc-help">명세서·근로계약서·근무표에서 확인한 값만 넣습니다. 모르는 칸은 비워 두세요.</p>
              <div className="pc-fields">
                {fields.facts.map((d) => <Field key={d.key} def={d} value={values[d.key] ?? ''} onChange={set(d.key)} />)}
              </div>
            </section>

            <section className="pc-step" aria-label="회사 계산 기준">
              <h2><span>3</span>회사 문서에 적힌 계산 기준</h2>
              <p className="pc-help">근로계약서·취업규칙에 적힌 기준을 고릅니다. 적힌 것이 없거나 모르면 「없음·모름」을 고르세요.</p>
              <div className="pc-opts pc-bases" role="group" aria-label="계산 기준">
                {BASES[scenario].map((b) => (
                  <button key={b.id} type="button" aria-pressed={policy === b.id} onClick={() => setPolicy(b.id)}>
                    <span className="n">{b.label}</span>
                    <span className="m">{b.note}</span>
                  </button>
                ))}
                <button type="button" aria-pressed={policy === null} onClick={() => setPolicy(null)}>
                  <span className="n">없음·모름</span>
                  <span className="m">문서에서 기준을 찾지 못함</span>
                </button>
              </div>
              {fields.basis.length > 0 && (
                <div className="pc-fields pc-fields-basis">
                  {fields.basis.map((d) => <Field key={d.key} def={d} value={values[d.key] ?? ''} onChange={set(d.key)} />)}
                </div>
              )}
            </section>

            <section className="pc-step" aria-label="끝수 처리">
              <h2><span>4</span>끝수 처리</h2>
              <p className="pc-help">
                계산 결과에 끝수가 생길 때 회사가 쓰는 처리 방법과 단위(1원·10원·100원)입니다. 끝수가 생겼는데 둘 중 하나라도 모르면 금액을 만들지 않습니다.
              </p>
              <div className="pc-opts" role="group" aria-label="끝수 처리 방법">
                {ROUNDINGS.map((x) => (
                  <button key={x.id} type="button" aria-pressed={rounding === x.id} onClick={() => setRounding(x.id)}>
                    {x.label}
                  </button>
                ))}
              </div>
              <div className="pc-opts" role="group" aria-label="끝수 처리 단위">
                {ROUNDING_UNIT_OPTIONS.map((x) => (
                  <button key={x.label} type="button" aria-pressed={roundingUnit === x.id} onClick={() => setRoundingUnit(x.id)}>
                    {x.label}
                  </button>
                ))}
              </div>
            </section>

            <ResultCard r={result} onCopy={copy} />
          </>
        )}

        <footer className="pc-foot">
          <b>이 도구가 쓰는 조문</b>
          <ul>
            <li>근로기준법 제18조제3항 — 4주(4주 미만으로 근로하면 그 기간) 평균 1주 소정근로시간이 15시간 미만이면 제55조(휴일)를 적용하지 않음</li>
            <li>근로기준법 제55조제1항 · 시행령 제30조제1항 — 1주 소정근로일을 개근한 근로자에게 유급휴일</li>
            <li>근로기준법 시행령 [별표 2] 제2호나목 — 단시간근로자의 1일 소정근로시간 = 4주 소정근로시간 ÷ 그 기간 통상 근로자의 총 소정근로일수</li>
          </ul>
          <p>
            <a href="https://www.law.go.kr/법령/근로기준법" target="_blank" rel="noopener noreferrer">근로기준법 원문</a>
            {' · '}
            <a href="https://www.law.go.kr/법령/근로기준법시행령" target="_blank" rel="noopener noreferrer">근로기준법 시행령 원문</a>
            {' '}(법제처 현행, 2026-10-22 확인)
          </p>
          <p>
            범위 밖: 두 가지 이상 겹친 예외, 포괄임금·교대제·가산수당·연차·퇴직금·보험·세액. {DISCLAIMER}
            {' '}다른 도구는 <Link href="/tools">계산·점검 도구 목록</Link>에서 볼 수 있습니다.
          </p>
        </footer>
      </div>
      {toast && <div className="pc-toast" role="status">{toast}</div>}
    </div>
  );
}
