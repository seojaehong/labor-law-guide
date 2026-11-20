// k-labor 파일 쓰기 도구 — 같은 이름으로 동시에 부른 두 호출 중 하나만 쓴다(261120, docs 묶음 #237 의 후속).
// 있는지 먼저 보는 검사만으로는 둘 다 통과해 한쪽 서류가 조용히 덮이거나 두 판이 섞인다. 사업장은 합성 값.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';

import { registerNosa } from '../../tools/k-labor/groups/nosa.mjs';
import { registerNosaRecords } from '../../tools/k-labor/groups/nosa-records.mjs';
import { writeNew } from '../../tools/k-labor/lib/common.mjs';

type Handler = (a: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
const tools = new Map<string, Handler>();
const s = { registerTool(name: string, _cfg: unknown, handler: Handler) { tools.set(name, handler); } };
registerNosa(s);
registerNosaRecords(s);
const call = async (n: string, a: Record<string, unknown>) => JSON.parse((await tools.get(n)!(a)).content[0].text);

process.env.LLG_ROOT = process.cwd();
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'k-labor-wx-'));
const sectionOf = async (file: string) => (await JSZip.loadAsync(fs.readFileSync(file))).file('Contents/section0.xml')!.async('string');

describe('writeNew — 없을 때만 만든다', () => {
  it('두 번째 쓰기는 false 이고 처음 내용이 그대로 남는다', () => {
    const dir = tmpDir();
    try {
      const f = path.join(dir, '한 파일.txt');
      expect(writeNew(f, '처음')).toBe(true);
      expect(writeNew(f, '나중')).toBe(false);
      expect(fs.readFileSync(f, 'utf8')).toBe('처음');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('없는 폴더처럼 다른 오류는 그대로 던진다', () => {
    expect(() => writeNew(path.join(os.tmpdir(), '없는-폴더-k-labor-wx', 'a.txt'), 'x')).toThrow();
  });
});

describe('nosa 서류 — 같은 이름으로 동시에 만들기', () => {
  const forms = (name: string, outDir: string) => ({
    workplace: { name, ownerName: '김대표', bizNo: '0000000000', address: '서울특별시 가상구 가상로 1', tel: '02-000-0000' },
    headcount: 40, majorityUnion: false, workerMembers: 3, employerMembers: 3, installDate: '2026-12-01', office: '서울지방고용노동청 서울가상지청',
    writtenDate: '2026-11-20', outDir, fileBase: '같은 이름', formats: ['hwpx'],
  });

  it('make_labor_council_forms: 하나만 쓰고, 진 쪽은 아무것도 쓰지 않은 채 거절된다 · 파일은 모두 이긴 쪽 내용', async () => {
    const dir = tmpDir();
    try {
      const names = ['가상가상사', '가상나상사'];
      const rs = await Promise.all(names.map((n) => call('make_labor_council_forms', forms(n, dir))));
      const won = rs.filter((r) => r.ok);
      expect(won).toHaveLength(1);
      const lost = rs.find((r) => !r.ok);
      expect(lost.error).toMatch(/덮어쓰지 않습니다/);
      expect(lost.exists.length).toBeGreaterThan(0);
      expect(lost.written).toBeUndefined();
      const mine = names[rs.indexOf(won[0])];
      const other = names.find((n) => n !== mine)!;
      expect(fs.readdirSync(dir).sort()).toEqual(won[0].files.map((f: { path: string }) => path.basename(f.path)).sort());
      for (const f of won[0].files) {
        const sec = await sectionOf(f.path);
        expect(sec, f.path).not.toContain(other);
      }
      expect(await sectionOf(won[0].files.find((f: { path: string }) => f.path.includes('_01_')).path)).toContain(mine);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('make_council_meeting_docs(minutes): 회의록 .json 까지 이긴 쪽 하나만', async () => {
    const dir = tmpDir();
    try {
      const minutes = (title: string) => ({
        kind: 'minutes', workplace: { name: '가상제조' }, meeting: { kind: '정기', number: 1, date: '2026-12-10' }, seats: { worker: 3, employer: 3 },
        attendance: { worker: 3, employer: 3 }, agenda: [{ title, type: '의결', inFavor: 6 }], writtenDate: '2026-12-10', outDir: dir, formats: ['hwpx'],
      });
      const titles = ['합성 안건 가', '합성 안건 나'];
      const rs = await Promise.all(titles.map((t) => call('make_council_meeting_docs', minutes(t))));
      const won = rs.filter((r) => r.ok);
      expect(won).toHaveLength(1);
      const lost = rs.find((r) => !r.ok);
      expect(lost.written).toBeUndefined();
      const mine = titles[rs.indexOf(won[0])];
      const json = JSON.parse(fs.readFileSync(won[0].files.find((f: { format: string }) => f.format === 'json').path, 'utf8'));
      expect(json.agenda[0].title).toBe(mine);
      expect(fs.readdirSync(dir)).toHaveLength(won[0].files.length);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('make_council_election_docs: 하나만 쓰고 진 쪽은 거절', async () => {
    const dir = tmpDir();
    try {
      const el = (name: string) => ({ workplace: { name }, seats: 3, targetInstallDate: '2026-12-15', candidateCount: 4, writtenDate: '2026-11-20', outDir: dir, fileBase: '같은 선거', formats: ['hwpx'] });
      const rs = await Promise.all(['가상가', '가상나'].map((n) => call('make_council_election_docs', el(n))));
      expect(rs.filter((r) => r.ok)).toHaveLength(1);
      expect(rs.find((r) => !r.ok).written).toBeUndefined();
      expect(fs.readdirSync(dir)).toHaveLength(rs.find((r) => r.ok).files.length);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('export_council_vault: 같은 outDir 로 동시에 내보내면 하나만 쓴다', async () => {
    const dir = tmpDir();
    try {
      const rec = path.join(dir, '기록');
      const m = await call('make_council_meeting_docs', {
        kind: 'minutes', workplace: { name: '가상제조' }, meeting: { kind: '정기', number: 1, date: '2026-03-05' }, seats: { worker: 3, employer: 3 },
        attendance: { worker: 3, employer: 3 }, agenda: [{ title: '합성 안건', type: '의결', inFavor: 6 }], writtenDate: '2026-03-05', outDir: rec, formats: ['hwpx'],
      });
      expect(m.ok).toBe(true);
      const out = path.join(dir, '보관함');
      const rs = await Promise.all([1, 2].map(() => call('export_council_vault', { dir: rec, outDir: out, today: '2026-12-10' })));
      expect(rs.filter((r) => r.ok)).toHaveLength(1);
      expect(rs.find((r) => !r.ok).error).toMatch(/덮어쓰지 않습니다/);
      expect(fs.existsSync(path.join(out, '_회의록대장.xlsx'))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
