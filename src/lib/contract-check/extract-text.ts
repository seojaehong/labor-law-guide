// 계약서 파일(DOCX·XLSX·HWPX)에서 판독용 평문을 뽑는다.
//
// 왜 비전이 아니라 텍스트인가: 이 세 형식은 텍스트층을 갖고 있다. 이미지로 렌더해 비전으로
// 읽으면 페이지당 1,500~4,784 토큰이 나가는데, 텍스트로 뽑으면 계약서 한 통이 3~8천 토큰이다.
// 더 싸고, OCR 오독이 없어 더 정확하다. 이미지·PDF만 비전 경로로 보낸다.
//
// HWP(구형 바이너리)는 여기서 다루지 않는다 — OLE 복합문서 + 자체 압축이라 서버리스에서
// 변환이 비현실적이다. 사용자에게 "한글에서 PDF로 저장해 올려주세요"로 안내한다.

import JSZip from 'jszip';

/** 업로드 1건당 모델에 보낼 평문 상한. 계약서 한 통은 보통 3~8천 토큰(≈ 1만자 안쪽)이다. */
export const MAX_EXTRACTED_CHARS = 60_000;

export type DocKind = 'docx' | 'xlsx' | 'hwpx';

/** 확장자·MIME으로 형식을 판정한다. 브라우저가 HWPX에 MIME을 안 붙이는 경우가 흔해 이름도 본다. */
export function detectDocKind(name: string, type: string): DocKind | null {
  const lower = (name || '').toLowerCase();
  if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || lower.endsWith('.docx'))
    return 'docx';
  if (
    type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    type === 'application/vnd.ms-excel' ||
    lower.endsWith('.xlsx') ||
    lower.endsWith('.xls')
  )
    return 'xlsx';
  if (lower.endsWith('.hwpx') || type === 'application/hwp+zip') return 'hwpx';
  return null;
}

function unescapeXml(s: string): string {
  // &amp;를 마지막에 풀어야 `&amp;lt;`가 `<`로 잘못 접히지 않는다.
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * XML 텍스트 런에서 내용만 뽑되 **문단 경계를 개행으로 남긴다.**
 * 런 내용만 이어 붙이면 문단 구분이 사라져 "월 급여" 다음 줄의 금액이 앞 항목에 붙는다 —
 * 항목·값 짝이 깨지면 모델이 임금을 엉뚱한 항목에 배정한다. 그래서 문단 단위로 먼저 쪼갠다.
 */
function textFromRuns(xml: string, runTag: string, paraTag: string): string {
  const paras = xml.match(new RegExp(`<${paraTag}[\\s>][\\s\\S]*?</${paraTag}>`, 'g')) ?? [];
  const source = paras.length > 0 ? paras : [xml];
  const runRe = new RegExp(`<${runTag}[^>]*>([\\s\\S]*?)</${runTag}>`, 'g');
  return source
    .map((p) => {
      const runs = p.match(runRe) ?? [];
      return unescapeXml(runs.map((r) => r.replace(/<[^>]+>/g, '')).join(''));
    })
    .join('\n');
}

/** 연속 공백·빈 줄 정리. 모델에 보내는 토큰을 줄인다. */
function tidy(s: string): string {
  return s
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter((l) => l.length > 0)
    .join('\n')
    .slice(0, MAX_EXTRACTED_CHARS);
}

async function fromDocx(buf: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const doc = zip.file('word/document.xml');
  if (!doc) throw new Error('docx: word/document.xml 없음');
  const xml = await doc.async('string');
  // 표 셀도 w:p 안에 들어 있어 같은 규칙으로 잡힌다.
  return tidy(textFromRuns(xml, 'w:t', 'w:p'));
}

async function fromHwpx(buf: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  // 본문은 Contents/section0.xml, section1.xml … 로 나뉜다. 번호 순으로 이어 붙인다.
  const sections = Object.keys(zip.files)
    .filter((n) => /^Contents\/section\d+\.xml$/i.test(n))
    .sort((a, b) => {
      const na = parseInt(a.match(/section(\d+)/i)?.[1] ?? '0', 10);
      const nb = parseInt(b.match(/section(\d+)/i)?.[1] ?? '0', 10);
      return na - nb;
    });
  if (sections.length === 0) throw new Error('hwpx: Contents/section*.xml 없음');
  const parts: string[] = [];
  for (const name of sections) {
    const xml = await zip.files[name].async('string');
    parts.push(textFromRuns(xml, 'hp:t', 'hp:p'));
  }
  return tidy(parts.join('\n'));
}

async function fromXlsx(buf: ArrayBuffer): Promise<string> {
  // SheetJS는 수식 결과값·숫자 셀까지 문자열로 내려준다. 계약서 엑셀은 금액이 숫자 셀에
  // 들어 있어서 공유문자열(sharedStrings)만 읽으면 임금이 통째로 빠진다.
  const XLSX = await import('xlsx');
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    // 셀 구분은 탭, 행 구분은 개행. 빈 셀은 건너뛴다.
    const csv = XLSX.utils.sheet_to_csv(sheet, { FS: '\t', blankrows: false });
    if (csv.trim()) parts.push(`[시트: ${name}]\n${csv}`);
  }
  if (parts.length === 0) throw new Error('xlsx: 읽을 시트 없음');
  return tidy(parts.join('\n'));
}

/**
 * 파일 바이트에서 평문을 뽑는다. 형식별 파서가 실패하면 그대로 throw — 호출부가
 * 한국어 안내로 바꿔 응답한다(빈 문자열을 돌려주면 "빈 계약서"로 오인된다).
 */
export async function extractDocText(kind: DocKind, buf: ArrayBuffer): Promise<string> {
  const text = kind === 'docx' ? await fromDocx(buf) : kind === 'hwpx' ? await fromHwpx(buf) : await fromXlsx(buf);
  if (!text || text.length < 20) throw new Error(`${kind}: 추출된 텍스트가 없음`);
  return text;
}
