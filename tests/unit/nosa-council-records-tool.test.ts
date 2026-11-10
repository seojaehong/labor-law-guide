// nosa 기록 묶음(로컬 전용) — 이행·회의록 이력 덧붙이기, 옵시디언 보관함·회의록 대장 내보내기, 회의록 자동 채움.
// 등록 함수를 가짜 서버에 걸어 처리 함수를 바로 부른다. 사업장·사람은 합성 값, 주민번호는 가상 모양.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import path from 'node:path';

import { registerNosa } from '../../tools/k-labor/groups/nosa.mjs';
import { registerNosaRecords, nosaRecordsTools } from '../../tools/k-labor/groups/nosa-records.mjs';
import { nosaRemoteSafe } from '../../tools/k-labor/groups/nosa.mjs';
import { bannedHits } from '@/lib/tool-kit/banned';
import { wikilinks } from '@/lib/nosa-council/records';

type Handler = (a: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
type Reg = { name: string; cfg: { title?: string; description?: string; inputSchema?: Record<string, unknown>; annotations?: Record<string, boolean> }; handler: Handler };
const tools: Reg[] = [];
const s = { registerTool(name: string, cfg: Reg['cfg'], handler: Handler) { tools.push({ name, cfg, handler }); } };
registerNosa(s);
registerNosaRecords(s);
const call = async (n: string, a: Record<string, unknown>) => JSON.parse((await tools.find((t) => t.name === n)!.handler(a)).content[0].text);
const WORDS = ['노무사', '상담', '자문', '진단', '판정', '적법', '확률', '체불', '위법', '승소', '받을 수 있는 금액', '포괄', '대신', '대행', '대리', '지도'];

process.env.LLG_ROOT = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nosa-records-'));
const dir = path.join(tmp, '기록');
const M = (n: number, date: string, agenda: unknown[], extra: Record<string, unknown> = {}) => ({
  kind: 'minutes', workplace: { name: '가상제조' }, meeting: { kind: '정기', number: n, date }, seats: { worker: 5, employer: 5 }, attendance: { worker: 5, employer: 5 },
  agenda, writtenDate: date, outDir: dir, formats: ['hwpx'], ...extra,
});

describe('nosa 기록 묶음 — 목록', () => {
  it('로컬 전용이고 원격 가능 목록에 없다 · 금지어 없음', () => {
    expect(nosaRecordsTools).toEqual(['record_council_history', 'export_council_vault', 'import_council_minutes']);
    for (const n of nosaRecordsTools) {
      expect(nosaRemoteSafe).not.toContain(n);
      const t = tools.find((x) => x.name === n)!;
      expect(t.cfg.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
      expect(bannedHits(`${t.cfg.title} ${t.cfg.description}`, WORDS)).toEqual([]);
    }
  });
});

describe('이력 덧붙이기 → 다음 회의록 자동 채움 → 보관함', () => {
  it('회의록 두 건을 만들고 이행 기록을 덧붙인다(정정해도 앞 줄은 그대로)', async () => {
    const a = await call('make_council_meeting_docs', M(1, '2026-03-05', [
      { title: '안전화 지급 기준', type: '의결', article: '21-3', proposer: '근로자위원', inFavor: 9, implementation: { action: '지급', due: '2026-04-30' } },
      { id: 'A-20260305-02', title: '야간 작업 순환', type: '협의', article: '20-7', discussion: [{ side: '근로자위원', summary: '[[링크]] #태그 를 그대로' }] },
    ]));
    expect(a.ok).toBe(true);
    const r1 = await call('record_council_history', { dir, kind: 'implementation', implementation: { date: '2026-04-10', agendaId: 'A-20260305-01', status: '진행', owner: '총무팀장' } });
    expect(r1.ok).toBe(true);
    expect(r1.record.seq).toBe(1);
    const log = path.join(dir, '_이행기록.jsonl');
    const before = fs.readFileSync(log, 'utf8');
    const r2 = await call('record_council_history', { dir, kind: 'implementation', implementation: { date: '2026-04-20', agendaId: 'A-20260305-01', status: '완료', corrects: 1 } });
    expect(r2.record.seq).toBe(2);
    expect(r2.current).toBe('완료(근거 없음)');
    expect(fs.readFileSync(log, 'utf8').startsWith(before)).toBe(true);
    const bad = await call('record_council_history', { dir, kind: 'implementation', implementation: { date: '2026-04-31', agendaId: 'A-1', status: '끝' } });
    expect(bad.ok).toBe(false);
    expect(fs.readFileSync(log, 'utf8').split('\n').filter(Boolean)).toHaveLength(2);
  }, 60_000);

  it('historyDir 를 주면 회의록의 전분기 이행 상황을 이력에서 채운다', async () => {
    const b = await call('make_council_meeting_docs', { ...M(2, '2026-06-04', [{ id: 'A-20260305-02', title: '야간 작업 순환', type: '협의', article: '20-7', carriedOver: true }]), historyDir: dir });
    expect(b.ok).toBe(true);
    expect(b.previousFilled).toEqual([{ agendaId: 'A-20260305-01', status: '완료(근거 없음)' }]);
    const json = JSON.parse(fs.readFileSync(b.files.find((f: { format: string }) => f.format === 'json').path, 'utf8'));
    expect(json.previousResolutions[0]).toMatchObject({ agendaId: 'A-20260305-01', status: '완료', evidenceMissing: true, due: '2026-04-30' });
  }, 60_000);

  it('회의록 이력 — 서명본 경로를 주면 해시를 남긴다', async () => {
    const signed = path.join(tmp, '1차_서명.pdf');
    fs.writeFileSync(signed, 'signed v1');
    const e = await call('record_council_history', { dir, kind: 'minutes', minutes: { meetingKey: '2026-정기-1차', stage: '서명 완료', date: '2026-03-10', version: 1, path: signed } });
    expect(e.ok).toBe(true);
    expect(e.record.sha256).toMatch(/^[0-9a-f]{64}$/);
    const missing = await call('record_council_history', { dir, kind: 'minutes', minutes: { meetingKey: '2026-정기-1차', stage: '수정', date: '2026-03-11', reason: '오기', path: path.join(tmp, '없음.pdf') } });
    expect(missing.ok).toBe(false);
  });

  it('보관함 — md·대시보드·회의록 대장(md·xlsx), 깨진 링크 0, 자유 글은 링크가 되지 않는다, 덮어쓰지 않는다', async () => {
    const out = path.join(tmp, 'vault');
    const v = await call('export_council_vault', { dir, outDir: out, today: '2026-12-10' });
    expect(v.ok).toBe(true);
    expect(v.brokenLinks).toEqual([]);
    expect(v.counts).toMatchObject({ meetings: 2, carried: 1 });
    for (const f of ['_대시보드.md', '_회의록대장.md', '_회의록대장.xlsx', '안건/A-20260305-02.md', '이행/A-20260305-01 이행.md']) expect(fs.existsSync(path.join(out, f)), f).toBe(true);
    const md = fs.readdirSync(out, { recursive: true }).map(String).filter((p) => p.endsWith('.md'));
    const names = new Set(md.map((p) => path.basename(p, '.md')));
    for (const p of md) for (const l of wikilinks(fs.readFileSync(path.join(out, p), 'utf8'))) expect(names.has(l), `${p} → ${l}`).toBe(true);
    expect(fs.readFileSync(path.join(out, '안건/A-20260305-02.md'), 'utf8')).toContain('\\[\\[링크\\]\\]');
    expect(v.warnings.join()).toMatch(/2026-정기-2차.*서명/);
    expect(bannedHits(JSON.stringify(v) + md.map((p) => fs.readFileSync(path.join(out, p), 'utf8')).join(''), WORDS)).toEqual([]);
    const again = await call('export_council_vault', { dir, outDir: out, today: '2026-12-10' });
    expect(again.ok).toBe(false);
    expect(again.exists.length).toBeGreaterThan(0);
  }, 60_000);

  it('서명본이 바뀌면 대장이 알린다', async () => {
    fs.writeFileSync(path.join(tmp, '1차_서명.pdf'), 'signed v1 — 나중에 고침');
    const v = await call('export_council_vault', { dir, outDir: path.join(tmp, 'vault2'), today: '2026-12-10' });
    expect(v.warnings.join()).toMatch(/2026-정기-1차 서명본.*바뀌었다/);
  }, 60_000);

  it('주민등록번호 모양이면 기록하지 않는다', async () => {
    const r = await call('record_council_history', { dir, kind: 'implementation', implementation: { date: '2026-05-01', agendaId: 'A-20260305-01', status: '진행', content: '900101-1234568' } });
    expect(r.ok).toBe(false);
  });
});

describe('import_council_minutes — 원문 글자 → 모델 제안 → 도구 확인 → 가져옴(확인 전)', () => {
  const srcDir = path.join(tmp, '옛 회의록');
  const hash = (p: string) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  const jsons = () => fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort();
  let source = '';
  let sha = '';
  const proposal = {
    workplace: { name: '가상제조' }, meeting: { kind: '정기', number: 3, date: '2026-09-03' }, seats: { worker: 5, employer: 5 },
    agenda: [
      { id: 'A-20260305-02', title: '야간 작업 순환', type: '협의', article: '20-7', result: '계속 협의', carriedOver: true },
      { id: 'A-20260903-02', title: '야간작업 순환 방식', type: '의결', article: '20-7', proposer: '근로자위원', result: '의결', decision: '4주 단위 순환' },
    ],
    writtenDate: '2026-09-04',
  };

  it('읽기 — 원본 글자·해시와 기록 폴더의 회의 키·안건 ID 를 돌려주고 아무것도 쓰지 않는다', async () => {
    const made = await call('make_council_meeting_docs', M(3, '2026-09-03', [{ title: '야간 작업 순환', type: '협의' }, { title: '야간작업 순환 방식', type: '의결', inFavor: 9 }], { outDir: srcDir }));
    source = made.files.find((f: { path: string }) => f.path.endsWith('_상세회의록.hwpx')).path;
    const before = fs.readdirSync(dir).sort();
    const r = await call('import_council_minutes', { dir, source });
    expect(r.ok).toBe(true);
    expect(r.step).toBe('read');
    expect(r.sha256).toBe(hash(source));
    sha = r.sha256;
    expect(r.text).toContain('야간작업 순환 방식');
    expect(r.existing.meetings).toEqual(['2026-정기-1차', '2026-정기-2차']);
    expect(r.existing.agenda).toContainEqual(expect.objectContaining({ id: 'A-20260305-02' }));
    expect(fs.readdirSync(dir).sort()).toEqual(before);
  }, 60_000);

  it('저장 — 확인을 통과하면 「가져옴 — 확인 전」 .json 을 쓰고, 원본은 옮기지 않고 경로·해시만 남긴다', async () => {
    const r = await call('import_council_minutes', { dir, source, sourceSha256: sha, proposal });
    expect(r.ok).toBe(true);
    expect(r.status).toBe('가져옴 — 확인 전');
    expect(r.meetingKey).toBe('2026-정기-3차');
    expect(path.dirname(r.file)).toBe(path.resolve(dir));
    const json = JSON.parse(fs.readFileSync(r.file, 'utf8'));
    expect(json.import).toEqual({ status: '가져옴 — 확인 전', source: { path: path.resolve(source), sha256: sha } });
    expect(json.agenda.map((a: { result: string }) => a.result)).toEqual(['계속 협의', '의결']);
    expect(fs.existsSync(source) && hash(source)).toBe(sha);
    expect(r.sameId).toEqual([{ id: 'A-20260305-02', meetings: ['2026-정기-1차', '2026-정기-2차'] }]);
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(r.textWarnings ?? []).toEqual([]);
    expect(bannedHits(JSON.stringify(r) + JSON.stringify(json), WORDS)).toEqual([]);
    const again = await call('import_council_minutes', { dir, source, sourceSha256: sha, proposal });
    expect(again.ok).toBe(false);
  }, 60_000);

  it('막는다 — 읽은 뒤 원본이 바뀌었거나, 구조가 맞지 않거나, 주민등록번호 모양이면 쓰지 않는다', async () => {
    const before = jsons();
    const other = (n: number) => ({ ...proposal, meeting: { ...proposal.meeting, number: n } });
    const changed = await call('import_council_minutes', { dir, source, sourceSha256: '0'.repeat(64), proposal: other(4) });
    expect(changed.ok).toBe(false);
    expect(changed.error).toMatch(/바뀌었/);
    const bad = await call('import_council_minutes', { dir, source, proposal: { ...other(5), agenda: [{ id: 'X-1', title: '야간 작업 순환', type: '보고', result: '의결' }] } });
    expect(bad.ok).toBe(false);
    expect(bad.errors.join()).toMatch(/보고 완료/);
    const rrn = await call('import_council_minutes', { dir, source, proposal: { ...other(6), otherNotes: '900101-1234568' } });
    expect(rrn.ok).toBe(false);
    expect(jsons()).toEqual(before);
  });

  it('확인 전에는 보관함에서 잇지 않고, 「가져옴 확인」 뒤에 이월 선이 생긴다 · 원본이 바뀌면 대장이 알린다', async () => {
    const v1 = await call('export_council_vault', { dir, outDir: path.join(tmp, 'vault-imp1'), today: '2026-09-10' });
    expect(v1.dashboard.unconfirmed).toEqual(['2026-정기-3차']);
    expect(v1.counts.carried).toBe(1);
    expect(v1.brokenLinks).toEqual([]);
    expect(wikilinks(fs.readFileSync(path.join(tmp, 'vault-imp1', '회의', '2026-정기-3차.md'), 'utf8'))).toEqual([]);
    const c = await call('record_council_history', { dir, kind: 'minutes', minutes: { meetingKey: '2026-정기-3차', stage: '가져옴 확인', date: '2026-09-10' } });
    expect(c.ok).toBe(true);
    const v2 = await call('export_council_vault', { dir, outDir: path.join(tmp, 'vault-imp2'), today: '2026-09-10' });
    expect(v2.dashboard.unconfirmed).toEqual([]);
    expect(v2.counts.carried).toBe(2);
    expect(v2.brokenLinks).toEqual([]);
    fs.appendFileSync(source, 'x');
    const v3 = await call('export_council_vault', { dir, outDir: path.join(tmp, 'vault-imp3'), today: '2026-09-10' });
    expect(v3.warnings.join()).toMatch(/2026-정기-3차 가져온 원본.*바뀌었다/);
  }, 60_000);
});
