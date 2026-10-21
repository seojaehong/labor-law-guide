'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
export type ObservationAvailability = 'checking' | 'ready' | 'disabled';
const subscribe = (notify: () => void) => {
  window.addEventListener('storage', notify);
  return () => window.removeEventListener('storage', notify);
};
const getToken = () => { try { return localStorage.getItem('admin_token') ?? ''; } catch { return ''; } };
/** One authenticated metadata-only readiness request per modal/token, never per verdict. */
export function useObservationAvailability(): ObservationAvailability {
  const token = useSyncExternalStore(subscribe, getToken, () => '');
  const [result, setResult] = useState<{ token: string; state: ObservationAvailability } | null>(null);
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    fetch('/api/admin/work-rule-observations?readiness=1', {
      headers: { 'x-admin-token': token }, cache: 'no-store', signal: controller.signal,
    }).then(async response => ({ ok: response.ok, data: await response.json() }))
      .then(({ ok, data }) => { if (!controller.signal.aborted) setResult({ token, state: ok && data.active === true ? 'ready' : 'disabled' }); })
      .catch(() => { if (!controller.signal.aborted) setResult({ token, state: 'disabled' }); });
    return () => controller.abort();
  }, [token]);
  if (!token) return 'disabled';
  return result?.token === token ? result.state : 'checking';
}
