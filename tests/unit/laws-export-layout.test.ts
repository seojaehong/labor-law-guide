import {expect,it} from 'vitest';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import {compareDocx} from '@/lib/laws/doc-io';
import {comparisonXlsx} from '@/lib/laws/comparison-xlsx';
import {splitArticles} from '@/lib/laws/standard-check';
import {paragraphs} from '@/lib/laws/rules-check';
import standard from '../../public/data/laws/standard.json';
import rules from '../../public/data/laws/rules.json';
import {periodCheck, type StdArticle, type StdRule} from '@/lib/laws/standard-check';
const options={title:'신구대조표',intro:['기간 2024-01-29 ~ 2026-10-14'],head:['조문','현행','개정안','근거','판정'],widths:[1700,4300,4300,3200,1200],rows:[['제29조','긴 현행 조문\n'.repeat(180),'=새 문안 <보존>','법령 확인 필요','미검증']],foot:['검토용']};
it('actual family-care rule selects explicit Article29 evidence and rejects narrower family scope',()=>{
  const rule=rules.rules.find(r=>r.topic==='가족돌봄휴직·휴가 대상 가족에 조부모·손자녀 포함')!;
  const run=(scope:string)=>periodCheck({text:`제29조(특별휴가)\n11. ${scope}의 질병, 사고, 노령으로 가족돌봄휴가를 받을 수 있다.\n제50조(휴직)\n13. 조부모, 부모, 배우자, 자녀 또는 손자녀를 간호하기 위하여 필요한 때`,std:standard.articles as StdArticle[],rules:[rule] as StdRule[],events:[],from:'20240129',to:'20261014'}).items.flatMap(i=>i.verdicts)[0];
  expect(run('조부모, 부모, 배우자, 자녀 또는 손자녀').where).toBe('제29조(특별휴가)');
  expect(run('조부모, 부모, 배우자, 자녀 또는 손자녀').status).toBe('반영됨');
  expect(run('부모, 배우자, 자녀').status).toBe('미반영');
});
it('Word fixed grid fits printable width, repeats header and permits long body row splits',async()=>{
  const blob=await compareDocx(options),zip=await JSZip.loadAsync(await blob.arrayBuffer());
  const xml=await zip.file('word/document.xml')!.async('string');
  expect(xml).toContain('w:tblLayout w:type="fixed"');expect(xml).toContain('w:tblCellMar');
  expect(xml.match(/w:cantSplit/g)).toHaveLength(1);expect(xml).toContain('w:tblHeader');
  expect(xml).toContain('w:sz w:val="30"');expect(xml).toContain('=새 문안 &lt;보존&gt;');
  const widths=[...xml.matchAll(/w:gridCol w:w="(\d+)"/g)].map(x=>Number(x[1]));
  expect(widths.reduce((a,b)=>a+b,0)).toBeLessThanOrEqual(15038);
});
it('Excel wraps and freezes headers, preserves exact strings and print settings',async()=>{
  const blob=await comparisonXlsx({...options,widths:[20,52,52,38,16]});
  const book=new ExcelJS.Workbook();await book.xlsx.load(await blob.arrayBuffer());
  const sheet=book.getWorksheet('신구대조')!,original=book.getWorksheet('원문보관')!;
  expect(sheet.views[0].state).toBe('frozen');expect(sheet.pageSetup.fitToWidth).toBe(1);
  expect(sheet.pageSetup.fitToHeight).toBe(0);expect(sheet.pageSetup.printTitlesRow).toBe('4:4');
  expect(sheet.getCell('B5').alignment.wrapText).toBe(true);
  expect(sheet.getRow(5).height).toBeUndefined();
  expect(original.getCell('B2').value).toBe(options.rows[0][1]);
  expect(original.getCell('C2').value).toBe('=새 문안 <보존>');
  expect(sheet.rowCount).toBeGreaterThan(10);
});
it('wrapped legal cross-reference stays in Article29 rather than generating false Article24',()=>{
  const text='제29조(특별휴가) 건강검진\n제24조 및 제25조에 따른 예방접종을 포함한다.\n11. 가족돌봄휴가 조부모 손자녀\n제29조의2(공가) 예비군';
  expect(splitArticles(text).map(a=>a.no)).toEqual(['제29조','제29조의2']);
  expect(splitArticles(text)[0].text).toContain('가족돌봄휴가');
  expect(paragraphs(text)[1].article).toBe('제29조(특별휴가)');
});
it('explicit family-care evidence is considered when title-matched generic leave has no anchor',async()=>{
  const {periodCheck}=await import('@/lib/laws/standard-check');
  const std={id:'leave',no:'제18조',title:'휴직',chapter:null,kind:'필수' as const,text:'휴직',laws:[],keywords:['휴직'],status:'auto' as const};
  const rule={lawId:'000130',law:'남녀고용평등법',article:'제22조의2',effective:'20200101',topic:'가족 범위',art93:'8',required:true,keywords:['가족돌봄'],anchor:['가족돌봄휴가'],ok:['조부모','손자녀'],stale:[],point:'확인',clause:'확인',mst:null,std:['leave'],always:true};
  const result=periodCheck({text:'제50조(휴직) 일반 휴직을 명한다.\n제29조(특별휴가) 가족돌봄휴가 조부모 손자녀',std:[std],rules:[rule],events:[],from:'20240129',to:'20261014'});
  expect(result.items[0].verdicts[0].where).toBe('제29조(특별휴가)');
  expect(result.items[0].verdicts[0].status).toBe('반영됨');
});
