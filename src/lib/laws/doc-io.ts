// 취업규칙 파일 읽기(hwpx·docx → 문단 글자)와 신구대조표 docx 쓰기. 모두 브라우저 안에서 한다.
// DOMParser 대신 정규식으로 읽는다 — 테스트(node)와 브라우저에서 같은 코드가 돈다.
import JSZip from 'jszip';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_EXPANDED_BYTES = 20 * 1024 * 1024;

/** Check the ZIP central directory before JSZip allocates expanded entries. ZIP64 is not accepted. */
export function validateDocArchive(data: ArrayBuffer | Uint8Array): void {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error('파일은 10MB 이하만 읽습니다');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) { end = i; break; }
  }
  if (end < 0) throw new Error('올바른 문서 압축 파일이 아닙니다');
  const count = view.getUint16(end + 10, true), size = view.getUint32(end + 12, true), start = view.getUint32(end + 16, true);
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || count !== view.getUint16(end + 8, true) || count > 1024 || start + size !== end) throw new Error('지원하지 않거나 너무 큰 문서입니다');
  let pos = start, total = 0;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || view.getUint32(pos, true) !== 0x02014b50) throw new Error('문서 압축 정보를 읽을 수 없습니다');
    const compressed = view.getUint32(pos + 20, true), expanded = view.getUint32(pos + 24, true);
    total += expanded;
    if (expanded > MAX_FILE_BYTES || total > MAX_EXPANDED_BYTES || (expanded > 1024 * 1024 && expanded > compressed * 100)) throw new Error('압축 해제 크기 또는 압축률 제한을 초과했습니다');
    pos += 46 + view.getUint16(pos + 28, true) + view.getUint16(pos + 30, true) + view.getUint16(pos + 32, true);
  }
  if (pos !== end) throw new Error('문서 압축 정보가 일치하지 않습니다');
}

async function limitedText(entry: JSZip.JSZipObject, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = []; let size = 0; let stopped = false;
    // JSZip 3.10 exposes per-entry internalStream; its bundled typings omit this method.
    const stream = (entry as JSZip.JSZipObject & { internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array> }).internalStream('uint8array');
    stream.on('data', chunk => {
      if (stopped) return;
      size += chunk.byteLength;
      if (size > limit) { stopped = true; stream.pause(); reject(new Error('압축 해제 본문이 제한을 초과했습니다')); return; }
      chunks.push(chunk);
    }).on('error', reject).on('end', () => {
      if (stopped) return;
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      resolve(new TextDecoder().decode(bytes));
    }).resume();
  });
}

const unxml = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');

/** 글자 태그를 모으다가 문단 태그(시작·끝)를 만날 때마다 끊는다.
 *  hwpx 표는 바깥 문단 안에 셀 문단이 중첩되므로, 짝 맞추기 대신 경계마다 끊어야 바깥 글자와 셀 글자가 섞이지 않는다 */
function paras(xml: string, p: string, t: string): string[] {
  const out: string[] = [];
  let buf = '';
  const flush = () => {
    if (buf.trim()) out.push(buf.trim());
    buf = '';
  };
  const re = new RegExp(`<\\/?${p}(?=[\\s>/])[^>]*>|<${t}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${t}>`, 'g');
  for (const m of xml.matchAll(re)) {
    if (m[1] === undefined) flush();
    else buf += unxml(m[1].replace(/<[^>]+>/g, ''));
  }
  flush();
  return out;
}

export type DocKind = 'hwpx' | 'docx';

export function kindOf(name: string): DocKind | 'hwp' | null {
  const ext = name.toLowerCase().split('.').pop();
  return ext === 'hwpx' || ext === 'docx' ? ext : ext === 'hwp' ? 'hwp' : null;
}

function readableText(text: string): string {
  if (!text.trim()) throw new Error('본문에서 읽을 수 있는 글자가 없습니다. 이미지 문서는 글자를 직접 붙여넣으세요. 기존 입력은 유지됩니다.');
  return text;
}

