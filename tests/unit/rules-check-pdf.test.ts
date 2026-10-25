import { describe, expect, it } from 'vitest';
import { kindOf } from '@/lib/laws/doc-io';

// 2026-10-25. 규칙표 점검(/laws · /tools/work-rules)이 pdf 를 읽는다.
// 따로 만들지 않고 rules-review 의 readPdf 를 쓴다 — 머리말·꼬리말 제거와 줄 잇기가 이미 있다.
describe('파일 종류', () => {
  it('pdf 를 알아본다', () => {
    expect([kindOf('a.HWPX'), kindOf('b.docx'), kindOf('c.hwp'), kindOf('d.pdf'), kindOf('e.PDF'), kindOf('f.txt')])
      .toEqual(['hwpx', 'docx', 'hwp', 'pdf', 'pdf', null]);
  });
});

describe('정밀 점검은 pdf 를 받지 않는다 — 본문이 서버로 가기 때문', () => {
  it('PreciseCheck 가 pdf 를 막는다', () => {
    const src = require('node:fs').readFileSync('src/app/laws/PreciseCheck.tsx', 'utf8');
    expect(src).toMatch(/kind === 'pdf'/);
    expect(src).toMatch(/PDF 는 글자를 복사해 붙여넣어/);
  });
});

describe('규칙표 점검은 rules-review 의 pdf 를 다시 쓴다 — 두 벌로 갈리지 않게', () => {
  const src = require('node:fs').readFileSync('src/app/laws/RulesCheck.tsx', 'utf8');

  it('자체 구현을 두지 않는다', () => {
    expect(src).toMatch(/rules-review\/pdf-browser/);
    expect(src).toMatch(/rules-review\/pdf'/);
    expect(src).not.toMatch(/laws\/pdf-read/);
  });

  it('스캔 쪽은 OCR 로 넘기지 않고 붙여넣으라고 말한다', () => {
    // 이 화면에는 OCR 동의 절차가 없다. 동의 없이 그림을 밖으로 보내지 않는다.
    expect(src).toMatch(/그림/);
    expect(src).not.toMatch(/ocrPage|rules-review\/ocr/);
  });

  it('pdf 는 반영(HwpApply) 대상이 아니다 — 원본에 되쓰지 않는다', () => {
    expect(src).toMatch(/kind === 'docx' \|\| kind === 'pdf' \? null/);
  });
});
