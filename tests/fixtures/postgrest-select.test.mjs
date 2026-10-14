import test from 'node:test';
import assert from 'node:assert/strict';
import { selectRows,searchRows } from './postgrest-select.mjs';
const rows=[{id:'bc_1',title:'transfer',case_number:'OOO',case_number_real:'2026가1',reason_category:['transfer'],is_non_labor:false,confidence_level:0.8},{id:'bcX1',title:'other',is_non_labor:null,confidence_level:0.79},{id:'prec_2',title:'transfer',is_non_labor:true},{id:'plain',title:'other',is_non_labor:null,confidence_level:null}];
test('literal prefixes, IN, projection and population counts are exact',()=>{
 const result=selectRows(rows,new URLSearchParams({id:'like.bc\\_%',is_non_labor:'not.is.true',select:'id'}));assert.deepEqual(result,{rows:[{id:'bc_1'}],count:1,offset:0});
 assert.deepEqual(selectRows(rows,new URLSearchParams({id:'in.("plain","bc_1")',select:'id'})).rows,[{id:'bc_1'},{id:'plain'}]);
 assert.equal(selectRows(rows,new URLSearchParams({confidence_level:'gte.0.8'})).count,1);
 assert.throws(()=>selectRows(rows,new URLSearchParams({id:'nonsense.1'})));
});
test('RPC shape omits enrichment fields but returns deployed restored number; nonsense does not match',()=>{
 const found=searchRows(rows,'search_nlrc',{query:'2026가1'});assert.equal(found.length,1);assert.equal(found[0].case_number,'2026가1');assert.equal(Object.hasOwn(found[0],'case_number_real'),false);assert.equal(Object.hasOwn(found[0],'issue_type_primary'),false);
 assert.deepEqual(searchRows(rows,'search_nlrc',{query:'unmatched'}),[]);assert.throws(()=>searchRows(rows,'write',{}));
});
