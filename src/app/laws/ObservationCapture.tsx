'use client';
import { useRef, useState, useSyncExternalStore } from 'react';
import type { ObservationAvailability } from './observation-availability';
import type { Verdict } from '@/lib/laws/rules-check';
import { captureIdentity, observationId, safeClauseId, safeClauseIds, sameObservation, type CaptureContext, type Observation } from '@/lib/laws/observation-payload';
const subscribe = (notify: () => void) => {
  window.addEventListener('storage', notify);
  return () => window.removeEventListener('storage', notify);
};
const hasAdmin = () => { try { return !!localStorage.getItem('admin_token'); } catch { return false; } };
type Props = { verdict: Verdict; clauseIds: string[]; context: CaptureContext; standardId: string; store: Map<string, Observation>; availability: ObservationAvailability };
export default function ObservationCapture(props: Props) {
  // A different document/run/period/version mounts fresh state, even for identical verdicts.
  return <CaptureAttempt key={captureIdentity(props.context)} {...props} />;
}
/** 관리자 검토기록 기능이 아직 준비 중이거나 꺼져 있을 때 결과 묶음 위에 한 번만 보이는 안내 */
export function ObservationNotice({ availability }: { availability: ObservationAvailability }) {
  const admin = useSyncExternalStore(subscribe, hasAdmin, () => false);
  if (!admin || availability === 'ready') return null;
  return <p className="lr-check-note" role="status">관리자 검토기록 저장: {availability === 'checking' ? '서버 기록 기능의 준비 상태를 확인하고 있습니다.' : '기록 기능이 비활성 상태입니다. 점검 결과는 이 브라우저에서 확인할 수 있습니다.'}</p>;
}
function CaptureAttempt({ verdict, clauseIds, context, standardId, store, availability }: Props) {
  const admin = useSyncExternalStore(subscribe, hasAdmin, () => false);
  const attemptKey = `${captureIdentity(context)}:${standardId}:${verdict.rule.lawId}:${verdict.rule.article}:${verdict.rule.effective}`;
  const [falsePositive, setFalsePositive] = useState(() => store.get(attemptKey)?.user_false_positive ?? false);
  const [state, setState] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(() => store.has(attemptKey));
  const snapshot = useRef<Observation | null>(store.get(attemptKey) ?? null);
  const inFlight = useRef(false);
  if (!admin) return null;
  async function save() {
    if (inFlight.current || availability !== 'ready') return;
    inFlight.current = true;
    setBusy(true); setAttempted(true); setState('');
    try {
      const r = verdict.rule;
      // Freeze the complete payload once. An uncertain write/readback can only retry it.
      snapshot.current ??= store.get(attemptKey) ?? {
        ...context, id: await observationId(context, standardId, `${r.lawId}:${r.article}:${r.effective}`), standard_article_id: standardId, rule_id: `${r.lawId}:${r.article}:${r.effective}`,
        candidate_clause_ids: [...new Set(clauseIds.map(safeClauseId).filter((id): id is string => !!id))].sort(),
        selected_clause_ids: safeClauseIds(verdict.where),
        verdict: verdict.status, reason: 'period_check_output',
        missing_count: verdict.missing.length, stale_count: verdict.stale.length,
        user_false_positive: falsePositive,
      };
      const payload = store.get(attemptKey) ?? snapshot.current;
      snapshot.current = payload;
      store.set(attemptKey, payload);
      const response = await fetch('/api/admin/work-rule-observations', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-token': localStorage.getItem('admin_token') ?? '' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      const confirmed = response.ok && sameObservation(payload, data.record);
      setState(confirmed ? '기록 저장 확인됨' : '저장 확인에 실패했습니다. 같은 실행의 재시도는 최초 기록 내용으로 진행됩니다.');
    } catch {
      setState('저장 확인에 실패했습니다. 같은 실행의 재시도는 최초 기록 내용으로 진행됩니다.');
    } finally { inFlight.current = false; setBusy(false); }
  }
  // 준비되지 않은 상태 안내는 결과마다 붙이지 않고 결과 위 ObservationNotice 한 곳에서만 보인다
  if (availability !== 'ready') return null;
  return <div>
    <label><input type="checkbox" checked={falsePositive} disabled={busy || attempted} onChange={e => setFalsePositive(e.target.checked)} /> 오탐 의심 표시</label>{' '}
    <button className="lr-btn lr-btn-sm" disabled={busy || state === '기록 저장 확인됨'} onClick={save}>관리자 검토기록 저장</button>
    <p>원문·제목은 저장하지 않습니다. 규칙과 조항 번호·판정 정보만 기록합니다.</p>
    <p role="status">{state}</p>
  </div>;
}
