import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { ingest } from '@/lib/rules-review/ingest';
import { runChecks } from '@/lib/rules-review/checks';
import { dropRepeated, joinWrapped, type PdfLib, type Row } from '@/lib/rules-review/pdf';

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

  it('줄 잇기 — 줄 첫머리의 「제N조에」 같은 인용은 조 머리가 아니라 앞 줄에 잇는다', () => {
    const rows = ['제3조(준용) 이 규정에 없는 사항은 「인사규정」', '제5조에 따른다.', '제4조(징계) 징계는 「인사규정」', '제7조 및 제8조에 따른다.', '제5조의2(위임) 세부 사항은', '제9조제1항에 따른다.'].map((text) => ({ text }));
    const out = joinWrapped(rows);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatch(/^제3조\(준용\).*제5조에 따른다\.$/);
    expect(out[1]).toMatch(/^제4조\(징계\).*제7조 및 제8조에 따른다\.$/);
    expect(out[2]).toMatch(/^제5조의2\(위임\).*제9조제1항에 따른다\.$/);
  });

  it('줄 잇기 — 진짜 조·장 머리는 그대로 새 줄로 시작한다(제목이 줄에서 끊긴 꼴 포함)', () => {
    const rows = ['제2장 근무', '제6조(근무시간) 근무시간은 1일', '8시간으로 한다.', '제7조 삭제', '제8조의2(휴게시간에 관한', '특례) 휴게는 1시간으로 한다.', '제9조【휴일】 휴일은 일요일로 한다.'].map((text) => ({ text }));
    const out = joinWrapped(rows);
    expect(out.map((t) => t.slice(0, 5))).toEqual(['제2장 근', '제6조(근', '제7조 삭', '제8조의2', '제9조【휴']);
    expect(out[1]).toMatch(/8시간으로 한다\.$/);
  });

  const page = (...t: string[]): Row[] => t.map((text) => ({ text }));

  it('머리말·꼬리말 — 2~4쪽 문서에서 본문 가운데 되풀이된 조각(「아니하다.」)은 버리지 않는다', () => {
    const pages = [
      page('제1조(목적) 이 규정은', '정하지', '아니하다.', '목적으로 한다.'),
      page('제2조(정의) 근로자는', '아니하다.', '사용자가 정한다.'),
      page('제3조(적용) 이 규정은', '모든 근로자에게 적용한다.'),
      page('제4조(휴일) 휴일은', '일요일로 한다.'),
    ];
    expect(dropRepeated(pages).filter((r) => r.text === '아니하다.')).toHaveLength(2);
    // 2쪽 문서는 쪽마다 같은 줄이 있어도 버리지 않는다
    const two = [page('제1조(목적) 목적', '아니하다.'), page('제2조(정의) 정의', '아니하다.')];
    expect(dropRepeated(two)).toHaveLength(4);
  });

  it('머리말·꼬리말 — 3~4쪽 문서는 쪽 맨 끝·맨 앞에 되풀이된 줄만 버린다', () => {
    const pages = [
      page('제1조(목적) 목적', '규정집_제3호 1/3'),
      page('제2조(정의) 정의', '규정집_제3호 2/3'),
      page('제3조(적용) 적용', '본문 끝'),
    ];
    expect(dropRepeated(pages).map((r) => r.text)).toEqual(['제1조(목적) 목적', '제2조(정의) 정의', '제3조(적용) 적용', '본문 끝']);
  });

  it('머리말·꼬리말 — 5쪽 이상 문서는 쪽 가장자리의 되풀이 줄만 버리고 같은 글자가 본문 가운데 있으면 남긴다', () => {
    const pages = [1, 2, 3, 4, 5].map((n) => page(`제${n}조(조${n}) 첫 줄`, `${n}쪽 둘째 줄`, '그러하지', '아니하다.', `${n}쪽 셋째 줄`, `${n}쪽 끝 줄`, `규정집_제3호 ${n}/5`));
    // 같은 꼬리말 글자가 한 쪽에서는 본문 가운데에 있다
    pages[2].splice(3, 0, { text: '규정집_제3호 9/9' });
    const out = dropRepeated(pages).map((r) => r.text);
    expect(out.filter((t) => t.startsWith('규정집'))).toEqual(['규정집_제3호 9/9']);
    expect(out.filter((t) => t === '아니하다.')).toHaveLength(5);
  });
});
