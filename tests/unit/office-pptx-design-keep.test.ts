// 프리셋 판 좁은 칸 — 날짜·상태·구분·확인자 같은 짧은 낱말이 칸 폭 때문에 낱말 가운데서 끊기지 않는다.
// 덱 출력(슬라이드 XML)에서 그 글이 든 글 상자·표 칸의 폭을 재, 가장 긴 낱말(띄어쓰기 단위)이 한 줄에 드는지 본다.
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { makeMeetingPptx } from '../../src/lib/office/pptx/meeting';
import { makeTbmPptx } from '../../src/lib/office/pptx/tbm';
import { DESIGN_IDS } from '../../src/lib/office/pptx/design';
import { capacityOf, textUnits } from '../../src/lib/office/pptx/text-units';
import { meetingFinal, meetingPre, tbm } from './office-pptx-decks.fixture';

const EMU = 914400;

async function slideXmls(bytes: Uint8Array): Promise<string[]> {
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));
  return Promise.all(names.map((n) => zip.file(n)!.async('string')));
}

interface Hit {
  text: string;
  wIn: number;
  pt: number;
}

/** 글 상자(p:sp)와 표 칸(a:tc)마다 (글, 글 폭 in, 글자 크기 pt) */
function textBoxes(xml: string): Hit[] {
  const out: Hit[] = [];
  const runsOf = (body: string) => [...body.matchAll(/<a:rPr[^>]*?sz="(\d+)"[^>]*>[\s\S]*?<a:t>([^<]*)<\/a:t>/g)].map((m) => ({ pt: Number(m[1]) / 100, text: m[2] }));
  for (const sp of xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? []) {
    const cx = Number(sp.match(/<a:ext cx="(\d+)"/)?.[1] ?? 0);
    const body = sp.match(/<a:bodyPr([^>]*)>/)?.[1] ?? '';
    const l = Number(body.match(/lIns="(\d+)"/)?.[1] ?? 91440);
    const r = Number(body.match(/rIns="(\d+)"/)?.[1] ?? 91440);
    for (const run of runsOf(sp)) out.push({ text: run.text, pt: run.pt, wIn: (cx - l - r) / EMU });
  }
  for (const tbl of xml.match(/<a:tbl>[\s\S]*?<\/a:tbl>/g) ?? []) {
    const grid = [...tbl.matchAll(/<a:gridCol w="(\d+)"/g)].map((m) => Number(m[1]));
    for (const tr of tbl.match(/<a:tr [\s\S]*?<\/a:tr>/g) ?? []) {
      (tr.match(/<a:tc>[\s\S]*?<\/a:tc>/g) ?? []).forEach((tc, ci) => {
        const pr = tc.match(/<a:tcPr([^>]*)>/)?.[1] ?? '';
        const l = Number(pr.match(/marL="(\d+)"/)?.[1] ?? 91440);
        const r = Number(pr.match(/marR="(\d+)"/)?.[1] ?? 91440);
        for (const run of runsOf(tc)) out.push({ text: run.text, pt: run.pt, wIn: (grid[ci] - l - r) / EMU });
      });
    }
  }
  return out;
}

const STATUS = new Set(['완료', '미완료', '기한초과', '재조치']);
const keepish = (t: string) => /^\d{4}-\d{2}-\d{2}$/.test(t) || STATUS.has(t) || /^\S+\(역할\)$/.test(t) || /^\S+ \S+\(역할\)$/.test(t) || / · /.test(t);

/** 낱말 하나라도 한 줄에 들지 않는 글 */
async function broken(bytes: Uint8Array, only: (t: string) => boolean): Promise<string[]> {
  const bad: string[] = [];
  (await slideXmls(bytes)).forEach((xml, i) => {
    for (const h of textBoxes(xml)) {
      if (!only(h.text)) continue;
      const per = capacityOf(h.wIn, h.pt, 1);
      for (const tok of h.text.split(/\s+/).filter(Boolean)) if (textUnits(tok) > per) bad.push(`${i + 1}장 「${h.text}」의 「${tok}」(${textUnits(tok)}) > 한 줄 ${per}`);
    }
  });
  return bad;
}

describe('좁은 칸 — 날짜·상태·확인자 낱말이 가운데서 끊기지 않는다(16:9)', () => {
  for (const id of DESIGN_IDS) {
    it(`회의 전(P4 전회 이행) ${id}`, async () => {
      const r = await makeMeetingPptx(meetingPre(), { kind: 'pre', design: id });
      expect(r.ok).toBe(true);
      expect(await broken(r.bytes!, keepish)).toEqual([]);
    });
    it(`회의 후(F4 조치 계획·F5·F7) ${id}`, async () => {
      const r = await makeMeetingPptx(meetingFinal(), { kind: 'final', design: id });
      expect(r.ok).toBe(true);
      expect(await broken(r.bytes!, keepish)).toEqual([]);
    });
    it(`TBM 구분 칸 ${id}`, async () => {
      const r = await makeTbmPptx(tbm(), { design: id });
      expect(r.ok).toBe(true);
      expect(await broken(r.bytes!, (t) => / · /.test(t) && /^\d/.test(t))).toEqual([]);
    });
  }
});
