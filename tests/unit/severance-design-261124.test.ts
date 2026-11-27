import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

// 퇴직금 계산기(정적 html) 디자인 평가 261124 — P1(개인정보 자동 저장·휴대폰 부담·다크 포커스 링·다른 헤더)과 P2(결과 블록).
// 계산 숫자는 바뀌지 않는다. 화면 동작(저장·새로고침·390 폭)은 tests/e2e/severance-static.spec.ts 가 본다.

const html = readFileSync(resolve('public/tools/severance.html'), 'utf8');
const css = readFileSync(resolve('public/tools/severance-brand.css'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];

function fresh(store: Record<string, string> = {}) {
  const localStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = String(v); },
    removeItem: (k: string) => { delete store[k]; },
  };
  const context = vm.createContext({ document: { addEventListener() {} }, localStorage });
  vm.runInContext(script, context);
  const run = <T,>(expr: string): T => JSON.parse(vm.runInContext(`JSON.stringify(${expr})`, context) ?? 'null');
  return { run, store };
}

/** 화면에 보이는 글자 — script·style·주석·태그를 뺀다 */
const visible = html
  .replace(/<script[\s\S]*?<\/script>/g, ' ')
  .replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<[^>]+>/g, ' ');

describe('계산 숫자 고정 — 합성 입력(입사 2021-01-04 · 마지막 근무 2025-12-31 · 월 3,000,000)', () => {
  it('평균임금·퇴직금·퇴직소득세가 바꾸기 전과 같다', () => {
    const { run } = fresh();
    const r = run<Record<string, number>>(
      `calculateSeverance({...createDefaultWorker(), weeklyHours:'40', startDate:'2021-01-04', endDate:'2025-12-31', wage1:'3,000,000', wage2:'3,000,000', wage3:'3,000,000'})`,
    );
    expect(r).toMatchObject({
      avgWage: 97826.09,
      severancePay: 14_657_832,
      retirementTax: 151_780,
      localTax: 15_170,
      netSeverance: 14_490_882,
      serviceDays: 1823,
      totalCalcDays: 92,
    });
  });

  // 261125 P3 #2 — 받는 방법 IRP 이전(선택)이면 세금은 산출하되 떼지 않는다(소득세법 §146②1). 기본값은 현금 수령(위 고정값)
  it('IRP 이전을 고르면 이전액 = 퇴직금 전액', () => {
    const { run } = fresh();
    const r = run<Record<string, number>>(
      `calculateSeverance({...createDefaultWorker(), weeklyHours:'40', startDate:'2021-01-04', endDate:'2025-12-31', wage1:'3,000,000', wage2:'3,000,000', wage3:'3,000,000', payout:'irp'})`,
    );
    expect(r).toMatchObject({ severancePay: 14_657_832, retirementTax: 151_780, localTax: 15_170, withheldTax: 0, netSeverance: 14_657_832 });
  });
});

