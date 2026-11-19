// 일의 무늬 도구 안내 — 공통 동작: 명령 상자 복사 단추
(function () {
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var t = document.createElement('textarea');
      t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy') ? resolve() : reject(); } catch (e) { reject(e); }
      document.body.removeChild(t);
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.cmd .copy');
    if (!b) return;
    var code = b.parentNode.querySelector('code');
    if (!code) return;
    copyText(code.textContent).then(function () {
      b.textContent = '복사됨'; b.classList.add('done');
      setTimeout(function () { b.textContent = '복사'; b.classList.remove('done'); }, 1600);
    }, function () { b.textContent = '직접 선택해 복사하세요'; });
  });
})();
