// 덱 디자인 프리셋 조각 2-가 — 전파 덱 나머지 장(B2·B4~B7) 부품 배치와 남은 작은 결함.
// (a) 프리셋 주의색 대비 · (b) 「한 장 N건」 경고 숫자 · (c) 전 장 ko-KR · (d) quiet 히어로 두 자리 · (g) app 색이 남의 색표와 같지 않음.
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { makeBroadcastPptx } from '../../src/lib/office/pptx/broadcast';
import type { MeetingSnapshot } from '../../src/lib/office/pptx/meeting';
import { DESIGN_IDS, contrastRatio, designsFor, getDeckDesign, type DesignId } from '../../src/lib/office/pptx/design';
import { finalSnapshotForDesign, manyActions } from './office-pptx-design.fixture';

async function slideXmls(bytes: Uint8Array): Promise<string[]> {
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));
  return Promise.all(names.map((n) => zip.file(n)!.async('string')));
}
const names = (xml: string) => [...xml.matchAll(/<p:cNvPr id="\d+" name="([^"]+)"/g)].map((m) => m[1]);
/** 글 조각마다 (글자색, 글). 색이 없는 조각은 빈 문자열 */
const runs = (xml: string) =>
  [...xml.matchAll(/<a:rPr([^>]*)>((?:(?!<\/a:rPr>)[\s\S])*?)<\/a:rPr>\s*<a:t>([^<]*)<\/a:t>/g)].map((m) => ({
    attrs: m[1],
    color: m[2].match(/<a:srgbClr val="([0-9A-Fa-f]{6})"/)?.[1]?.toUpperCase() ?? '',
    text: m[3],
  }));

/** 상태가 고루 든 스냅숏 — 변경·신규 위험, 완료·미완료·재조치·기한초과 */
function statusSnap(): MeetingSnapshot {
  const s = finalSnapshotForDesign();
  s.prior = [
    { id: 'R-01', hazard: '전회 위험 1', status: '완료', result: '경보기 설치 완료' },
    { id: 'R-02', hazard: '전회 위험 2', status: '미완료' },
    { id: 'R-04', hazard: '전회 위험 4', status: '재조치', result: '고정 장치 다시 설치' },
    { id: 'R-05', hazard: '전회 위험 5', status: '기한초과' },
  ];
  return s;
}

describe('(a) 프리셋 주의색 — 「변경」·「재조치」 글이 프리셋 바탕에서 대비 4.5:1', () => {
  for (const id of DESIGN_IDS)
    it(`${id}`, async () => {
      const d = getDeckDesign(id);
      const r = await makeBroadcastPptx(statusSnap(), { design: id });
      expect(r.ok, (r.errors ?? []).join()).toBe(true);
      const xml = await slideXmls(r.bytes!);
      const all = xml.join('\n');
      expect(all, '회의 덱 주의색(B7791F)이 프리셋 판에 남음').not.toContain('B7791F');
      const C = d.tokens.colors as Record<string, string>;
      for (const k of ['caution', 'positive', 'negative']) {
        expect(C[k], `${id} ${k} 색 없음`).toMatch(/^[0-9A-F]{6}$/);
        expect(d.textPairs.some(([f, b]) => f === k && b === 'bg'), `${id} textPairs 에 [${k}, bg] 없음`).toBe(true);
      }
      const want: Record<string, string> = { 변경: C.caution, 재조치: C.caution, 완료: C.positive, 미완료: C.negative, 기한초과: C.negative };
      for (const [word, col] of Object.entries(want)) {
        const hit = runs(all).filter((x) => x.text.trim() === word);
        expect(hit.length, `${id} 「${word}」 글 없음`).toBeGreaterThan(0);
        for (const h of hit) expect(h.color, `${id} 「${word}」 색`).toBe(col);
      }
      // textPairs 가 적은 짝은 모두 대비 통과(새 짝 포함)
      for (const [fg, bg] of d.textPairs) expect(contrastRatio(C[fg], C[bg]), `${id} ${fg}/${bg}`).toBeGreaterThanOrEqual(4.5);
    });
});

