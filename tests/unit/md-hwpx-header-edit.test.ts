import { describe, expect, it } from 'vitest';
import { checkHeader } from '@/lib/md-hwpx/header-check';
import { appendItem, BORDER, CHAR, cloneChar, clonePara, getItem, PARA, paraMargins } from '@/lib/md-hwpx/header-edit';
import { presetHeader } from '@/lib/md-hwpx';

// S1 — 모양 복제기. 끝에 붙이고 id = 개수, itemCnt 갱신, case·default 같은 값, 복제 뒤 S0 통과
const base = presetHeader('internal');
const cnt = (h: string, c: string) => Number(new RegExp(`<hh:${c} itemCnt="(\\d+)"`).exec(h)![1]);

describe('S1 — 모양 복제기', () => {
  it('cloneChar: 끝에 붙고 id = 개수, 굵게+밑줄', () => {
    const n = cnt(base, 'charProperties');
    const { header, id } = cloneChar(base, 7, { bold: true, underline: true });
    expect(id).toBe(n);
    expect(cnt(header, 'charProperties')).toBe(n + 1);
    const x = getItem(header, CHAR, id);
    expect(x).toMatch(/<hh:offset[^>]*\/><hh:bold\/><hh:underline type="BOTTOM"/);
    expect(getItem(header, CHAR, 7)).toBe(getItem(base, CHAR, 7)); // 원본은 그대로
    expect(checkHeader(header)).toEqual([]);
  });

  it('cloneChar: 굵게 끄기·기울임·색·크기·글꼴', () => {
    const { header, id } = cloneChar(base, 12, { bold: false, italic: true, color: '#0000FF', height: 1100, font: 1 });
    const x = getItem(header, CHAR, id);
    expect(x).not.toContain('<hh:bold/>');
    expect(x).toContain('<hh:italic/>');
    expect(x).toMatch(/height="1100"[^>]*textColor="#0000FF"/);
    expect(x).toContain('<hh:fontRef hangul="1" latin="1"');
  });

  it('같은 patch 를 두 번 복제하면 같은 id(중복 항목을 만들지 않는다)', () => {
    const a = cloneChar(base, 7, { underline: true });
    const b = cloneChar(a.header, 7, { underline: true });
    expect(b.id).toBe(a.id);
    expect(b.header).toBe(a.header);
  });

  it('clonePara: case·default 두 벌에 같은 값, 원본 그대로', () => {
    const n = cnt(base, 'paraProperties');
    const { header, id } = clonePara(base, 20, { left: 0, intent: -1400, lineSpacing: 180, align: 'LEFT' });
    expect(id).toBe(n);
    const m = paraMargins(header, id);
    expect(m.case.intent).toBe(-1400);
    expect(m.default.intent).toBe(-1400);
    expect(m.case).toEqual(m.default);
    expect(getItem(header, PARA, id).match(/value="180"/g)).toHaveLength(2);
    expect(getItem(header, PARA, 20)).toBe(getItem(base, PARA, 20));
    expect(checkHeader(header)).toEqual([]);
  });

  it('borderFill 은 첫 id 1 — 끝에 붙인 id = 1 + 개수', () => {
    const n = cnt(base, 'borderFills');
    const src = getItem(base, BORDER, 3);
    const { header, id } = appendItem(base, BORDER, src.replace(/<hh:slash\b/, '<hh:slash data-x="1"'));
    expect(id).toBe(1 + n);
    expect(checkHeader(header)).toEqual([]);
  });

  it('여러 번 이어 붙여도 S0 통과', () => {
    let h = base;
    for (const p of [{ bold: true }, { underline: true }, { italic: true }, { height: 1100 }]) h = cloneChar(h, 7, p).header;
    for (const p of [{ intent: -800 }, { intent: -1200 }, { lineSpacing: 180 }]) h = clonePara(h, 20, p).header;
    expect(checkHeader(h)).toEqual([]);
  });
});
