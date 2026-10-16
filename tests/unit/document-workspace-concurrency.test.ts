import { expect, it } from 'vitest';
import { mkdtempSync,readFileSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';import { join } from 'node:path';import { spawn } from 'node:child_process';
import ts from 'typescript';import { RpcBudgetRepository } from '@/lib/document-workspace/rpc-budget';
it('competing local processes cannot reserve past one monthly allowance',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'budget-race-'));try{
    writeFileSync(join(dir,'cost.js'),ts.transpileModule(readFileSync('src/lib/document-workspace/cost.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText);const budgetModule=join(dir,'budget.cjs');writeFileSync(budgetModule,ts.transpileModule(readFileSync('src/lib/document-workspace/budget.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText);
    const results=await Promise.all(Array.from({length:8},(_,i)=>new Promise<string>(resolve=>{
      const script=`const {BudgetStore}=require(${JSON.stringify(budgetModule)});try{new BudgetStore(${JSON.stringify(join(dir,'ledger'))},300).reserve('request-${i}','fixture',100,100,{reviewed:true,inputMicroUsdPerToken:1,outputMicroUsdPerToken:1});process.stdout.write('reserved')}catch{process.stdout.write('blocked')}`;
      const child=spawn(process.execPath,['-e',script],{windowsHide:true});let output='';child.stdout.on('data',d=>output+=d);child.on('exit',()=>resolve(output));
    })));
    expect(results.filter(r=>r==='reserved')).toHaveLength(1);
  }finally{rmSync(dir,{recursive:true,force:true});}
},15000);
it('RPC failure never falls through to a local reset or provider call',async()=>{
  const store=new RpcBudgetRepository(async()=>({data:null,error:'unavailable'}));
  await expect(store.reserve('request-1','fixture',100,100,{reviewed:true,inputMicroUsdPerToken:1,outputMicroUsdPerToken:1})).rejects.toThrow('budget-unavailable');
});
it('RPC duplicate and concurrent limit decisions stay authoritative',async()=>{
  let reserved=0;const ids=new Set();const store=new RpcBudgetRepository(async(_name,args)=>{
    if(ids.has(args.p_id)||reserved+Number(args.p_amount)>300)return{data:null,error:'denied'};
    ids.add(args.p_id);reserved+=Number(args.p_amount);return{data:args.p_id,error:null};
  });
  const price={reviewed:true,inputMicroUsdPerToken:1,outputMicroUsdPerToken:1};
  const results=await Promise.allSettled([store.reserve('request-1','fixture',100,100,price),store.reserve('request-1','fixture',100,100,price),store.reserve('request-2','fixture',100,100,price)]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(reserved).toBe(200);
});