describe('(b) 대책 장 축소 경고의 「한 장 N건」은 실제 첫 장 건수', () => {
  for (const id of DESIGN_IDS)
    it(`${id} — 대책 20건`, async () => {
      const r = await makeBroadcastPptx(manyActions(20), { design: id });
      const first = r.slides.find((s) => s.code === 'B3')!;
      const xml = (await slideXmls(r.bytes!))[first.no - 1];
      const n = new Set([...xml.matchAll(/대책 (\d+) 통로 조명 교체/g)].map((m) => m[1])).size;
      const w = r.warnings.find((x) => x.startsWith(`B3(${id}): 대책 20건`))!;
      expect(w).toBeTruthy();
      expect(w.match(/축소\(한 장 (\d+)건/)?.[1], w).toBe(String(n));
    });
});

describe('(c) 프리셋을 고르면 전 장 글 언어 ko-KR', () => {
  for (const id of DESIGN_IDS)
    it(`${id}`, async () => {
      const r = await makeBroadcastPptx(statusSnap(), { design: id });
      const xml = await slideXmls(r.bytes!);
      xml.forEach((x, i) => {
        const ko = runs(x).filter((m) => /[가-힣]/.test(m.text));
        expect(ko.length, `${id} ${i + 1}장`).toBeGreaterThan(0);
        for (const m of ko) expect(m.attrs, `${id} ${i + 1}장 「${m.text}」`).toContain('lang="ko-KR"');
      });
    });
});

describe('(d) designsFor — quiet 히어로(첫 요약 수) 칸에 두 자리 수가 드는지 본다', () => {
  it('새로 생기거나 바뀐 위험 12건이면 quiet 는 ok=false, 이유에 「12」', () => {
    const s = finalSnapshotForDesign();
    s.hazards = Array.from({ length: 12 }, (_, i) => ({ id: `N-${i + 1}`, situation: `합성 위험 ${i + 1}`, cause: '', consequence: '', kind: 'new' as const }));
    const q = designsFor(s).find((x) => x.id === 'quiet')!;
    expect(q.ok).toBe(false);
    expect(q.reason).toContain('「12」');
  });
  it('한 자리면 quiet 도 ok', () => {
    expect(designsFor(finalSnapshotForDesign()).find((x) => x.id === 'quiet')!.ok).toBe(true);
  });
});

describe('(g) app 색은 남의 색표 값을 그대로 쓰지 않는다', () => {
  // 널리 알려진 앱 색표의 회색·파랑 값 — 하나라도 같으면 그 브랜드를 흉내 낸 것으로 보인다
  const KNOWN = ['F9FAFB', 'F2F4F6', 'E5E8EB', 'D1D6DB', 'B0B8C1', '8B95A1', '6B7684', '4E5968', '333D4B', '191F28', '3182F6', '1B64DA', 'E5484D'];
  it('app 색 값이 하나도 겹치지 않고 대비는 그대로 통과', () => {
    const d = getDeckDesign('app');
    for (const [k, v] of Object.entries(d.tokens.colors)) expect(KNOWN, `app ${k}=${v}`).not.toContain(v);
  });
});

// PowerPoint COM 실측(261128): 한 줄 글의 실제 높이 = 1.2 × 글자 크기. 요약 수 칸이 그보다 낮으면 글이 칸 밖으로 나온다
describe('요약 장(B1) 큰 숫자·app 두 줄 문장 칸 높이 ≥ 글 높이', () => {
  for (const id of DESIGN_IDS)
    it(`${id}`, async () => {
      const r = await makeBroadcastPptx(statusSnap(), { design: id });
      const [xml] = await slideXmls(r.bytes!);
      for (const m of xml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)) {
        const sp = m[1];
        const text = [...sp.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => t[1]).join('');
        const sz = Math.max(0, ...[...sp.matchAll(/ sz="(\d+)"/g)].map((t) => Number(t[1]) / 100));
        const h = Number(sp.match(/<a:ext cx="\d+" cy="(\d+)"/)?.[1] ?? 0) / 12700;
        const spc = Number(sp.match(/<a:spcPct val="(\d+)"/)?.[1] ?? 100000) / 100000;
        const lines = Math.max(1, (sp.match(/<a:p>/g) ?? []).length); // 문단(breakLine) 수
        if (/^\d+(\/\d+)?$/.test(text) || sp.includes('name="title"')) expect(h + 0.5, `${id} 「${text}」 ${sz}pt`).toBeGreaterThanOrEqual(lines * 1.2 * sz * spc);
      }
    });
});

