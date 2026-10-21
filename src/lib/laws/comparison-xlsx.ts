import ExcelJS from 'exceljs';
import JSZip from 'jszip';
export type ComparisonSheet={title:string;intro:string[];head:string[];rows:(string|number)[][];widths:number[];foot:string[];additionalSheets?:{name:string;rows:string[][];widths:number[];headerRow:number}[]};
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
    // 18 estimated visual lines stay well below Excel's 409pt row-height limit.
    // Count wide glyphs and explicit line breaks; retain every original character.
    const lineWidth=Math.max(4,Math.floor(opts.widths[column]));
    const tokens=value.match(/\r\n|[\s\S]/gu)??[];
    const parts:string[]=[];let part='',length=0,lines=1,units=0;
    for(const token of tokens){
      const newline=token==='\n'||token==='\r'||token==='\r\n';
      const width=token==='\t'?4:token.codePointAt(0)!>255?2:1;
      const nextLines=lines+(newline||units+width>lineWidth?1:0);
      if(part&&(length+1>size||nextLines>18)){
        parts.push(part);part='';length=0;lines=1;units=0;
      }
      if(newline){lines++;units=0;}
      else if(units+width>lineWidth){lines++;units=width;}
      else units+=width;
      part+=token;length++;
    }
    if(part||!parts.length)parts.push(part);return parts;
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
  sheet.addRow([]);
  for(const text of [...opts.foot,'계속행은 한 조문의 일부입니다. 행별 정렬·필터는 조문을 분리하므로 사용하지 마세요.','숨김 원문보관은 내보내기 당시 원본입니다. 표시용 시트 편집 후 자동 갱신되지 않습니다.']){
    const row=sheet.addRow([text]);sheet.mergeCells(row.number,1,row.number,opts.head.length);
    row.font={name:'맑은 고딕',size:9,color:{argb:'FF4E5968'}};row.alignment={wrapText:true,vertical:'top'};
  }
  sheet.views=[{state:'frozen',ySplit:headerRow,xSplit:1,showGridLines:false}];
  sheet.pageSetup.printTitlesRow=String(headerRow)+':'+headerRow;
  sheet.pageSetup.printArea='A1:'+sheet.getColumn(opts.head.length).letter+sheet.rowCount;
  sheet.headerFooter.oddFooter='&L검토용 신구조문 대조표 · 법률 검수 전&R&P / &N';
  const original=book.addWorksheet('원문보관',{state:'hidden',views:[{state:'frozen',ySplit:1,showGridLines:false}]});
  original.columns=opts.widths.map(width=>({width}));original.addRow(opts.head);
  for(const row of opts.rows)original.addRow(row);
  original.eachRow(row=>{row.font={name:'맑은 고딕',size:10};row.alignment={wrapText:true,vertical:'top'};});
  for(const extra of opts.additionalSheets??[]){
    const tab=book.addWorksheet(extra.name,{pageSetup:{orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});
    tab.columns=extra.widths.map(width=>({width}));
    for(const values of extra.rows){
      const row=tab.addRow(values);
      row.eachCell({includeEmpty:true},cell=>{
        cell.font={name:'맑은 고딕',size:10};cell.alignment={wrapText:true,vertical:'top'};
        if(typeof cell.value==='string'&&/^https:\/\/www\.law\.go\.kr\//.test(cell.value))cell.value={text:cell.value,hyperlink:cell.value};
      });
    }
    tab.views=[{state:'frozen',ySplit:extra.headerRow,xSplit:1,showGridLines:false}];
    tab.pageSetup.printTitlesRow=`${extra.headerRow}:${extra.headerRow}`;
  }
  const bytes=await book.xlsx.writeBuffer();
  // XML parsers normalize literal CR/CRLF; character references preserve the source.
  const zip=await JSZip.loadAsync(bytes);
  const strings=zip.file('xl/sharedStrings.xml');
  if(strings)zip.file('xl/sharedStrings.xml',(await strings.async('string')).replace(/\r/g,'&#13;'));
  return new Blob([new Uint8Array(await zip.generateAsync({type:'uint8array'}))],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
