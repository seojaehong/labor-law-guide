// 덱 디자인 프리셋 — 긴 글이 칸·카드·바닥줄을 넘지 않는지(대책 장 B3).
// 261128 결함: 긴 대책(80자)이 field 행 카드 밖·슬라이드 밖으로, app 다음 카드로, story 「담당」 위로 넘쳤고
// quiet 표는 PowerPoint 가 행을 늘려 바닥줄을 덮었다. designsFor 는 그래도 ok=true 였다.
// 판정: 슬라이드 XML 에서 글 상자마다 「줄 수 × 1.2 × 글자 크기(× 줄간격)」로 그려질 높이를 잡고
//   ① 바닥줄 위에서 끝나는지 ② 다른 글과 겹치지 않는지 ③ 담긴 카드 안에서 끝나는지 ④ 표는 행 합이 바닥줄 위인지 본다.
// 줄 수는 capacityOf(보수적 — PowerPoint 실측보다 줄을 많이 센다)로 잰다.
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { makeBroadcastPptx } from '../../src/lib/office/pptx/broadcast';
import { capacityOf, textUnits, type MeetingSnapshot } from '../../src/lib/office/pptx/meeting';
import { DESIGN_IDS, designScale, designsFor, getDeckDesign, type DesignId } from '../../src/lib/office/pptx/design';
import { finalSnapshotForDesign } from './office-pptx-design.fixture';

const PT = 12700;

/** 띄어쓰기 있는 80자 · 없는 80자 */
const LONG80 = '작업 전 사다리 상단 고정 장치를 설치하고 두 사람이 한 조로 작업하며 관리감독자가 고정 상태를 매번 확인한 뒤 작업을 시작하도록 한다 기록도 남긴다'.slice(0, 80);
const SOLID80 = '가나다라마바사아자차카타파하'.repeat(6).slice(0, 80);
const LONG_RISK = '야간 작업 중 통로 조명이 어둡고 바닥에 자재가 놓여 있어 지게차와 보행자가 부딪치거나 넘어질 수 있는 위험이 계속 남아 있어 매일 확인이 필요하다'.slice(0, 80);
const LONG_OWNER = '생산2팀 설비보전 담당 관리감독자(역할)';

function longSnap(o: { measure?: string; risk?: string; owner?: string; n?: number } = {}): MeetingSnapshot {
  const s = finalSnapshotForDesign();
  const n = o.n ?? s.actions!.length;
  s.actions = Array.from({ length: n }, (_, i) => ({
    id: `AC-${i + 1}`,
    targetId: 'N-01',
    ...(o.risk ? { hazard: `${i + 1} ${o.risk}` } : {}),
    measure: `${i + 1} ${o.measure ?? '통로 조명 교체'}`,
    owner: o.owner ?? '시설 담당(역할)',
    due: `2027-01-${String((i % 28) + 1).padStart(2, '0')}`,
  }));
  return s;
}

interface Box { x: number; y: number; w: number; h: number }
interface TextShape extends Box { name: string; text: string; ext: number; top: number }

const num = (s: string, re: RegExp) => Number(s.match(re)?.[1] ?? NaN);

/** 문단마다 줄 수를 세 그려질 높이(pt) */
function textHeight(body: string, wIn: number): { text: string; h: number } {
  let h = 0;
  const texts: string[] = [];
  for (const p of body.match(/<a:p>[\s\S]*?<\/a:p>/g) ?? []) {
    const t = [...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join('');
    const sizes = [...p.matchAll(/ sz="(\d+)"/g)].map((m) => Number(m[1]) / 100);
    const pt = Math.max(...sizes, 0);
    if (!t || !pt) continue;
    const spc = num(p, /<a:spcPct val="(\d+)"/) / 100000 || 1;
    const lines = Math.ceil(textUnits(t) / capacityOf(wIn, pt, 1));
    h += lines * 1.2 * pt * spc;
    texts.push(t);
  }
  return { text: texts.join('\n'), h };
}

function shapes(xml: string): { texts: TextShape[]; cards: (Box & { name: string })[] } {
  const texts: TextShape[] = [];
  const cards: (Box & { name: string })[] = [];
  for (const m of xml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)) {
    const sp = m[1];
    const name = sp.match(/name="([^"]*)"/)?.[1] ?? '';
    const b: Box = { x: num(sp, /<a:off x="(-?\d+)"/) / PT, y: num(sp, /<a:off x="-?\d+" y="(-?\d+)"/) / PT, w: num(sp, /<a:ext cx="(\d+)"/) / PT, h: num(sp, /<a:ext cx="\d+" cy="(\d+)"/) / PT };
    const body = sp.match(/<p:txBody>([\s\S]*?)<\/p:txBody>/)?.[1];
    const th = body ? textHeight(body, b.w / 72) : { text: '', h: 0 };
    if (th.text) {
      const anchor = body!.match(/anchor="(\w+)"/)?.[1] ?? 't';
      const top = anchor === 'ctr' ? b.y + (b.h - th.h) / 2 : anchor === 'b' ? b.y + b.h - th.h : b.y;
      texts.push({ ...b, name, text: th.text, ext: th.h, top });
    } else if (/prst="(rect|roundRect)"/.test(sp) && b.h >= 50 && b.w >= 100) cards.push({ ...b, name });
  }
  return { texts, cards };
}

