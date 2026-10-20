import {expect,it} from 'vitest';
import {decisionDate} from '@/lib/decision-date';
import {formatDecisionDate} from '@/app/database/_components/utils';
it.each([null,undefined,'','0001-01-01','00010101','not a date','2026-02-30','2025-02-29','2026-13-01','2026-00-01','2026-01-00','2026-0219','202602-19','2026-02-19Tinvalid'])('does not display an unknown or invalid stored date %s',value=>expect(decisionDate(value)).toBeNull());
it.each(['2024-02-29','2000-02-29','1900-02-28','2026-02-19'])('preserves valid calendar dates %s',value=>expect(decisionDate(value)).toBe(value));
it('preserves the stored day without timezone conversion and formats compact date',()=>{
 expect(decisionDate('2026-02-19T23:30:00Z')).toBe('2026-02-19');expect(formatDecisionDate('20260219')).toBe('2026.02.19');expect(formatDecisionDate('0001-01-01')).toBeNull();
});
it('retains valid dotted and slash legacy display inputs',()=>{
 expect(formatDecisionDate('2026.02.19')).toBe('2026.02.19');expect(formatDecisionDate('2026/02/19')).toBe('2026.02.19');expect(formatDecisionDate('2026. 2. 19.')).toBe('2026.02.19');expect(formatDecisionDate('0001/01/01')).toBeNull();
});
