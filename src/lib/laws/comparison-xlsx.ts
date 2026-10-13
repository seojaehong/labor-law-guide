import ExcelJS from 'exceljs';
export type ComparisonSheet={title:string;intro:string[];head:string[];rows:(string|number)[][];widths:number[];foot:string[]};
/** Editable wrapped cells, repeated print header, frozen labels; no fixed body heights. */
export async function comparisonXlsx(opts:ComparisonSheet):Promise<Blob>{
  if(!opts.head.length||opts.widths.length!==opts.head.length||opts.rows.some(r=>r.length!==opts.head.length))throw Error('invalid-comparison-table');
  if(opts.rows.some(row=>row.some(value=>typeof value==='string'&&value.length>32767)))throw Error('excel-cell-limit');
  const book=new ExcelJS.Workbook();
  const sheet=book.addWorksheet('신구대조',{properties:{defaultRowHeight:16},
    // OOXML paper size 8 = A3; ExcelJS's narrowed TS enum omits it.
    pageSetup:{orientation:'landscape',paperSize:(opts.head.length>6?8:9) as ExcelJS.PaperSize,fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:.3,right:.3,top:.4,bottom:.4,header:.2,footer:.2}}});
  sheet.columns=opts.widths.map(width=>({width}));
  sheet.addRow([opts.title]);sheet.mergeCells(1,1,1,opts.head.length);
  sheet.getRow(1).height=28;sheet.getCell('A1').font={name:'맑은 고딕',size:16,bold:true,color:{argb:'FF202B33'}};
  for(const text of opts.intro){const row=sheet.addRow([text]);sheet.mergeCells(row.number,1,row.number,opts.head.length);row.font={name:'맑은 고딕',size:10};row.alignment={vertical:'top',wrapText:true};}
  sheet.addRow([]);const header=sheet.addRow(opts.head);header.height=24;
  header.eachCell(cell=>{cell.font={name:'맑은 고딕',size:10,bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF285E77'}};cell.alignment={vertical:'middle',horizontal:'left',wrapText:true};});
  const headerRow=header.number;
  const beforeColumn=opts.head.findIndex(h=>/현행|개정전/.test(h.replace(/\s/g,'')))+1;
  const afterColumn=opts.head.findIndex(h=>/개정안|개정후/.test(h.replace(/\s/g,'')))+1;
  // Long source/proposal cells get continuation rows, keeping print rows bounded.
  const chunks=(value:string|number,column:number):(string|number)[]=>{
    if(typeof value==='number')return[value];
    const size=Math.max(120,Math.floor(opts.widths[column]*7));
    const chars=Array.from(value);if(!chars.length)return[''];
    const parts:string[]=[];for(let i=0;i<chars.length;i+=size)parts.push(chars.slice(i,i+size).join(''));return parts;
  };
  for(const input of opts.rows){
    const parts=input.map(chunks);const count=Math.max(...parts.map(p=>p.length));
    for(let i=0;i<count;i++){
      const row=sheet.addRow(parts.map((p,c)=>c===0&&i>0?String(input[0])+' · 계속 '+(i+1)+'/'+count:p[i]??''));
      row.eachCell({includeEmpty:true},(cell,col)=>{
        cell.font={name:'맑은 고딕',size:10,bold:col===1,color:{argb:'FF202B33'}};
        cell.alignment={vertical:'top',horizontal:'left',wrapText:true};
        cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:col===beforeColumn?'FFF4F6F8':col===afterColumn?'FFEDF4F7':'FFFFFFFF'}};
        cell.border={top:{style:'hair',color:{argb:'FFB8C3CE'}},bottom:{style:'hair',color:{argb:'FFB8C3CE'}},left:{style:'hair',color:{argb:'FFB8C3CE'}},right:{style:'hair',color:{argb:'FFB8C3CE'}}};
      });
    }
  }
  const dataEnd=sheet.rowCount;
  sheet.addRow([]);
  for(const text of [...opts.foot,'긴 본문은 계속행으로 나뉩니다. 전체 원문은 숨김 원문보관 시트를 표시하면 확인할 수 있습니다.']){
    const row=sheet.addRow([text]);sheet.mergeCells(row.number,1,row.number,opts.head.length);
    row.font={name:'맑은 고딕',size:9,color:{argb:'FF4E5968'}};row.alignment={wrapText:true,vertical:'top'};
  }
  sheet.views=[{state:'frozen',ySplit:headerRow,xSplit:1,showGridLines:false}];
  sheet.autoFilter={from:{row:headerRow,column:1},to:{row:dataEnd,column:opts.head.length}};
  sheet.pageSetup.printTitlesRow=String(headerRow)+':'+headerRow;
  sheet.pageSetup.printArea='A1:'+sheet.getColumn(opts.head.length).letter+sheet.rowCount;
  sheet.headerFooter.oddFooter='&L검토용 신구조문 대조표 · 법률 검수 전&R&P / &N';
  const original=book.addWorksheet('원문보관',{state:'hidden',views:[{state:'frozen',ySplit:1,showGridLines:false}]});
  original.columns=opts.widths.map(width=>({width}));original.addRow(opts.head);
  for(const row of opts.rows)original.addRow(row);
  original.eachRow(row=>{row.font={name:'맑은 고딕',size:10};row.alignment={wrapText:true,vertical:'top'};});
  const bytes=await book.xlsx.writeBuffer();
  return new Blob([new Uint8Array(bytes)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
