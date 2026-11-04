// 취업규칙 신고 서류(별지 제15호서식·신구 대비표·의견청취서·동의서) — 빈 칸·형식 확인, 한글·PDF 출력.
// 사업장은 합성 값만 쓴다.
import { readFileSync } from 'node:fs';

import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { bannedHits } from '@/lib/tool-kit/banned';
import { comparisonQuoteLines, comparisonRows, reportBlanks, reportDocs, reportErrors, sealsNeeded, type ReportInput } from '@/lib/work-rules-report/forms';
import { formHwpx, formLines, formPdf } from '@/lib/work-rules-report/render';

const FONT = new Uint8Array(readFileSync('public/fonts/NanumGothic-Regular.ttf'));

const INPUT: ReportInput = {
  kind: 'change',
  workplace: { name: '가상상회', businessType: '소매업', ownerName: '김대표', bizNo: '000-00-00000', address: '서울특별시 가상구 가상로 1', tel: '02-000-0000', workers: 12, male: 7, female: 5, unionMembers: 0 },
  opinionDate: '2026-10-20',
  office: '서울지방고용노동청 서울가상지청',
  writtenDate: '2026-10-21',
  changes: [
    { article: '제40조(배우자 출산휴가)', before: '① 10일의 유급휴가를 준다.', after: '① 20일의 유급휴가를 준다.', note: '남녀고용평등법 제18조의2' },
    { article: '제25조(휴일)', before: '② 근로자의 날은 유급휴일로 한다.', after: '② 노동절은 유급휴일로 한다.', disadvantage: true },
    { article: '제50조(신설 조문)', after: '⑳ 새 조문' },
    { article: '제51조(지운 조문)', before: '옛 조문' },
  ],
};

describe('취업규칙 신고 서류 — 입력 확인', () => {
  it('비어 있는 필수 칸을 전부 댄다', () => {
    const blanks = reportBlanks({ kind: 'change', workplace: {}, writtenDate: '2026-10-21' });
    expect(blanks).toEqual([
      '사업장명', '사업의 종류', '대표자 성명', '사업자등록번호', '소재지', '전화번호',
      '근로자수', '근로자수(남)', '근로자수(여)', '노동조합원수(없으면 0)', '의견청취일 또는 동의일', '제출할 지방고용노동관서', '변경 조문(신·구 조문 대비표)',
    ]);
    expect(reportBlanks(INPUT)).toEqual([]);
    expect(reportErrors(INPUT)).toEqual([]);
  });

  it('형식·앞뒤가 맞지 않는 칸을 댄다', () => {
    const w = INPUT.workplace;
    expect(reportErrors({ ...INPUT, workplace: { ...w, bizNo: '123' } })).toContain('사업자등록번호는 숫자 10자리입니다.');
    expect(reportErrors({ ...INPUT, workplace: { ...w, male: 6 } }).join()).toMatch(/남\(6명\)·여\(5명\)의 합과 다릅니다/);
    expect(reportErrors({ ...INPUT, opinionDate: '2026-10-22' }).join()).toMatch(/작성일보다 늦습니다/);
    expect(reportErrors({ ...INPUT, majorityUnion: '가상노동조합', workplace: { ...w, unionMembers: 6 } }).join()).toMatch(/절반을 넘어야/);
    expect(reportErrors({ ...INPUT, kind: 'new' }).join()).toMatch(/최초 신고/);
  });

  it('대비표는 비면 (신설)·(삭제)로, 불리한 변경은 비고에 적는다', () => {
    const rows = comparisonRows(INPUT);
    expect(rows[1][3]).toBe('근로자에게 불리한 변경');
    expect(rows[2][1]).toBe('(신설)');
    expect(rows[3][2]).toBe('(삭제)');
  });
});

describe('취업규칙 신고 서류 — 문서', () => {
  it('변경신고 + 불리한 변경이면 네 서류, 최초 신고·과반수 노동조합이면 두 서류', () => {
    const d = reportDocs(INPUT);
    expect(d.comparison && d.consent).toBeTruthy();
    expect(sealsNeeded(INPUT, d)).toHaveLength(3);
    const n = reportDocs({ ...INPUT, kind: 'new', changes: [], majorityUnion: '가상노동조합', workplace: { ...INPUT.workplace, unionMembers: 8 } });
    expect(n.comparison).toBeNull();
    expect(n.consent).toBeNull();
    expect(formLines(n.opinion).join('\n')).toContain('가상노동조합');
    expect(formLines(n.report).join('\n')).toMatch(/\[√\] 신고서/);
  });

  it('신고서는 별지 제15호서식 문구를 싣고, 서류 글자에 금지어가 없다', () => {
    const d = reportDocs(INPUT);
    const all = [d.report, d.comparison!, d.opinion, d.consent!].flatMap(formLines).join('\n');
    expect(all).toContain('■ 근로기준법 시행규칙 [별지 제15호서식] <개정 2021. 4. 5.>');
    expect(all).toMatch(/\[ {2}\] 신고서\s+\[√\] 변경신고서/);
    expect(all).toContain('2026년 10월 20일');
    expect(bannedHits(all, ['노무사', '상담', '자문', '진단', '판정', '적법', '확률', '체불', '위법', '승소', '포괄'])).toEqual([]);
  });

  it('한글 파일은 서식 문구와 ①·⑳ 를 글자 그대로 싣는다', async () => {
    const d = reportDocs(INPUT);
    const zip = await JSZip.loadAsync(await formHwpx([d.report, d.comparison!]));
    const xml = await zip.file('Contents/section0.xml')!.async('string');
    expect(xml).toContain('별지 제15호서식');
    expect(xml).toContain('① 20일의 유급휴가를 준다.');
    expect(xml).toContain('⑳ 새 조문');
  });

  it('근거 법령 원문은 대비표 아래에 싣고 비고에서 번호로 가리킨다', () => {
    const changes = [{ ...INPUT.changes![0], lawQuote: { heading: '가상법 제1조 — 2026. 1. 1. 시행 판', text: '제1조(목적) ① 가상 원문이다.' } }, INPUT.changes![1]];
    const input = { ...INPUT, changes };
    expect(comparisonRows(input)[0][3]).toBe('남녀고용평등법 제18조의2\n근거 법령 원문 1 참조');
    expect(comparisonRows(input)[1][3]).toBe('근로자에게 불리한 변경');
    expect(comparisonQuoteLines(input)).toEqual(['1. 가상법 제1조 — 2026. 1. 1. 시행 판', '제1조(목적) ① 가상 원문이다.']);
    const lines = formLines(reportDocs(input).comparison!);
    expect(lines.indexOf('제1조(목적) ① 가상 원문이다.')).toBeGreaterThan(lines.indexOf('근거 법령 원문(법제처 국가법령정보에서 받은 글자 그대로)'));
  });

  it('PDF — 글꼴에 없는 ①~⑳ 은 직접 그려서 만들고, 그 밖에 없는 글자(한자)는 만들지 않고 댄다', async () => {
    const d = reportDocs(INPUT);
    const bytes = await formPdf([d.comparison!], FONT);
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);
    const hanja = reportDocs({ ...INPUT, changes: [{ article: '제2조', before: '상하(上下) 관계', after: '상하 관계' }] });
    await expect(formPdf([hanja.comparison!], FONT)).rejects.toThrow(/上 下/);
  });
});
