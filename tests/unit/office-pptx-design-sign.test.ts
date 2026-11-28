// 서명란(TBM 확인 서명 · 전파 B7 · 교육 E6) — 허용 최대 행 수에서도 표가 바닥줄 위에서 끝나고, 번호 1~N 이 빠짐없이 실린다.
// 칸 높이는 PowerPoint 가 글 한 줄 최소 높이(글자 크기 × 1.2 + 위아래 여백 4pt)보다 낮게 그리지 않는다 — 그 높이로 잰다.
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { makeBroadcastPptx } from '../../src/lib/office/pptx/broadcast';
import { makeEducationPptx } from '../../src/lib/office/pptx/education';
import { makeTbmPptx } from '../../src/lib/office/pptx/tbm';
import { DESIGN_IDS } from '../../src/lib/office/pptx/design';
import { education, meetingFinal, tbm } from './office-pptx-decks.fixture';

const PT = 12700;

async function slideXmls(bytes: Uint8Array): Promise<string[]> {
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));
  return Promise.all(names.map((n) => zip.file(n)!.async('string')));
}

interface Sign {
  slide: number;
  bottom: number;
  footTop: number;
  numbers: number[];
}
function signs(xmls: string[]): Sign[] {
  const out: Sign[] = [];
  xmls.forEach((xml, i) => {
    const foot = (xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? []).filter((sp) => /name="foot:(rule|left)"/.test(sp)).map((sp) => Number(sp.match(/<a:off x="-?\d+" y="(-?\d+)"/)![1]));
    for (const gf of xml.match(/<p:graphicFrame>[\s\S]*?<\/p:graphicFrame>/g) ?? []) {
      if (!/name="part:sign-/.test(gf)) continue;
      const y = Number(gf.match(/<a:off x="-?\d+" y="(-?\d+)"/)![1]);
      const rows = [...gf.matchAll(/<a:tr h="(\d+)">([\s\S]*?)<\/a:tr>/g)];
      let h = 0;
      const numbers: number[] = [];
      rows.forEach(([, rh, body], ri) => {
        const sz = Math.max(...[...body.matchAll(/sz="(\d+)"/g)].map((m) => Number(m[1]) / 100), 8);
        h += Math.max(Number(rh), (sz * 1.2 + 4) * PT);
        const first = body.match(/<a:t>([^<]*)<\/a:t>/)?.[1];
        if (ri > 0 && first && /^\d+$/.test(first)) numbers.push(Number(first));
      });
      out.push({ slide: i + 1, bottom: y + h, footTop: Math.min(...foot), numbers });
    }
  });
  return out;
}

const cases = [
  { deck: 'TBM', rows: 20, make: (design: (typeof DESIGN_IDS)[number], layout: 'A4' | '16:9') => makeTbmPptx(tbm(), { design, layout, signatureRows: 20 }) },
  { deck: '전파 B7', rows: 30, make: (design: (typeof DESIGN_IDS)[number], layout: 'A4' | '16:9') => makeBroadcastPptx(meetingFinal(), { design, layout, signatureRows: 30 }) },
  { deck: '교육 E6', rows: 30, make: (design: (typeof DESIGN_IDS)[number], layout: 'A4' | '16:9') => makeEducationPptx(education(), { design, layout, signatureRows: 30 }) },
];

describe('서명란 최대 행 — 바닥줄 위에서 끝나고 번호가 빠지지 않는다', () => {
  for (const c of cases)
    for (const layout of ['16:9', 'A4'] as const)
      for (const id of DESIGN_IDS)
        it(`${c.deck} ${layout} ${id}`, async () => {
          const r = await c.make(id, layout);
          expect(r.ok).toBe(true);
          const ss = signs(await slideXmls(r.bytes!));
          expect(ss.length).toBeGreaterThan(0);
          for (const s of ss) expect(s.bottom, `${s.slide}장 서명란 바닥 ${(s.bottom / PT).toFixed(1)}pt > 바닥줄 ${(s.footTop / PT).toFixed(1)}pt`).toBeLessThanOrEqual(s.footTop);
          // TBM 은 작업마다 서명란 — 작업별로 1~N 이 다 있어야 한다
          const all = ss.flatMap((s) => s.numbers);
          const tasks = c.deck === 'TBM' ? tbm().tasks.length : 1;
          for (let n = 1; n <= c.rows; n++) expect(all.filter((x) => x === n).length, `번호 ${n}`).toBe(tasks);
          // 들어맞았다는 거짓 경고 없음 — 줄였다는 경고는 실제로 다 실린 장에만
          expect(r.warnings.join('\n')).not.toMatch(/서명[란부] \d+행이 본문 높이에 들도록 글자를 [0-7](\.\d)?pt/);
        });
});
