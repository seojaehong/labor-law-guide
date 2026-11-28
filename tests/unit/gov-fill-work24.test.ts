// 고용24 육아기 단축 확인서 칸 대응표·채울 계획 — 크롬 확장이 그대로 실행한다. 값은 합성.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { ALLOWED_IDS, WORK24_CHILDCARE_REDUCTION as T, childcareReductionFillPlan as plan } from '@/lib/gov-fill/work24';

const SPEC = { start: '2026-11-02', end: '2027-04-30', weeklyBefore: '40', weeklyAfter: '24', ordinaryWage: '3,000,000', monthlyHours: '209' };
const TODAY = '2026-11-28';

describe('웹스토어 묶음', () => {
  it('개발용 localhost 를 빼고, 운영 두 주소와 고용24 화면만 남긴다', async () => {
    const { storeManifest, storeBackground } = await import('../../scripts/pack-work24-fill.mjs');
    const m = JSON.parse(storeManifest(fs.readFileSync('extensions/work24-fill/manifest.json', 'utf8')));
    const all = m.content_scripts.flatMap((c: { matches: string[] }) => c.matches);
    expect(all.join()).not.toMatch(/localhost/);
    expect(all).toContain('https://yellowenvelope.kr/tools/childcare-reduction*');
    expect(all).toContain('https://www.work24.go.kr/ei/b/b/1500/openHPEIBB1500M06.do*');
    expect(m.permissions).toEqual(['storage']);
    expect(m.icons['128']).toBe('icons/icon128.png');
    const bg = storeBackground(fs.readFileSync('extensions/work24-fill/background.js', 'utf8'));
    expect(bg).not.toMatch(/localhost/);
    expect(bg).toContain("'https://www.yellowenvelope.kr']");
  });
});

describe('고용24에 넣기 안내 문구', () => {
  it('금지어·느낌표 없음, 대신 신청·제출한다는 말 없음', async () => {
    const { HANDOFF_COPY } = await import('@/app/tools/childcare-reduction/Work24Handoff');
    const { bannedHits } = await import('@/lib/tool-kit/banned');
    const t = Object.values(HANDOFF_COPY).join(' ') + ' ' + plan({ ...SPEC, start: '2027-01-01', monthlyHours: '' }, TODAY).problems.join(' ');
    expect(bannedHits(t)).toEqual([]);
    expect(t).not.toMatch(/!|대신 신청|신청해 드|제출해 드|접수해 드/);
  });
});

describe('고용24 육아기 단축 확인서 — 채울 계획', () => {
  it('엔진 값 → 확인서 칸 id 7개(insconn work24_fill 과 같은 순서·값)', () => {
    const r = plan(SPEC, TODAY);
    expect(r.problems).toEqual([]);
    expect(r.steps.map((s) => [s.id, s.value, s.kind])).toEqual([
      ['layoffAlwncPdBeginDe', '2026-11-02', 'text'],
      ['layoffAlwncPdEndDe', '2027-04-30', 'text'],
      ['bfeAppontWorkhr', '40', 'text'],
      ['afAppontWorkhr', '24', 'text'],
      ['odygsAmSelE', '', 'radio'],
      ['odygsAm', '3000000', 'text'],
      ['appontWorkhr', '209', 'text'],
    ]);
  });
  it('통상임금 종류는 라디오 하나', () => {
    expect(plan({ ...SPEC, wageUnit: 'hour' }, TODAY).steps.find((s) => s.kind === 'radio')?.id).toBe('odygsAmSelB');
    expect(plan({ ...SPEC, wageUnit: 'year' as never }, TODAY).problems.join()).toMatch(/통상임금 종류/);
  });
  it('시작일이 오늘보다 늦으면 넣지 않는다(고용24 화면 동작) — 경계 양쪽', () => {
    expect(plan({ ...SPEC, start: TODAY }, TODAY).problems).toEqual([]);
    expect(plan({ ...SPEC, start: '2026-11-29' }, TODAY).problems.join()).toMatch(/시작된 뒤/);
  });
  it('형식이 틀리면 계획을 내지 않는다 — 월 소정근로시간은 사용자가 넣는다', () => {
    for (const bad of [{ start: '2026-11-2' }, { end: '2026-10-01' }, { ordinaryWage: '삼백만' }, { weeklyAfter: '24.55' }, { monthlyHours: '' }]) {
      const r = plan({ ...SPEC, ...bad }, TODAY);
      expect(r.steps).toEqual([]);
      expect(r.problems.length).toBeGreaterThan(0);
    }
  });
  it('허용 칸에 주민번호·비밀번호·첨부 칸이 없다', () => {
    for (const id of ALLOWED_IDS) expect(id).not.toMatch(/encpt|ihidnm|pwd|^files_|ssn|rrn/i);
    expect(new Set(plan(SPEC, TODAY).steps.map((s) => s.id)).size).toBe(7);
    for (const s of plan(SPEC, TODAY).steps) expect(ALLOWED_IDS).toContain(s.id);
  });
  it('크롬 확장 실행기의 허용 목록·화면 경로가 엔진 대응표와 같다(두 벌 고정)', () => {
    const src = fs.readFileSync('extensions/work24-fill/fill.js', 'utf8');
    const allow = JSON.parse(/const ALLOW = (\[[^\]]*\]);/.exec(src)![1]);
    expect([...allow].sort()).toEqual([...ALLOWED_IDS].sort());
    expect(src).toContain(`const PATH = '${T.path}';`);
    const manifest = JSON.parse(fs.readFileSync('extensions/work24-fill/manifest.json', 'utf8'));
    expect(JSON.stringify(manifest)).not.toMatch(/"<all_urls>"|"webRequest"|"cookies"/);
  });
});
