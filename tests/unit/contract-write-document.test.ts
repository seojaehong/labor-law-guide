// 근로계약서 작성 — 계약서 본문과 엑셀·한글·PDF 출력. 세 파일이 같은 숫자를 싣는지, 금지어가 없는지 본다.
import { readFileSync } from 'node:fs';

import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
// saxes = 엑셀 라이브러리(exceljs)가 쓰는 XML 파서 — 새 의존성 없이 XML 1.0 적격성을 본다
import { SaxesParser } from 'saxes';
import { describe, expect, it } from 'vitest';

import { bannedHits } from '@/lib/tool-kit/banned';
import { designFromForm, type WriteForm } from '@/lib/contract-write/contract';
import { buildContractDocument, documentLines } from '@/lib/contract-write/document';
import { buildContractHwpx, buildContractPdf, buildContractXlsx } from '@/lib/contract-write/export';

const FORM: WriteForm = {
  workplaceName: '합성테스트 사업장',
  ownerName: '합성대표',
  employeeCount5plus: true,
  employeeName: '합성01',
  startDate: '2026-03-01',
  endDate: null,
  location: '합성테스트 본점',
  duty: '홀 서비스',
  daysPerWeek: 4,
  workDays: ['월', '화', '수', '목'],
  start: '10:00',
  end: '22:00',
  breakMinutes: 155,
  weeklyRestDay: '일',
  writtenDate: '2026-02-25',
  monthlyTotal: 2_600_000,
  holidayDaysPerYear: 22,
  payday: '매월 10일',
  paymentMethod: '근로자 명의 계좌이체',
};

const doc = buildContractDocument(FORM, designFromForm(FORM));
const AMOUNTS = ['1,870,364원', '414,013원', '243,879원', '71,744원', '2,600,000원'];

describe('계약서 본문', () => {
  it('금지어·「포괄」이 없다', () => {
    const text = documentLines(doc).join('\n');
    expect(bannedHits(text)).toEqual([]);
    expect(text).not.toContain('포괄');
  });

  it('단시간이면 근로일·근로일별 시간, 하루 8시간 넘는 시간은 연장 동의를 적는다', () => {
    const text = documentLines(doc).join('\n');
    expect(text).toContain('근로일: 매주 월·화·수·목(주 4일)');
    expect(text).toContain('월·화·수·목 각 10:00~22:00, 휴게시간 155분(실근로 9시간 25분)');
    expect(text).toContain('소정근로시간: 하루 8시간, 1주 32시간');
    expect(text).toContain('하루 8시간을 넘는 1시간 25분은 연장근로');
  });

  it('통상시급은 소수 둘째 자리, 실제 근로가 넘으면 추가 지급을 적는다', () => {
    const text = documentLines(doc).join('\n');
    expect(text).toContain('통상시급: 11,209.99원');
    expect(text).toContain('넘는 시간의 수당을 따로 계산해 추가로 지급한다');
  });

  it('사업장 양식의 자동 종료 조항을 넣지 않는다', () => {
    expect(documentLines(doc).join('\n')).not.toMatch(/자동\s*(종료|만료)/);
  });
});

describe('세 파일이 같은 금액을 싣는다', () => {
  it('엑셀', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildContractXlsx(doc)).buffer as ArrayBuffer);
    const cells: string[] = [];
    const numbers: number[] = [];
    wb.worksheets[0].eachRow((row) => row.eachCell((c) => (typeof c.value === 'number' ? numbers.push(c.value) : cells.push(c.text))));
    const text = cells.join('\n');
    // 금액 칸은 숫자(서식 #,##0"원") — 엑셀에서 바로 더하고 고칠 수 있게
    expect(numbers).toEqual([1_870_364, 414_013, 243_879, 71_744, 2_600_000]);
    expect(bannedHits(text)).toEqual([]);
  });

  it('한글: mimetype 이 첫 항목·무압축, 미리보기 없음, 본문에 금액', async () => {
    const bytes = await buildContractHwpx(doc);
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files)[0]).toBe('mimetype');
    expect(Buffer.from(bytes.slice(30, 38)).toString()).toBe('mimetype');
    expect(Object.keys(zip.files).some((n) => n.startsWith('Preview') || n.startsWith('BinData'))).toBe(false);
    const section = await zip.file('Contents/section0.xml')!.async('string');
    for (const a of AMOUNTS) expect(section).toContain(a);
    // 표 제목은 표 첫 행(4칸 병합)이다 — 제목 문단만 쪽 끝에 남지 않게(261103). 표는 쪽을 넘기지 않는다
    expect(section).toContain('rowCnt="7"');
    expect(section).toContain('pageBreak="NONE"');
    expect(section).toMatch(/colSpan="4"[^]*?임금 구성|임금 구성[^]*?colSpan="4"/);
    const captionAt = section.indexOf('임금 구성(항목별');
    expect(captionAt).toBeGreaterThan(section.indexOf('<hp:tbl'));
  });

  it('PDF: 나눔고딕 전체 내장, 1쪽 이상', async () => {
    const font = new Uint8Array(readFileSync('public/fonts/NanumGothic-Regular.ttf'));
    const bytes = await buildContractPdf(doc, font);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(bytes.length).toBeGreaterThan(500_000);
  });

  // 렌더 육안 확인용 — CW_OUT=<폴더> 를 주면 세 파일을 그 폴더에 쓴다
  it.runIf(Boolean(process.env.CW_OUT))('세 파일 쓰기(육안 확인용)', async () => {
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const dir = process.env.CW_OUT!;
    mkdirSync(dir, { recursive: true });
    const font = new Uint8Array(readFileSync('public/fonts/NanumGothic-Regular.ttf'));
    writeFileSync(`${dir}/계약서.xlsx`, await buildContractXlsx(doc));
    writeFileSync(`${dir}/계약서.hwpx`, await buildContractHwpx(doc));
    writeFileSync(`${dir}/계약서.pdf`, await buildContractPdf(doc, font));
  });
});

// #139 적대 검토 6 — 붙여 넣은 글자에 XML 1.0 이 허용하지 않는 제어문자가 섞여도 한글 파일이 깨지지 않는다
describe('한글 — 제어문자', () => {
  const xmlErrors = (xml: string) => {
    const parser = new SaxesParser();
    const errors: string[] = [];
    parser.on('error', (e) => errors.push(String(e.message)));
    parser.write(xml).close();
    return errors;
  };
  it('section0.xml 을 XML 파서가 오류 없이 읽는다(사업체명에 \u0001·\u000B·\uFFFF)', async () => {
    const dirty = buildContractDocument({ ...FORM, workplaceName: '합성\u0001테스트\u000B사업장￿' }, designFromForm(FORM));
    const zip = await JSZip.loadAsync(await buildContractHwpx(dirty));
    const section = await zip.file('Contents/section0.xml')!.async('string');
    expect(xmlErrors(section)).toEqual([]);
    expect(section).toContain('합성테스트사업장');
  });
  it('깨끗한 본문도 오류 없이 읽는다', async () => {
    const zip = await JSZip.loadAsync(await buildContractHwpx(doc));
    for (const name of ['Contents/section0.xml', 'Contents/header.xml', 'Contents/content.hpf']) {
      expect(xmlErrors(await zip.file(name)!.async('string'))).toEqual([]);
    }
  });
});