describe('개인정보는 [저장]을 눌렀을 때만 이 브라우저에 남긴다', () => {
  it('입력·계산·근로자 전환 때 저절로 저장하는 함수가 없다', () => {
    expect(script).not.toMatch(/function autoSave\b/);
    expect(script).not.toMatch(/autoSave\(/);
    // 저장소에 쓰는 곳은 [저장](onSave → saveToStorage) 하나다
    expect(script.match(/localStorage\.setItem\(/g)).toHaveLength(1);
    const save = script.slice(script.indexOf('function saveToStorage('), script.indexOf('function saveToStorage(') + 600);
    expect(save).toContain('localStorage.setItem(STORAGE_KEY');
    const onSave = script.slice(script.indexOf('function onSave('), script.indexOf('function onSave(') + 400);
    expect(onSave).toContain('saveToStorage()');
  });

  it('저장 표식이 없는 옛 자동 저장값(v3·v4)은 복원하지 않고 지운다', () => {
    const v4 = JSON.stringify({ currentIndex: 0, workers: [{ workerName: '가상근로자', startDate: '2023-03-01', endDate: '2026-10-31' }] });
    const v3 = JSON.stringify({ currentIndex: 0, workers: [{ workerName: '가상근로자', startDate: '2023-03-01', endDate: '2026-11-01' }] });
    const { run, store } = fresh({ severanceCalcData_v4: v4, severanceCalcData_v3: v3, theme: 'dark' });
    expect(run<boolean>('loadFromStorage()')).toBe(false);
    expect(Object.keys(store)).toEqual(['theme']);
  });

  it('[저장]으로 남긴 값은 복원하고, 계산 결과는 남기지 않는다', () => {
    const { run, store } = fresh();
    run(`(() => { state.workers[0].workerName = '가상근로자'; state.workers[0].startDate = '2023-01-01'; state.workers[0].result = { severancePay: 1 }; saveToStorage(); })()`);
    expect(Object.keys(store)).toEqual(['severanceCalcData_v5']);
    const saved = JSON.parse(store.severanceCalcData_v5);
    expect(saved.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(saved.state.workers[0].result).toBeNull();
    const again = fresh({ ...store });
    expect(again.run<boolean>('loadFromStorage()')).toBe(true);
    expect(again.run<string>('state.workers[0].workerName')).toBe('가상근로자');
  });

  it('「지우기」는 이 계산기의 저장값만 지우고 화면 테마는 남긴다', () => {
    const { run, store } = fresh({ severanceCalcData_v5: '{"savedAt":"2026-11-24T00:00:00.000Z","state":{"currentIndex":0,"workers":[{}]}}', theme: 'light' });
    run('clearStoredInput()');
    expect(Object.keys(store)).toEqual(['theme']);
  });

  it('사용설명서가 실제 동작(저장 버튼을 눌러야 저장)과 같은 말을 한다', () => {
    expect(visible).toMatch(/\[저장\]을 누를 때만 이 브라우저에 저장합니다/);
    expect(html).toMatch(/<p id="savedNotice"[^>]*hidden/);
    expect(visible).toContain('이 브라우저에 저장된 입력이 있습니다');
  });

  it('인적사항을 고쳐도 계산 결과를 지우지 않는다(인쇄용 칸이 계산 뒤에 채워진다)', () => {
    const { run } = fresh();
    const base = `{...createDefaultWorker(), weeklyHours:'40', startDate:'2021-01-04', endDate:'2025-12-31', wage1:'3,000,000'}`;
    expect(run<string>(`workerInputSignature(${base})`)).toBe(
      run<string>(`workerInputSignature({...${base}, workerName:'가상근로자', businessName:'가상상사', ownerName:'가상대표', birthDate:'1990-01-01'})`),
    );
  });
});

describe('휴대폰(390) 입력 부담', () => {
  it('인적사항 4칸은 「산정서로 인쇄할 때 입력」 접힘 안에 있다', () => {
    const block = html.match(/<details[^>]*id="personalInfo"[\s\S]*?<\/details>/)?.[0] ?? '';
    expect(block).toContain('산정서로 인쇄할 때 입력');
    for (const id of ['businessName', 'ownerName', 'workerName', 'birthDate']) expect(block).toContain(`id="${id}"`);
    for (const id of ['startDate', 'endDate', 'wage1']) expect(block).not.toContain(`id="${id}"`);
  });

  it('입사일·마지막 근무일·월급여가 접힘보다 앞에 있다', () => {
    const first = html.indexOf('<details', html.indexOf('class="input-area"'));
    for (const id of ['startDate', 'endDate', 'wage1', 'wage2', 'wage3']) expect(html.indexOf(`id="${id}"`)).toBeLessThan(first);
  });

  it('날짜 칸은 숫자 자판을 연다', () => {
    for (const id of ['startDate', 'endDate', 'birthDate']) {
      expect(html).toMatch(new RegExp(`<input[^>]*id="${id}"[^>]*inputmode="numeric"`));
    }
  });

  it('월급여는 가로로 움직이는 표가 아니고, 칸마다 이름이 있다', () => {
    expect(html).not.toContain('class="wage-table"');
    expect(css).not.toMatch(/\.wage-table\s*\{[^}]*min-width/);
    for (let i = 1; i <= 4; i++) expect(html).toMatch(new RegExp(`<label[^>]*for="wage${i}"`));
  });

  it('주 버튼은 「계산하기」 하나이고 초기화·인쇄·저장은 보조 줄에 있다', () => {
    const area = html.match(/<div class="button-area[\s\S]*?id="actionStatus"/)?.[0] ?? '';
    expect(area.match(/btn-primary/g)).toHaveLength(1);
    expect(area).toMatch(/btn-primary[^>]*>계산하기</);
    const secondary = area.match(/<div class="button-secondary"[\s\S]*?<\/div>/)?.[0] ?? '';
    for (const label of ['저장', '초기화', '인쇄하기']) expect(secondary).toContain(`>${label}<`);
  });
});

describe('접근성 — 알림·오류·포커스', () => {
  it('사라지는 토스트가 없고, 계산 결과는 처음부터 있는 polite 상태 줄로 알린다', () => {
    expect(html).not.toContain('id="toast"');
    expect(script).not.toContain('showToast(');
    expect(html).toMatch(/<p id="resultStatus"[^>]*aria-live="polite"/);
    expect(visible).not.toContain('계산 완료');
  });

  it('오류 문장을 해당 칸 바로 옆에 두고 aria-describedby 로 잇는다', () => {
    const body = script.slice(script.indexOf('function setCalcStatus('), script.indexOf('function setCalcStatus(') + 2200);
    expect(body).toContain("'field-error'");
    expect(body).toMatch(/aria-describedby/);
    expect(body).toMatch(/\.open = true/); // 접힘 안 칸이면 연다
  });

  it('포커스 링을 지우는 규칙이 없다', () => {
    const styles = (html.match(/<style>[\s\S]*?<\/style>/)?.[0] ?? '') + css;
    expect(styles).not.toMatch(/outline:\s*none/);
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--focus\)/);
  });
});

describe('헤더 — 운영 Next 화면(GlassNav)과 같은 구성', () => {
  const nav = html.match(/<nav class="work-nav[\s\S]*?<\/nav>/)?.[0] ?? '';
  it('5개 메뉴 + 다크 모드 단추 + 서비스 문의 + 모바일 메뉴', () => {
    for (const href of ['/tools', '/blog', '/laws', '/tools/work-rules', '/decisions', '/contact']) expect(nav).toContain(`href="${href}"`);
    expect(nav).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/tools"/);
    expect(nav).toMatch(/aria-label="다크 모드로 전환"/);
    expect(nav).toMatch(/aria-controls="mobile-navigation"/);
    expect(nav).not.toContain('화면 테마');
    expect(html).toContain('src/components/GlassNav.tsx'); // 복제 출처 주석
  });
});

describe('문구', () => {
  it('느낌표·해요체 명령형(~하세요)이 없다', () => {
    expect(visible).not.toMatch(/!/);
    expect(visible).not.toMatch(/(?<!주)세요/);
    expect(script.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')).not.toMatch(/[가-힣]!['`"]/);
  });
});