/** hwpx·docx 의 본문을 문단 단위 글자로. hwp(바이너리)는 읽지 않는다 */
export async function readDocText(data: ArrayBuffer | Uint8Array, kind: DocKind): Promise<string> {
  validateDocArchive(data);
  const zip = await JSZip.loadAsync(data);
  if (kind === 'docx') {
    const entry = zip.file('word/document.xml');
    const xml = entry ? await limitedText(entry, MAX_FILE_BYTES) : null;
    if (!xml) throw new Error('docx 본문(word/document.xml)이 없습니다');
    if (xml.length > MAX_FILE_BYTES) throw new Error('본문이 너무 큽니다');
    return readableText(paras(xml, 'w:p', 'w:t').join('\n'));
  }
  const sections = Object.keys(zip.files)
    .filter((n) => /^Contents\/section\d+\.xml$/i.test(n))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  if (!sections.length) throw new Error('hwpx 본문(Contents/section*.xml)이 없습니다');
  const out: string[] = [];
  let expanded = 0;
  for (const s of sections) { const xml = await limitedText(zip.file(s)!, Math.min(MAX_FILE_BYTES, MAX_EXPANDED_BYTES - expanded)); expanded += new TextEncoder().encode(xml).byteLength; if (expanded > MAX_EXPANDED_BYTES) throw new Error('본문이 너무 큽니다'); out.push(...paras(xml, 'hp:p', 'hp:t')); }
  return readableText(out.join('\n'));
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function runs(text: string, bold = false, size = 20, color = '202B33'): string {
  const rpr = `<w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="맑은 고딕" w:hAnsi="Arial"/>${bold ? '<w:b/>' : ''}<w:color w:val="${color}"/><w:sz w:val="${size}"/></w:rPr>`;
  return text.split('\n').map((line,i)=>`${i?'<w:r><w:br/></w:r>':''}<w:r>${rpr}<w:t xml:space="preserve">${esc(line)}</w:t></w:r>`).join('');
}
const para=(text:string,bold=false,size=20,color='202B33')=>`<w:p><w:pPr><w:spacing w:after="80" w:line="276" w:lineRule="auto"/><w:widowControl/><w:keepNext w:val="0"/></w:pPr>${runs(text,bold,size,color)}</w:p>`;
const cell=(text:string,w:number,index:number,head=false)=>`<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/><w:vAlign w:val="top"/><w:shd w:val="clear" w:fill="${head?'285E77':index===1?'F4F6F8':index===2?'EDF4F7':'FFFFFF'}"/></w:tcPr>${para(text,head||index===0,20,head?'FFFFFF':'202B33')}</w:tc>`;
export interface CompareDocxSection { title: string; intro: string[]; rows: string[][]; foot: string[]; }
export type ComparisonOptions={title:string;intro:string[];head:string[];widths:number[];foot:string[]} & ({rows:string[][]; sections?:never} | {sections:CompareDocxSection[]; rows?:never});
/** Editable fixed-grid A4 landscape. Body rows can split across pages; header repeats. */
export async function compareDocx(opts:ComparisonOptions):Promise<Blob>{
  const {title,intro,head,foot}=opts;
  const allRows=opts.sections ? opts.sections.flatMap(section=>section.rows) : opts.rows;
  if(!head.length||opts.widths.length!==head.length||opts.widths.some(w=>!Number.isSafeInteger(w)||w<=0)||allRows.some(r=>r.length!==head.length))throw Error('invalid-comparison-table');
  const limit=15038,total=opts.widths.reduce((a,b)=>a+b,0);
  const widths=opts.widths.map(w=>Math.floor(w*Math.min(1,limit/total)));
  const tableWidth=widths.reduce((a,b)=>a+b,0);
  const border=['top','left','bottom','right','insideH','insideV'].map(side=>`<w:${side} w:val="single" w:sz="4" w:color="B8C3CE"/>`).join('');
  const table=(rows:string[][])=>`<w:tbl><w:tblPr><w:tblW w:w="${tableWidth}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${border}</w:tblBorders><w:tblCellMar><w:top w:w="100" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map(w=>`<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid><w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${head.map((h,i)=>cell(h,widths[i],i,true)).join('')}</w:tr>${rows.map(r=>`<w:tr>${r.map((c,i)=>cell(c,widths[i],i)).join('')}</w:tr>`).join('')}</w:tbl>`;
  const content=opts.sections ? opts.sections.map((section,index)=>
    `<w:p><w:pPr>${index>0?'<w:pageBreakBefore/>':''}<w:keepNext/></w:pPr>${runs(section.title,true,24)}</w:p>`+
    section.intro.map(t=>para(t,false,18)).join('')+table(section.rows)+section.foot.map(t=>para(t,false,16)).join('')
  ).join('') : table(opts.rows);
  const body=para(title,true,30)+intro.map(t=>para(t,false,18)).join('')+content+foot.map(t=>para(t,false,16)).join('')+`<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="1000" w:right="900" w:bottom="1000" w:left="900" w:header="500" w:footer="500" w:gutter="0"/></w:sectPr>`;
  const zip=new JSZip();
  zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
  return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}
