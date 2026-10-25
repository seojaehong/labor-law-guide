// Derived from pblsketch/openoffice apps/hwp/scripts/rhwp-patches.mjs
//   (commit 284f3b394f385efbc8278b4fc4880cba3d277072)
// Copyright 2026 Mainfunc, Inc. Licensed under the Apache License, Version 2.0
//   (third_party/ieum-office/LICENSE, NOTICE).
// 수정함(Modified) 2026-10 labor-law-guide: studio-password-flag 패치만 남기고
//   sdk-scheme·studio-scheme(Electron 전용 스킴)·studio-plugin-allow(AI 플러그인)와
//   pluginHooks 검사는 뺐다. 주석을 한국어로 줄였다.
//
// rhwp 를 빌드할 때 소스에 거는 패치. 정확히 한 곳과 일치하지 않으면 빌드를 멈춰,
// rhwp 를 올렸을 때 패치가 조용히 빠지지 않게 한다.
//
// studio-password-flag
//   브리지의 내보내기(exportHwp·exportHwpx)는 암호로 연 문서도 암호 없이 쓴다.
//   studio 는 문서가 보호돼 있다는 것을 알지만 브리지로 알려 주지 않으므로,
//   명령 문맥(getContext)에 필드 하나를 더해 호스트가 저장을 막을 수 있게 한다.

/** studio-password-flag 가 명령 문맥에 더하는 필드 이름 */
export const PASSWORD_FLAG = 'passwordProtected';

const PATCHES = {
  'studio-password-flag': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]main\.ts$/,
    find: '    isDirty: documentState.isDirty(),',
    replace: `    isDirty: documentState.isDirty(),\n    ${PASSWORD_FLAG}: wasm.requiresPasswordForSave,`,
  },
};

export function applyPatch(name, code) {
  const patch = PATCHES[name];
  if (!patch) throw new Error(`rhwp patch: unknown patch "${name}"`);
  const first = code.indexOf(patch.find);
  if (first === -1 || code.indexOf(patch.find, first + 1) !== -1) {
    throw new Error(
      `rhwp patch ${name}: 바꿀 글자가 정확히 한 번 있어야 합니다. ` +
        'rhwp 소스가 바뀌었으니 scripts/hwp-editor/rhwp-patches.mjs 를 다시 보세요',
    );
  }
  return code.replace(patch.find, patch.replace);
}

/** 이름 붙인 패치를 운영 빌드 중에 거는 Vite 플러그인. 하나라도 안 걸리면 빌드 실패 */
export function rhwpPatches(...names) {
  const applied = new Set();
  return {
    name: `rhwp-patches:${names.join('+')}`,
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0];
      let next = code;
      for (const name of names) {
        if (!PATCHES[name].file.test(file)) continue;
        next = applyPatch(name, next);
        applied.add(name);
      }
      return next === code ? null : { code: next, map: null };
    },
    buildEnd() {
      const missing = names.filter((name) => !applied.has(name));
      if (missing.length > 0) this.error(`rhwp patches never applied: ${missing.join(', ')}`);
    },
  };
}
