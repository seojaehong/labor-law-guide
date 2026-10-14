import { expect,it } from 'vitest';
import { serializeJsonLd } from '@/lib/safe-json-ld';
import { resolveDecisionSourceContract,getDecisionDetailHref } from '@/lib/search/source-contracts';
import { parse } from '@/lib/decisions-query';
it('JSON-LD preserves source text without allowing a script terminator',()=>{
 const value={title:'</script><script>window.__fixtureExecuted=1</script>',summary:'<img onerror="x"> & \u2028'};
 const json=serializeJsonLd(value);expect(json).not.toContain('<');expect(json).not.toContain('</script>');expect(JSON.parse(json)).toEqual(value);
});
it('known prefixes cannot be contradicted and route identifiers are encoded once',()=>{
 for(const id of ['bc_fixture','prec_fixture','id_fixture','el_fixture','nlrc_fixture'])for(const sourceProvider of ['nlrc','bigcase','lawgo','unknown'])expect(resolveDecisionSourceContract({id,sourceProvider}).provider).toBe(id.startsWith('bc_')?'bigcase':id.startsWith('prec_')?'lawgo':'nlrc');
 expect(getDecisionDetailHref({id:'legacy?x#y',sourceProvider:'bigcase'})).toBe('/decisions/legacy%3Fx%23y?source=bigcase');
 expect(resolveDecisionSourceContract({id:'legacy',sourceProvider:'bigcase'}).provider).toBe('bigcase');
});
it('RPC page offsets remain within signed PostgreSQL integer range',()=>{
 expect(parse({page:'107374183'}).page).toBe(107374183);
 expect(parse({page:'107374184'}).page).toBe(1);
});
