// k-labor forms 묶음 — 주민번호 모양은 서식에 없는 칸·파일 이름(fileBase)에 있어도 디스크에 쓰기 전에 막는다(261122 interrogate).
// 값은 모두 합성.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registerForms } from '../../tools/k-labor/groups/forms.mjs';

type Handler = (a: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
const tools = new Map<string, Handler>();
registerForms({ registerTool(name: string, _cfg: unknown, handler: Handler) { tools.set(name, handler); } });
const call = async (n: string, a: Record<string, unknown>) => JSON.parse((await tools.get(n)!(a)).content[0].text);

const APPROVAL = { company: '가나다상사', ceo: '박마바', employee: '김가나', appliedOn: '2026-12-01', kind: 'asis', start: '2027-01-04', end: '2027-07-03', notifiedOn: '2026-12-05' };
const withDir = async (fn: (dir: string) => Promise<void>) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'k-labor-forms-'));
  try {
    await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

describe('make_hr_form — 주민번호 모양은 쓰기 전에 막는다', () => {
  it('fileBase 에 있으면 파일을 만들지 않는다', () =>
    withDir(async (dir) => {
      const r = await call('make_hr_form', { formId: 'childcare-leave-approval', values: APPROVAL, outDir: dir, fileBase: '통지_900304.1234567' });
      expect(r.ok).toBe(false);
      expect(fs.readdirSync(dir)).toEqual([]);
    }));
  it('서식에 없는 칸(name)에 있으면 파일을 만들지 않는다', () =>
    withDir(async (dir) => {
      const r = await call('make_hr_form', { formId: 'childcare-leave-approval', values: { ...APPROVAL, name: '900304-1234567' }, outDir: dir });
      expect(r.ok).toBe(false);
      expect(fs.readdirSync(dir)).toEqual([]);
    }));
  it('check_hr_form 도 같은 값을 돌려보내지 않는다', async () => {
    const r = await call('check_hr_form', { formId: 'childcare-leave-approval', values: { ...APPROVAL, memo: '９００３０４-１２３４５６７' } });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toMatch(/1234567|１２３４５６７/);
  });
  it('정상 값이면 「서식 제목_근로자」 파일을 만들고 돌려준 경로가 실제로 있다', () =>
    withDir(async (dir) => {
      const r = await call('make_hr_form', { formId: 'childcare-leave-approval', values: { ...APPROVAL, employee: ' 김\n가나 ' }, outDir: dir });
      expect(r.ok).toBe(true);
      expect(path.basename(r.file.path)).toBe('육아휴직 허용 통지서_김 가나.hwpx');
      expect(fs.existsSync(r.file.path)).toBe(true);
    }));
});
