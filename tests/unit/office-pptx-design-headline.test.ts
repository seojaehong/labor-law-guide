// app 프리셋 요약 장(회의 전 P3 · 교육 E2)도 전파 덱 B1 처럼 제목 자리에 두 줄 요약 문장(강조 조각 = accent)을 쓴다.
// 문장은 그 장에 이미 있는 수로만 만든다. 다른 프리셋은 제목 그대로.
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { makeMeetingPptx } from '../../src/lib/office/pptx/meeting';
import { makeEducationPptx } from '../../src/lib/office/pptx/education';
import { DESIGN_IDS, getDeckDesign } from '../../src/lib/office/pptx/design';
import { education, meetingPre } from './office-pptx-decks.fixture';

async function slideXml(bytes: Uint8Array, no: number): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  return zip.file(`ppt/slides/slide${no}.xml`)!.async('string');
}
const titleShape = (xml: string) => (xml.match(/<p:sp>(?:(?!<\/p:sp>)[\s\S])*?name="title"[\s\S]*?<\/p:sp>/) ?? [''])[0];
const text = (sp: string) => [...sp.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join('');

const cases = [
  { code: 'P3', make: (design: (typeof DESIGN_IDS)[number]) => makeMeetingPptx(meetingPre(), { kind: 'pre', design }), want: '이번 회의에서정할 것 2건이 있어요', plain: '한눈 요약' },
  { code: 'E2', make: (design: (typeof DESIGN_IDS)[number]) => makeEducationPptx(education(), { design }), want: '평가한 위험요인 중허용 불가 1건을 먼저 줄여요', plain: '평가 결과 한눈에' },
];

describe('app 요약 장 — 두 줄 요약 문장', () => {
  for (const c of cases)
    for (const id of DESIGN_IDS)
      it(`${c.code} ${id}`, async () => {
        const r = await c.make(id);
        expect(r.ok).toBe(true);
        const info = r.slides.find((x) => x.code === c.code)!;
        const sp = titleShape(await slideXml(r.bytes!, info.no));
        if (id === 'app') {
          expect(text(sp)).toBe(c.want);
          expect(sp, '강조 조각 accent 색').toContain(getDeckDesign('app').tokens.colors.accent);
        } else expect(text(sp)).toBe(c.plain);
      });
});