// 나머지 장 부품 — 프리셋마다 대책 장(B3) 문법을 따른 목록·서명란 부품 이름(objectName)
const FAMILY: Record<DesignId, string> = { quiet: 'hairline', field: 'rowcard', app: 'chipcard', report: 'grid', story: 'storycard' };

describe('나머지 장(B2·B4~B7)도 프리셋 부품 배치', () => {
  for (const id of DESIGN_IDS)
    it(`${id} — 목록 장은 part:list-${FAMILY[id]}, 서명란은 part:sign-${FAMILY[id]}, 다른 프리셋 부품 없음`, async () => {
      const r = await makeBroadcastPptx(statusSnap(), { design: id });
      const xml = await slideXmls(r.bytes!);
      const fam = FAMILY[id];
      const others = DESIGN_IDS.filter((o) => o !== id).map((o) => FAMILY[o]);
      r.slides.forEach((sl, i) => {
        const n = names(xml[i]);
        if (['B2', 'B4', 'B5', 'B6'].includes(sl.code)) expect(n, `${id} ${sl.code}`).toContain(`part:list-${fam}`);
        if (sl.code === 'B7') expect(n, `${id} B7`).toContain(`part:sign-${fam}`);
        for (const o of others) expect(n.some((x) => [`part:list-${o}`, `part:sign-${o}`, `part:empty-${o}`].includes(x)), `${id} ${sl.code} 에 ${o} 부품`).toBe(false);
      });
      // 정보 구조는 그대로 — 칸 이름과 원문
      const all = xml.join('\n');
      for (const m of ['구분', '원인 → 결과', '위험성', '의견', '결과', '상태', '조치 결과', '미룬 이유', '다시 볼 날', '소속·역할', '서명', '야간 통로 어두움', '조명 부족 → 넘어짐', '통로 조명이 어둡다', '휴게실이 좁다', '이번 회의에서 결정 없음', '경보기 설치 완료', '설비 교체 예정', '2027-03-31']) expect(all, `${id} 「${m}」`).toContain(m);
    });

  for (const id of DESIGN_IDS)
    it(`${id} — 목록이 비면 part:empty-${FAMILY[id]} 에 「없음」 한 줄`, async () => {
      const s = finalSnapshotForDesign();
      s.hazards = [];
      s.opinions = [];
      s.prior = [];
      s.deferred = [];
      s.actions = [];
      const r = await makeBroadcastPptx(s, { design: id });
      expect(r.ok, (r.errors ?? []).join()).toBe(true);
      const xml = await slideXmls(r.bytes!);
      for (const code of ['B2', 'B3', 'B4', 'B5', 'B6']) {
        const i = r.slides.findIndex((x) => x.code === code);
        expect(names(xml[i]), `${id} ${code}`).toContain(`part:empty-${FAMILY[id]}`);
      }
    });

  it('프리셋 판에서 한 행만으로도 본문 높이를 넘으면 원문 그대로 싣고 warnings·overflowEstimates 에 남긴다', async () => {
    const s = finalSnapshotForDesign();
    const huge = '작업 전 사다리 상단 고정 장치를 설치하고 두 사람이 한 조로 작업한다 '.repeat(30);
    s.opinions = [{ id: 'O-9', from: '근로자(역할)', text: huge, relatedIds: [] }];
    for (const id of DESIGN_IDS) {
      const r = await makeBroadcastPptx(s, { design: id });
      expect((await slideXmls(r.bytes!)).join('\n')).toContain(huge.trim());
      expect(r.warnings.join(' '), id).toContain('B4');
      expect(r.overflowEstimates.some((o) => o.code === 'B4' && o.ref === 'O-9'), id).toBe(true);
    }
  });
});
