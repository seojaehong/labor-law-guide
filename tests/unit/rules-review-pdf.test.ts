import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { ingest } from '@/lib/rules-review/ingest';
import { runChecks } from '@/lib/rules-review/checks';
import { joinWrapped, type PdfLib } from '@/lib/rules-review/pdf';

const lib = pdfjs as unknown as PdfLib;
const bytes = () => new Uint8Array(readFileSync(join(__dirname, '../fixtures/laws/sample-rules.pdf')));

describe('pdf 규정 읽기', () => {
  it('글자층 쪽은 브라우저 안에서 읽고, 화면 줄바꿈을 잇고, 스캔 쪽은 따로 알린다', async () => {
    const { regs, report } = await ingest([{ path: '시험 복무 규정.pdf', bytes: bytes() }], { pdf: { lib } });
    expect(regs).toHaveLength(1);
    const r = regs[0];
    expect(r.kind).toBe('pdf');
    expect(r.articles.map((a) => a.no)).toEqual(['제1조', '제2조', '제3조']);
    // 길게 쓴 제1조는 화면에서 두 줄 이상이었지만 한 줄로 읽힌다
    expect(r.lines.find((l) => l.text.startsWith('제1조'))!.text).toContain('줄이 끊긴 자리를 잇는지 본다.');
    expect(r.annexes.map((a) => a.label)).toContain('별표 1');
    expect(report.pdf).toEqual([{ path: '시험 복무 규정.pdf', pages: 2, scanned: [2], read: [] }]);
    const kinds = runChecks(regs).map((f) => `${f.kind}:${f.before}`);
    expect(kinds).toContain('plain:당해');
    expect(kinds.some((k) => k.startsWith('reg-ref:'))).toBe(true);
  });

  it('동의해 스캔 쪽 읽기를 켜면 그 쪽 글자가 규정에 들어간다', async () => {
    const onScanned = vi.fn(async () => ['제4조(휴가) ① 휴가는 연 15일로 한다.', '② 휴가 신청은 3일 전까지 한다.']);
    const { regs, report } = await ingest([{ path: '시험 복무 규정.pdf', bytes: bytes() }], { pdf: { lib, onScanned } });
    expect(onScanned).toHaveBeenCalledTimes(1);
    expect((onScanned.mock.calls[0] as unknown[])[1]).toBe(2);
    // 픽스처의 스캔 쪽은 별표 뒤라 조문이 아니라 별표 본문으로 읽힌다 — 글자가 들어갔는지만 본다
    expect(regs[0].lines.map((l) => l.text)).toEqual(expect.arrayContaining(['제4조(휴가) ① 휴가는 연 15일로 한다.', '② 휴가 신청은 3일 전까지 한다.']));
    expect(report.pdf![0].read).toEqual([2]);
  });

  it('같은 규정의 한글·글 파일이 있으면 pdf 는 날짜가 늦어도 고르지 않는다', async () => {
    const txt = new TextEncoder().encode('시험 복무 규정\n제1조(목적) 시험.');
    const { regs, report } = await ingest([
      { path: '시험 복무 규정(20200101).txt', bytes: txt },
      { path: '시험 복무 규정(20240101).pdf', bytes: bytes() },
    ], { pdf: { lib } });
    expect(regs.map((r) => r.kind)).toEqual(['txt']);
    expect(report.duplicates[0].others).toEqual(['시험 복무 규정(20240101).pdf']);
  });

  it('줄 잇기 — 붙인 꼴이 쓰였으면 붙이고, 뒤 조각이 홀로 쓰였으면 띄운다', () => {
    const rows = ['가 근로자는 사용자에게 신청한다 이 경우', '제1조(목적) 근로자는 사용', '자에게 신청한다', '제2조 이 경우 근로자는', '사용자에게 알린다'].map((text) => ({ text }));
    expect(joinWrapped(rows)).toEqual(['가 근로자는 사용자에게 신청한다 이 경우', '제1조(목적) 근로자는 사용자에게 신청한다', '제2조 이 경우 근로자는 사용자에게 알린다']);
  });
});
