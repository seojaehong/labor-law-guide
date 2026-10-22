import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { HwpEditDoc, editedName, hasViewText, sniffKind } from '@/lib/hwp/hwp-doc';

const fx = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../fixtures/laws', name)));
const wasm = readFileSync(join(dirname(createRequire(import.meta.url).resolve('@rhwp/core/package.json')), 'rhwp_bg.wasm'));
const step = { find: '시험 회사', replace: '주식회사 예시', caseSensitive: true };

describe('browser hwp editing', () => {
  it.each(['sample-rules.hwp', 'sample-rules.hwpx'])('opens %s, replaces, and survives a save round trip in both formats', async (name) => {
    const doc = await HwpEditDoc.open(fx(name), wasm);
    expect(doc.pageCount).toBeGreaterThan(0);
    expect(doc.pageSvg(0)).toContain('<svg');
    expect(doc.replaceAll(step)).toBe(1);
    for (const kind of ['hwp', 'hwpx'] as const) {
      const saved = doc.export(kind);
      expect(sniffKind(saved)).toBe(kind);
      const reopened = await HwpEditDoc.open(saved, wasm);
      expect(reopened.text()).toContain('주식회사 예시');
      expect(reopened.text()).not.toContain('시험 회사');
      reopened.free();
    }
    doc.free();
  });
  it('rebuilds from the untouched original for undo', async () => {
    const original = fx('sample-rules.hwp');
    const before = original.slice();
    const { doc, counts } = await HwpEditDoc.replay(original, [step, { find: '근로조건', replace: '근무 조건', caseSensitive: true }], wasm);
    expect(counts).toEqual([1, 1]);
    expect(doc.text()).toContain('근무 조건');
    doc.free();
    const { doc: undone } = await HwpEditDoc.replay(original, [step], wasm);
    expect(undone.text()).toContain('근로조건');
    undone.free();
    expect(original).toEqual(before);
  });
  it('reports zero matches and rejects empty search or non-hwp files', async () => {
    const doc = await HwpEditDoc.open(fx('sample-rules.hwp'), wasm);
    expect(doc.replaceAll({ find: '없는 글자열', replace: 'x', caseSensitive: true })).toBe(0);
    expect(() => doc.replaceAll({ find: '', replace: 'x', caseSensitive: true })).toThrow('찾을 글자');
    doc.free();
    await expect(HwpEditDoc.open(new TextEncoder().encode('plain text'), wasm)).rejects.toThrow('형식이 아닙니다');
  });
  it('blocks saving a document carrying a ViewText store (tracked changes / distribution)', async () => {
    const clean = fx('sample-rules.hwp');
    expect(hasViewText(clean)).toBe(false);
    expect(hasViewText(fx('sample-rules.hwpx'))).toBe(false);
    const marked = new Uint8Array([...clean, ...[...'ViewText'].flatMap((c) => [c.charCodeAt(0), 0])]);
    expect(hasViewText(marked)).toBe(true);
    const doc = await HwpEditDoc.open(clean, wasm);
    expect(doc.saveBlocked).toBe(false);
    doc.free();
  });
  it('names the edited copy without touching the original name', () => {
    expect(editedName('취업규칙.hwp', 'hwpx')).toBe('취업규칙_수정.hwpx');
    expect(editedName('규정.HWPX', 'hwp')).toBe('규정_수정.hwp');
  });
});
