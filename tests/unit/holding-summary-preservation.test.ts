import {expect,it} from 'vitest';
import {normalizeHoldingSummary,isFullyCovered} from '@/lib/holding-summary';
it('preserves conflicting tails after a shared long prefix',()=>{
 const prefix='동일한 사실인정 및 관련 법리에 관한 공통 설명 '.repeat(12);
 const result=normalizeHoldingSummary(`서론\n\n쟁점: ${prefix}신청을 인용한다.\n판단: ${prefix}신청을 기각한다.`);
 expect(result).toContain('신청을 인용한다.');expect(result).toContain('신청을 기각한다.');expect(isFullyCovered(prefix+'신청을 인용한다.',prefix+'신청을 기각한다.')).toBe(false);
});
it('deduplicates only complete equality or fully included text',()=>{
 expect(normalizeHoldingSummary('같은 본문\n쟁점: 같은 본문\n판단: 같은 본문')).toBe('같은 본문');
 expect(normalizeHoldingSummary('서론\n쟁점: 전체 본문\n판단: 전체 본문과 추가 결론')).toContain('전체 본문과 추가 결론');
 expect(isFullyCovered('앞부분 결론A','앞부분 결론B')).toBe(false);
});
