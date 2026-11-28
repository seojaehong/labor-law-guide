// 고용24 육아기 근로시간 단축 확인서 — 사이트(일의 무늬)가 만든 계획을 칸 id 대로 채운다.
// ★ 아래 허용 목록의 칸만 만진다(엔진 src/lib/gov-fill/work24.ts 의 ALLOWED_IDS 와 같아야 한다 — 시험이 대조).
// ★ 저장·신청 버튼은 누르지 않는다. 주민등록번호·비밀번호·첨부 칸은 목록에 없다.
// ★ 되읽기는 채운 칸과 화면이 계산하는 칸(개월 수·일수)만 한다 — 화면의 다른 값(주민번호 등)은 읽지 않는다.
const ALLOW = ["layoffAlwncPdBeginDe","layoffAlwncPdEndDe","bfeAppontWorkhr","afAppontWorkhr","odygsAm","appontWorkhr","odygsAmSelB","odygsAmSelC","odygsAmSelD","odygsAmSelE"];
const PATH = '/ei/b/b/1500/openHPEIBB1500M06.do';
const AUTO = ['layoffAlwncPdMonthCo', 'layoffAlwncPdDyct'];

function llgFill(steps) {
  if (location.hostname !== 'www.work24.go.kr' || location.pathname !== PATH) return { ok: false, error: '고용24 육아기 근로시간 단축 확인서 화면이 아닙니다' };
  if (!Array.isArray(steps) || steps.length === 0 || steps.length > ALLOW.length) return { ok: false, error: '채울 값이 없습니다' };
  for (const s of steps) {
    if (!s || !ALLOW.includes(s.id) || !['text', 'radio'].includes(s.kind) || typeof s.value !== 'string' || s.value.length > 20)
      return { ok: false, error: `허용하지 않는 칸입니다: ${s && s.id}` };
  }
  const fire = (e) => ['input', 'change', 'keyup', 'blur'].forEach((t) => e.dispatchEvent(new Event(t, { bubbles: true })));
  const set = {};
  for (const s of steps) {
    const el = document.getElementById(s.id);
    if (!el) { set[s.id] = 'missing'; continue; }
    if (s.kind === 'radio') { el.click(); set[s.id] = el.checked ? 'ok' : 'unchecked'; continue; }
    for (const e of [document.getElementById(s.id + '_datepicker'), el]) {
      if (!e) continue;
      const ro = e.hasAttribute('readonly');
      if (ro) e.removeAttribute('readonly');
      e.focus(); e.value = s.value; fire(e);
      if (ro) e.setAttribute('readonly', '');
    }
    set[s.id] = 'ok';
  }
  const back = {};
  for (const id of [...steps.filter((s) => s.kind === 'text').map((s) => s.id), ...AUTO]) {
    const el = document.getElementById(id);
    back[id] = el ? el.value : null;
  }
  const mismatch = steps.filter((s) => s.kind === 'text' && String(back[s.id] || '').replace(/,/g, '') !== s.value).map((s) => s.id);
  return { ok: mismatch.length === 0 && !Object.values(set).includes('missing'), set, back, mismatch };
}

// ── 확장으로 돌 때만: 사이트에서 넘겨받은 계획을 패널로 보여 주고, 사용자가 누르면 채운다 ──
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && location.pathname === PATH) {
  chrome.runtime.sendMessage({ type: 'llg-take' }, (plan) => {
    if (!plan || !Array.isArray(plan.steps)) return;
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:340px;background:#fff;color:#111;border:1px solid #888;border-radius:8px;padding:12px;font:14px/1.5 sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.2)';
    const h = document.createElement('div');
    h.textContent = '일의 무늬 — 확인서에 넣을 값';
    h.style.fontWeight = '700';
    const ul = document.createElement('ul');
    ul.style.cssText = 'margin:8px 0;padding-left:18px';
    for (const s of plan.steps) {
      const li = document.createElement('li');
      li.textContent = s.kind === 'radio' ? s.label : `${s.label}: ${s.value}`;
      ul.appendChild(li);
    }
    const msg = document.createElement('div');
    msg.style.cssText = 'font-size:13px;color:#444';
    msg.textContent = '넣은 뒤 화면을 확인하고 저장·신청은 직접 누릅니다.';
    const go = document.createElement('button');
    go.textContent = '칸에 넣기';
    go.style.cssText = 'margin-top:8px;min-height:44px;padding:0 16px;border-radius:6px;border:0;background:#1f3a8a;color:#fff;cursor:pointer';
    const close = document.createElement('button');
    close.textContent = '닫기';
    close.style.cssText = 'margin:8px 0 0 8px;min-height:44px;padding:0 12px;border-radius:6px;border:1px solid #888;background:#fff;cursor:pointer';
    close.onclick = () => box.remove();
    go.onclick = () => {
      const r = llgFill(plan.steps);
      msg.textContent = r.ok
        ? '넣었습니다. 근로자 주민번호 입력 뒤 「적용」을 누르면 개월 수·일수가 계산됩니다. 저장·신청은 직접 누릅니다.'
        : `넣지 못한 칸이 있습니다: ${r.error || [...(r.mismatch || []), ...Object.keys(r.set || {}).filter((k) => r.set[k] !== 'ok')].join(', ')}`;
      go.disabled = r.ok;
    };
    box.append(h, ul, go, close, msg);
    document.body.appendChild(box);
  });
}
