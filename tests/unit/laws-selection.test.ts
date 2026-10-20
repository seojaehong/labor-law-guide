import { describe, expect, it } from 'vitest';
import { toggleResultSelection, selectionCounts } from '@/lib/laws/selection';
describe('law selection scope', () => {
 it('adds the whole filtered result and preserves hidden selections', () => {
   const original = new Set(['hidden','a']);
   const result = toggleResultSelection(original, ['a','b','b']);
   expect([...result]).toEqual(['hidden','a','b']);
   expect([...original]).toEqual(['hidden','a']);
   expect(selectionCounts(result,['a','b'])).toEqual({shown:2,hidden:1,all:true});
 });
 it('deselects only this result, with no surprise loss after filtering', () => {
   const result = toggleResultSelection(new Set(['hidden','a','b']), ['a','b']);
   expect([...result]).toEqual(['hidden']);
   expect(selectionCounts(result,[])).toEqual({shown:0,hidden:1,all:false});
   expect([...toggleResultSelection(result,[])]).toEqual(['hidden']);
 });
});
