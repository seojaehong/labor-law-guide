import {expect,it} from 'vitest';
import {publicSourceUrl} from '@/lib/public-source-url';
it('only exposes credential-free web source links',()=>{
 for(const value of ['javascript:alert(1)','data:text/html,x','file:///tmp/x','https://user:password@example.invalid',null,{},'/relative'])expect(publicSourceUrl(value)).toBeNull();
 expect(publicSourceUrl('https://www.law.go.kr/LSW/precInfoP.do?precSeq=372172')).toContain('precSeq=372172');
});
