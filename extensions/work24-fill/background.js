// 계획은 한 건만 둔다. 고용24 화면이 가져가면 바로 지운다. 저장소 = session(브라우저를 닫으면 사라짐, 계정 동기화 없음).
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const from = sender.url ? new URL(sender.url) : null;
  if (msg && msg.type === 'llg-put' && from && ['https://yellowenvelope.kr', 'https://www.yellowenvelope.kr', 'http://localhost:3123'].includes(from.origin)) {
    chrome.storage.session.set({ plan: msg.plan, at: Date.now() }).then(() => reply({ ok: true }));
    return true;
  }
  if (msg && msg.type === 'llg-take' && from && from.origin === 'https://www.work24.go.kr') {
    chrome.storage.session.get(['plan', 'at']).then(({ plan, at }) => {
      // 30분 지난 계획은 버린다
      const fresh = plan && at && Date.now() - at < 30 * 60 * 1000;
      chrome.storage.session.remove(['plan', 'at']).then(() => reply(fresh ? plan : null));
    });
    return true;
  }
  return false;
});
