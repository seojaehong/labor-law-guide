// 상태 알약(app 흰 알약 · story 테두리 캡슐) — 위쪽 테두리가 바로 위 칸 이름(「상태」·「허용 여부」·「구분」)에 닿지 않는다.
// 알약 안 글은 옆 칸 값과 거의 같은 줄(88d321de) — 알약 글 위치는 값 글 위치에서 4px 안.
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { makeMeetingPptx } from '../../src/lib/office/pptx/meeting';
import { makeEducationPptx } from '../../src/lib/office/pptx/education';
import { makeTbmPptx } from '../../src/lib/office/pptx/tbm';
import { designScale } from '../../src/lib/office/pptx/design';
import { education, meetingFinal, meetingPre, tbm } from './office-pptx-decks.fixture';

const EMU = 914400;
const PX = designScale(13.33, 7.5).k * EMU; // 시안 1px 의 EMU

interface Box {
  name: string;
  x: number;
  y: number;
  cy: number;
  text: string;
}
async function boxes(bytes: Uint8Array): Promise<Box[][]> {
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  const xmls = await Promise.all(names.map((n) => zip.file(n)!.async('string')));
  return xmls.map((xml) =>
    (xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? []).map((sp) => ({
      name: sp.match(/name="([^"]*)"/)?.[1] ?? '',
      x: Number(sp.match(/<a:off x="(-?\d+)"/)?.[1] ?? 0),
      y: Number(sp.match(/<a:off x="-?\d+" y="(-?\d+)"/)?.[1] ?? 0),
      cy: Number(sp.match(/<a:ext cx="\d+" cy="(\d+)"/)?.[1] ?? 0),
      text: [...sp.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(''),
    })),
  );
}

/** 알약마다 (바로 위 칸 이름 아래와의 틈 px) */
function gaps(slides: Box[][]): { gap: number; where: string }[] {
  const out: { gap: number; where: string }[] = [];
  slides.forEach((bs, si) => {
    for (const p of bs.filter((b) => b.name === 'part:status')) {
      const caps = bs.filter((b) => b.name !== 'part:status' && b.text && Math.abs(b.x - p.x) < 2 && b.y < p.y && p.y - b.y < 200 * PX);
      const cap = caps.sort((a, b) => b.y - a.y)[0];
      if (!cap) continue;
      out.push({ gap: (p.y - (cap.y + cap.cy)) / PX, where: `${si + 1}장 「${cap.text}」` });
    }
  });
  return out;
}

const decks = {
  pre: (design: 'app' | 'story') => makeMeetingPptx(meetingPre(), { kind: 'pre', design }),
  final: (design: 'app' | 'story') => makeMeetingPptx(meetingFinal(), { kind: 'final', design }),
  education: (design: 'app' | 'story') => makeEducationPptx(education(), { design }),
  tbm: (design: 'app' | 'story') => makeTbmPptx(tbm(), { design }),
};

describe('상태 알약이 칸 이름에 닿지 않는다', () => {
  for (const [deck, make] of Object.entries(decks))
    for (const design of ['app', 'story'] as const)
      it(`${deck} ${design}`, async () => {
        const r = await make(design);
        expect(r.ok).toBe(true);
        const g = gaps(await boxes(r.bytes!));
        expect(g.length, '알약을 못 찾음').toBeGreaterThan(0);
        expect(g.filter((x) => x.gap < 2).map((x) => `${x.where} 틈 ${x.gap.toFixed(1)}px`)).toEqual([]);
      });
});