/** 표: PowerPoint 는 글이 넘치면 행을 늘린다 — 행마다 max(지정 높이, 글 높이+위아래 여백) */
function tableBottoms(xml: string): number[] {
  const out: number[] = [];
  for (const g of xml.match(/<p:graphicFrame>[\s\S]*?<\/p:graphicFrame>/g) ?? []) {
    const y = num(g, /<a:off x="-?\d+" y="(-?\d+)"/) / PT;
    const cols = [...g.matchAll(/<a:gridCol w="(\d+)"/g)].map((m) => Number(m[1]) / PT);
    let bottom = y;
    for (const tr of g.match(/<a:tr h="\d+">[\s\S]*?<\/a:tr>/g) ?? []) {
      let need = 0;
      let ci = 0;
      for (const tc of tr.match(/<a:tc[ >][\s\S]*?<\/a:tc>/g) ?? []) {
        const span = num(tc, /gridSpan="(\d+)"/) || 1;
        const w = cols.slice(ci, ci + span).reduce((a, b) => a + b, 0);
        ci += span;
        const pr = tc.match(/<a:tcPr[^>]*>/)?.[0] ?? '';
        const [l, r, t, b] = ['marL', 'marR', 'marT', 'marB'].map((k) => num(pr, new RegExp(`${k}="(\\d+)"`)) / PT || 0);
        const body = tc.match(/<a:txBody>([\s\S]*?)<\/a:txBody>/)?.[1] ?? '';
        need = Math.max(need, textHeight(body, (w - l - r) / 72).h + t + b);
      }
      bottom += Math.max(num(tr, /<a:tr h="(\d+)"/) / PT, need);
    }
    out.push(bottom);
  }
  return out;
}

async function b3Slides(bytes: Uint8Array, nos: number[]): Promise<string[]> {
  const zip = await JSZip.loadAsync(bytes);
  return Promise.all(nos.map((n) => zip.file(`ppt/slides/slide${n}.xml`)!.async('string')));
}

const TOL = 2; // pt

async function checkLayout(id: DesignId, snap: MeetingSnapshot, layout: '16:9' | 'A4') {
  const r = await makeBroadcastPptx(snap, { design: id, layout });
  expect(r.ok, (r.errors ?? []).join()).toBe(true);
  const d = getDeckDesign(id);
  const S = layout === '16:9' ? designScale(13.333, 7.5) : designScale(11.69, 8.27);
  const footTop = (S.H - S.y(1080 - d.foot.y)) * 72;
  const slideH = S.H * 72;
  const nos = r.slides.filter((s) => s.code === 'B3').map((s) => s.no);
  const xmls = await b3Slides(r.bytes!, nos);
  const where = (no: number) => `${id} ${layout} ${no}장`;
  const all = xmls.join('\n');
  // 원문 그대로(말줄임 없음)
  for (const a of snap.actions ?? []) expect(all, `${id} ${a.id}`).toContain(a.measure);
  expect(all).not.toMatch(/…|\.\.\./);
  xmls.forEach((xml, i) => {
    const { texts, cards } = shapes(xml);
    const body = texts.filter((t) => t.y < footTop - 1);
    for (const t of body) {
      // ① 바닥줄 위·슬라이드 안
      expect(t.top + t.ext, `${where(nos[i])} 「${t.text.slice(0, 16)}」 바닥줄 넘음`).toBeLessThanOrEqual(footTop + TOL);
      expect(t.top + t.ext).toBeLessThanOrEqual(slideH);
      // ③ 담긴 카드 안
      const inCard = cards.filter((c) => t.x >= c.x - 0.5 && t.x < c.x + c.w && t.y >= c.y - 0.5 && t.y < c.y + c.h).sort((a, b) => a.w * a.h - b.w * b.h)[0];
      if (inCard) expect(t.top + t.ext, `${where(nos[i])} 「${t.text.slice(0, 16)}」 카드 밖`).toBeLessThanOrEqual(inCard.y + inCard.h + TOL);
    }
    // ② 글끼리 겹치지 않음
    for (let a = 0; a < body.length; a++)
      for (let b = a + 1; b < body.length; b++) {
        const p = body[a];
        const q = body[b];
        const ox = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x);
        const oy = Math.min(p.top + p.ext, q.top + q.ext) - Math.max(p.top, q.top);
        expect(ox > TOL && oy > TOL, `${where(nos[i])} 「${p.text.slice(0, 12)}」×「${q.text.slice(0, 12)}」 겹침 ${oy.toFixed(1)}pt`).toBe(false);
      }
    // ④ 표 행 합
    for (const tb of tableBottoms(xml)) expect(tb, `${where(nos[i])} 표가 바닥줄을 덮음`).toBeLessThanOrEqual(footTop + TOL);
  });
  return r;
}

