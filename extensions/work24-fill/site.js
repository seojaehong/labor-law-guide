// 일의 무늬 사이트 → 확장: 계산 화면이 window.postMessage 로 보낸 「채울 계획」을 받아 둔다.
// 같은 창·같은 출처에서 온 메시지만, 모양을 검사한 뒤 받는다. 받은 계획은 브라우저를 닫으면 사라지는 저장소(session)에 둔다.
window.addEventListener('message', (ev) => {
  if (ev.source !== window || ev.origin !== location.origin) return;
  const d = ev.data;
  if (!d || d.type !== 'llg-gov-fill' || d.version !== 1 || d.target !== 'work24-childcare-reduction' || !Array.isArray(d.steps)) return;
  const steps = d.steps.filter((s) => s && typeof s.id === 'string' && typeof s.value === 'string' && typeof s.label === 'string' && (s.kind === 'text' || s.kind === 'radio'));
  if (steps.length !== d.steps.length || steps.length === 0 || steps.length > 10) return;
  chrome.runtime.sendMessage({ type: 'llg-put', plan: { target: d.target, steps } }, (res) => {
    window.postMessage({ type: 'llg-gov-fill-ack', ok: !!(res && res.ok) }, location.origin);
  });
});
// 확장이 설치돼 있다는 신호 — 화면이 「고용24에 넣기」 버튼 안내를 고른다
document.documentElement.dataset.llgGovFill = '1';
