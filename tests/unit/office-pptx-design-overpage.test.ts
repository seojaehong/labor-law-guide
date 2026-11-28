// 한 행만으로 본문 높이를 넘는 목록 행 — 슬라이드 밖으로 내보내지 않고, 글을 낱말 경계에서 이어지는 장으로 나눠 싣는다.
// 글은 자르지 않는다(말줄임 없음) — 장마다 실린 조각을 이으면 원문이 된다.
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { makeBroadcastPptx } from '../../src/lib/office/pptx/broadcast';
import { DESIGN_IDS } from '../../src/lib/office/pptx/design';
import { meetingFinal } from './office-pptx-decks.fixture';

const EMU_PT = 12700;
const LONG = Array.from({ length: 60 }, (_, i) => `의견${i + 1}번 통로 조명이 어둡고 바닥이 미끄러워 넘어질 뻔했다`).join(' ');

async function slideXmls(bytes: Uint8Array): Promise<string[]> {
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));
  return Promise.all(names.map((n) => zip.file(n)!.async('string')));
}
const texts = (xml: string) => [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);

/** 목록 부품(표 프레임·카드 도형)의 바닥(EMU) 과 바닥줄 위(EMU) */
function bottoms(xml: string): { bottom: number; foot: number } {
  const foot = Math.min(...(xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? []).filter((sp) => /name="foot:(rule|left)"/.test(sp)).map((sp) => Number(sp.match(/<a:off x="-?\d+" y="(-?\d+)"/)![1])));
  let bottom = 0;
  for (const el of xml.match(/<p:(sp|graphicFrame)>[\s\S]*?<\/p:(sp|graphicFrame)>/g) ?? []) {
    if (!/name="part:list-/.test(el)) continue;
    const y = Number(el.match(/<a:off x="-?\d+" y="(-?\d+)"/)![1]);
    const rows = [...el.matchAll(/<a:tr h="(\d+)">/g)].map((m) => Number(m[1]));
    const h = rows.length ? rows.reduce((a, b) => a + b, 0) : Number(el.match(/<a:ext cx="\d+" cy="(\d+)"/)![1]);
    bottom = Math.max(bottom, y + h);
  }
  return { bottom, foot };
}

describe('한 행이 본문 높이를 넘으면 이어지는 장으로 나눈다(B4 의견)', () => {
  for (const id of DESIGN_IDS)
    it(id, async () => {
      const s = meetingFinal();
      s.opinions = [{ id: 'O-1', from: '근로자(역할)', text: LONG, relatedIds: ['N-01'] }];
      const r = await makeBroadcastPptx(s, { design: id });
      expect(r.ok).toBe(true);
      const xs = await slideXmls(r.bytes!);
      const b4 = r.slides.filter((x) => x.code === 'B4').map((x) => xs[x.no - 1]);
      expect(b4.length, 'B4 가 여러 장으로 나뉘어야 한다').toBeGreaterThan(1);
      for (const x of b4) {
        const { bottom, foot } = bottoms(x);
        expect(bottom / EMU_PT, '목록이 바닥줄 위에서 끝난다').toBeLessThanOrEqual(foot / EMU_PT);
      }
      // 원문이 빠짐없이 — 조각을 띄어쓰기로 이으면 원문
      const joined = b4.map((x) => texts(x).filter((t) => LONG.includes(t.trim()) && t.trim().length > 8).join(' ')).join(' ').replace(/\s+/g, ' ').trim();
      expect(joined).toBe(LONG);
    });
});
