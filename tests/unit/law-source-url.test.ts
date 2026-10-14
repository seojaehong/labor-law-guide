import {expect,it} from 'vitest';
import {lawGoUrl} from '@/lib/laws/format';
it('law source uses validated identifiers/date and encoded parameters',()=>{
 expect(lawGoUrl('285279','20261008')).toBe('https://www.law.go.kr/lsInfoP.do?lsiSeq=285279&efYd=20261008');
 for(const [mst,date] of [['1&url=https://bigcase.ai','20261008'],['1','20261399'],['1','2026&redirect=x'],[null,'20261008']] as const)expect(lawGoUrl(mst,date)).toBe('');
});
