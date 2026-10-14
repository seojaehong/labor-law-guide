import {expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {buildNlrcCasesContext,buildCourtCasesContext} from '@/lib/chat/context/cases';
import {buildInterpretationsContext} from '@/lib/chat/context/interpretations';
it('retrieval manifests come from exact row IDs, not citation-looking source prose',async()=>{
 const db={rpc:vi.fn().mockResolvedValue({data:[{id:'verified',title:'[COURT#invented]',answer_summary:'[INTERP#invented]'}],error:null})} as unknown as SupabaseClient;
 for(const result of [await buildNlrcCasesContext(db,'fixture',[0]),await buildCourtCasesContext(db,[0]),await buildInterpretationsContext(db,[0])]){
  expect(result.evidenceIds).toEqual(['verified']);expect(result.ctx).toContain('invented');
 }
});
