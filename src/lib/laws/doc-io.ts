// 취업규칙 파일 읽기(hwpx·docx → 문단 글자)와 신구대조표 docx 쓰기. 모두 브라우저 안에서 한다.
// DOMParser 대신 정규식으로 읽는다 — 테스트(node)와 브라우저에서 같은 코드가 돈다.
import JSZip from 'jszip';

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

/** hwpx·docx 의 본문을 문단 단위 글자로. hwp(바이너리)는 읽지 않는다 */
export async function readDocText(data: ArrayBuffer | Uint8Array, kind: DocKind): Promise<string> {
  const zip = await JSZip.loadAsync(data);
  if (kind === 'docx') {
    const xml = await zip.file('word/document.xml')?.async('string');
    if (!xml) throw new Error('docx 본문(word/document.xml)이 없습니다');
    return paras(xml, 'w:p', 'w:t').join('\n');
  }
  const sections = Object.keys(zip.files)
    .filter((n) => /^Contents\/section\d+\.xml$/i.test(n))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  if (!sections.length) throw new Error('hwpx 본문(Contents/section*.xml)이 없습니다');
  const out: string[] = [];
  for (const s of sections) out.push(...paras(await zip.file(s)!.async('string'), 'hp:p', 'hp:t'));
  return out.join('\n');
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function runs(text: string, bold = false): string {
  const rpr = `<w:rPr><w:rFonts w:ascii="맑은 고딕" w:eastAsia="맑은 고딕" w:hAnsi="맑은 고딕"/>${bold ? '<w:b/>' : ''}<w:sz w:val="18"/></w:rPr>`;
  return text
    .split('\n')
    .map((line, i) => `${i ? '<w:r><w:br/></w:r>' : ''}<w:r>${rpr}<w:t xml:space="preserve">${esc(line)}</w:t></w:r>`)
    .join('');
}

const para = (text: string, bold = false) => `<w:p>${runs(text, bold)}</w:p>`;
const cell = (text: string, w: number, head = false) =>
  `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${head ? '<w:shd w:val="clear" w:color="auto" w:fill="EEEEEE"/>' : ''}</w:tcPr>${para(text, head)}</w:tc>`;

/** 신구대조표 docx — 한글·워드에서 열린다. 열 폭은 dxa(1/20pt) */
export async function compareDocx(opts: {
  title: string;
  intro: string[];
  head: string[];
  widths: number[];
  rows: string[][];
  foot: string[];
}): Promise<Blob> {
  const { title, intro, head, widths, rows, foot } = opts;
  const border = '<w:top w:val="single" w:sz="4" w:color="999999"/><w:left w:val="single" w:sz="4" w:color="999999"/><w:bottom w:val="single" w:sz="4" w:color="999999"/><w:right w:val="single" w:sz="4" w:color="999999"/><w:insideH w:val="single" w:sz="4" w:color="999999"/><w:insideV w:val="single" w:sz="4" w:color="999999"/>';
  const table =
    `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblBorders>${border}</w:tblBorders></w:tblPr>` +
    `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>` +
    `<w:tr><w:trPr><w:tblHeader/></w:trPr>${head.map((h, i) => cell(h, widths[i], true)).join('')}</w:tr>` +
    rows.map((r) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((c, i) => cell(c, widths[i])).join('')}</w:tr>`).join('') +
    `</w:tbl>`;
  const body =
    para(title, true) + intro.map((t) => para(t)).join('') + table + foot.map((t) => para(t)).join('') +
    `<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="1000" w:right="900" w:bottom="1000" w:left="900" w:header="500" w:footer="500" w:gutter="0"/></w:sectPr>`;
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