describe('긴 글도 칸·카드·바닥줄 안(대책 장)', () => {
  for (const id of DESIGN_IDS)
    for (const layout of ['16:9', 'A4'] as const) {
      it(`${id} ${layout} — 기본 3건(짧은 글)`, async () => {
        await checkLayout(id, finalSnapshotForDesign(), layout);
      });
      it(`${id} ${layout} — 대책 80자 3건(띄어쓰기 있음·없음)`, async () => {
        await checkLayout(id, longSnap({ measure: LONG80 }), layout);
        await checkLayout(id, longSnap({ measure: SOLID80 }), layout);
      });
      it(`${id} ${layout} — 위험·대책 80자 + 긴 담당 3건`, async () => {
        const r = await checkLayout(id, longSnap({ measure: LONG80, risk: LONG_RISK, owner: LONG_OWNER }), layout);
        expect(r.warnings.join(' ')).toContain('B3');
      });
      it(`${id} ${layout} — 대책 80자 20건`, async () => {
        const r = await checkLayout(id, longSnap({ measure: LONG80, n: 20 }), layout);
        expect(r.slides.filter((s) => s.code === 'B3').length).toBeGreaterThan(1);
      });
    }
});

describe('designsFor 는 글 길이도 본다', () => {
  it('짧은 글 3건은 5종 모두 ok', () => {
    for (const x of designsFor(finalSnapshotForDesign())) expect(x.ok, `${x.id} ${x.reason}`).toBe(true);
  });
  it('대책 80자·위험 80자·긴 담당은 5종 모두 ok=false, 이유에 대책 번호와 칸 이름', () => {
    for (const [k, snap] of [['measure', longSnap({ measure: LONG80 })], ['risk', longSnap({ risk: LONG_RISK })], ['owner', longSnap({ owner: LONG_OWNER })]] as const) {
      for (const x of designsFor(snap)) {
        expect(x.ok, `${x.id} ${k}`).toBe(false);
        expect(x.reason, `${x.id} ${k}`).toContain('AC-1');
        expect(x.reason, `${x.id} ${k}`).toContain(k === 'measure' ? '대책' : k === 'risk' ? '위험' : '담당');
      }
    }
  });
});

describe('story 기한 타임라인은 카드가 본문 폭을 채운다', () => {
  it('3건이면 마지막 카드 오른쪽 끝 = 본문 오른쪽 끝', async () => {
    const r = await makeBroadcastPptx(finalSnapshotForDesign(), { design: 'story' });
    const no = r.slides.find((s) => s.code === 'B3')!.no;
    const [xml] = await b3Slides(r.bytes!, [no]);
    const d = getDeckDesign('story');
    const S = designScale(13.333, 7.5);
    const right = S.x(d.slots.B3.x + d.slots.B3.w) * 72;
    const cards = shapes(xml).cards.filter((c) => c.h > 150);
    expect(cards.length).toBe(3);
    expect(Math.max(...cards.map((c) => c.x + c.w))).toBeCloseTo(right, 0);
  });
});
