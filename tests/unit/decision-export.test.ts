import { describe, expect, it } from 'vitest';
import {
  aiNotice,
  blockLabel,
  buildCitationText,
  buildFullText,
  buildSelectedText,
  buildSummaryText,
  citationDate,
  citationHeader,
  collectNodeText,
  combineSummaries,
  exportFileName,
  kstIsoString,
  splitExportBlocks,
  splitHeadLine,
  toJsonl,
  toMarkdown,
  type ExportMeta,
  type ExportNode,
} from '@/lib/decision-export';

const court: ExportMeta = {
  id: 'bc_fixture',
  kind: 'court',
  title: '부당해고구제재심판정취소',
  court: '대법원',
  date: '2020-01-05',
  caseNumber: '2019두12345',
  sourceUrl: 'https://www.law.go.kr/LSW/precInfoP.do?precSeq=1',
  pageUrl: 'https://yellowenvelope.kr/decisions/bc_fixture',
  textKind: '원문',
};
const nlrc: ExportMeta = { ...court, id: 'id_1', kind: 'nlrc', court: '중앙노동위원회', caseNumber: '2019부해1234', textKind: '정리본' };
const interp: ExportMeta = { ...court, id: 'ml_1', kind: 'interpretation', court: '고용노동부', caseNumber: '근로기준정책과-1234', title: '연장근로 질의' };

const head = { title: '', text: '사 건  2019두12345\n원고  주식회사 합성', isAi: false, head: true };
const order = { title: '주문', text: '상고를 기각한다.', isAi: false };
const reason = { title: '이유', text: '상고이유를 판단한다.', isAi: false };
const aiPart = { title: '판결요지 정리', text: '정리된 요지.', isAi: true };

describe('citation header', () => {
  it('formats the decision date without zero padding', () => {
    expect(citationDate('2020-01-05')).toBe('2020. 1. 5.');
    expect(citationDate('2021-11-30')).toBe('2021. 11. 30.');
    expect(citationDate(null)).toBe('');
    expect(citationDate('날짜 아님')).toBe('');
  });
  it('uses the office court citation form', () => {
    expect(citationHeader(court)).toBe('[관련 판결] 대법원 2020. 1. 5. 선고 2019두12345 판결');
  });
  it('uses the labor commission and interpretation forms', () => {
    expect(citationHeader(nlrc)).toBe('[관련 판정] 중앙노동위원회 2020. 1. 5. 2019부해1234 판정');
    expect(citationHeader(interp)).toBe('[관련 행정해석] 근로기준정책과-1234 (2020. 1. 5.)');
  });
  it('degrades cleanly when court, date or number is missing', () => {
    expect(citationHeader({ ...court, court: null, date: null })).toBe('[관련 판결] 2019두12345 판결');
    expect(citationHeader({ ...nlrc, caseNumber: '' })).toBe('[관련 판정] 중앙노동위원회 2020. 1. 5. 판정');
    expect(citationHeader({ ...interp, date: null })).toBe('[관련 행정해석] 근로기준정책과-1234');
    expect(citationHeader({ ...interp, caseNumber: null })).toBe('[관련 행정해석] 연장근로 질의 (2020. 1. 5.)');
    expect(citationHeader({ ...court, court: null, caseNumber: null, date: null })).toBe('[관련 판결] 부당해고구제재심판정취소');
  });
});

describe('copy text', () => {
  it('full copy starts with the meta header and lists every section with its title line', () => {
    const text = buildFullText(court, [head, order, reason]);
    expect(text.split('\n').slice(0, 4)).toEqual([
      '부당해고구제재심판정취소',
      '대법원 · 2020. 1. 5. 선고 · 2019두12345',
      '원문 출처: https://www.law.go.kr/LSW/precInfoP.do?precSeq=1',
      '페이지: https://yellowenvelope.kr/decisions/bc_fixture',
    ]);
    expect(text).toContain('사 건  2019두12345\n원고  주식회사 합성\n\n[주문]\n상고를 기각한다.\n\n[이유]\n상고이유를 판단한다.');
    expect(text).not.toContain('[머리]');
  });
  it('marks AI sections in the full copy', () => {
    expect(buildFullText(court, [aiPart])).toContain('[판결요지 정리] (AI 정리 · 판결문 원문 아님)\n정리된 요지.');
  });
  it('summary copy puts the AI notice first and never wraps it in quotes', () => {
    const text = buildSummaryText(court, { label: '판결요지 정리', text: '정리된 요지.', isAi: true });
    expect(text.startsWith('(AI 정리 · 판결문 원문 아님)')).toBe(true);
    expect(text).toBe('(AI 정리 · 판결문 원문 아님) 판결요지 정리\n정리된 요지.');
    expect(text).not.toMatch(/[“”"]/);
    expect(buildSummaryText(court, { label: '판결요지', text: '법제처 요지.', isAi: false })).toBe('판결요지\n법제처 요지.');
  });
  it('the AI notice names the document type', () => {
    expect(aiNotice('court')).toBe('(AI 정리 · 판결문 원문 아님)');
    expect(aiNotice('nlrc')).toBe('(AI 정리 · 판정문 원문 아님)');
    expect(aiNotice('interpretation')).toBe('(AI 정리 · 행정해석 원문 아님)');
  });
  it('citation copy puts the header first and the dragged text after it', () => {
    expect(buildCitationText(court, '  상고이유를 판단한다.\r\n다음 줄  ', false)).toBe('[관련 판결] 대법원 2020. 1. 5. 선고 2019두12345 판결\n상고이유를 판단한다.\n다음 줄');
    expect(buildCitationText(court, '   \n ', false)).toBeNull();
    expect(buildCitationText(court, '정리된 요지.', true)).toBe('[관련 판결] 대법원 2020. 1. 5. 선고 2019두12345 판결\n(AI 정리 · 판결문 원문 아님)\n정리된 요지.');
  });
  it('selected copy keeps only the chosen parts in page order', () => {
    expect(buildSelectedText(court, { includeMeta: false, blocks: [order], summary: null })).toBe('[주문]\n상고를 기각한다.');
    const withSummary = buildSelectedText(court, { includeMeta: true, blocks: [reason], summary: { label: '판결요지 정리', text: '정리된 요지.', isAi: true } });
    expect(withSummary.startsWith('부당해고구제재심판정취소\n')).toBe(true);
    expect(withSummary.endsWith('[이유]\n상고이유를 판단한다.\n\n[판결요지 정리] (AI 정리 · 판결문 원문 아님)\n정리된 요지.')).toBe(true);
    expect(buildSelectedText(court, { includeMeta: false, blocks: [], summary: null })).toBe('');
  });
  it('labels untitled blocks', () => {
    expect(blockLabel(head)).toBe('머리');
    expect(blockLabel({ title: '', text: 'x', isAi: false })).toBe('본문');
    expect(blockLabel(order)).toBe('주문');
  });
});

describe('summaries', () => {
  it('combines several summary blocks under one label', () => {
    expect(combineSummaries([])).toBeNull();
    expect(combineSummaries([aiPart])).toEqual({ label: '판결요지 정리', text: '정리된 요지.', isAi: true });
    expect(combineSummaries([{ title: '질의 요지', text: '질의.', isAi: false }, { title: '회시 요지', text: '회시.', isAi: false }])).toEqual({ label: '요지', text: '[질의 요지]\n질의.\n\n[회시 요지]\n회시.', isAi: false });
  });
  it('separates sections, the full summary and the summary not already in the sections', () => {
    const lawgo = splitExportBlocks([
      { title: '판시사항', text: '판시.', isAi: false, roles: ['section'] },
      { title: '판결요지', text: '요지.', isAi: false, roles: ['section', 'summary'] },
    ]);
    expect(lawgo.sections.map(b => b.title)).toEqual(['판시사항', '판결요지']);
    expect(lawgo.summary).toEqual({ label: '판결요지', text: '요지.', isAi: false });
    expect(lawgo.summaryOnly).toBeNull();
    const bc = splitExportBlocks([
      { title: '판결요지 정리', text: '정리.', isAi: true, roles: ['summary'] },
      { title: '주문', text: '기각.', isAi: false, roles: ['section'] },
    ]);
    expect(bc.sections.map(b => b.title)).toEqual(['주문']);
    expect(bc.summaryOnly).toEqual({ label: '판결요지 정리', text: '정리.', isAi: true });
  });
});

describe('downloads', () => {
  const now = new Date('2026-11-21T03:04:05.678Z');
  it('exports KST timestamps', () => {
    expect(kstIsoString(now)).toBe('2026-11-21T12:04:05+09:00');
    expect(kstIsoString(new Date('2026-12-31T20:00:00Z'))).toBe('2027-01-01T05:00:00+09:00');
  });
  it('markdown has quoted frontmatter and one ## heading per titled section', () => {
    const md = toMarkdown({ ...court, title: '제목: "따옴표" </script>' }, [head, order, aiPart], { label: '요지', text: '요지 본문.', isAi: false }, now);
    const [, front, body] = md.split(/^---$/m);
    expect(front.trim().split('\n')).toEqual([
      'title: "제목: \\"따옴표\\" </script>"',
      'court: "대법원"',
      'date: "2020-01-05"',
      'case_number: "2019두12345"',
      'source_url: "https://www.law.go.kr/LSW/precInfoP.do?precSeq=1"',
      'page_url: "https://yellowenvelope.kr/decisions/bc_fixture"',
      'text_kind: "원문"',
      'exported_at: "2026-11-21T12:04:05+09:00"',
    ]);
    expect(md.startsWith('---\n')).toBe(true);
    expect(body).toContain('# 제목: "따옴표" </script>\n\n사 건  2019두12345\n원고  주식회사 합성\n\n## 주문\n\n상고를 기각한다.\n\n## 판결요지 정리\n\n(AI 정리 · 판결문 원문 아님)\n\n정리된 요지.\n\n## 요지\n\n요지 본문.\n');
    expect(body).not.toContain('## 머리');
    expect(body).not.toContain('## \n');
  });
  it('markdown writes null for missing metadata', () => {
    const md = toMarkdown({ ...court, court: null, date: null, caseNumber: null, sourceUrl: null }, [order], null, now);
    expect(md).toContain('court: null\ndate: null\ncase_number: null\nsource_url: null\n');
  });
  it('jsonl is one parseable line with sections and summary', () => {
    const line = toJsonl(court, [head, order, aiPart], { label: '판결요지 정리', text: '정리된 요지.', isAi: true });
    expect(line.endsWith('\n')).toBe(true);
    expect(line.trimEnd().split('\n')).toHaveLength(1);
    expect(JSON.parse(line)).toEqual({
      id: 'bc_fixture', title: '부당해고구제재심판정취소', court: '대법원', date: '2020-01-05', case_number: '2019두12345',
      source_url: 'https://www.law.go.kr/LSW/precInfoP.do?precSeq=1', page_url: 'https://yellowenvelope.kr/decisions/bc_fixture', text_kind: '원문',
      sections: [
        { title: '머리', text: '사 건  2019두12345\n원고  주식회사 합성', is_ai: false },
        { title: '주문', text: '상고를 기각한다.', is_ai: false },
        { title: '판결요지 정리', text: '정리된 요지.', is_ai: true },
      ],
      summary: { label: '판결요지 정리', text: '정리된 요지.', is_ai: true },
    });
    expect(JSON.parse(toJsonl(court, [], null)).summary).toBeNull();
  });
  it('file names are court_case-number with forbidden characters removed', () => {
    expect(exportFileName(court, 'md')).toBe('대법원_2019두12345.md');
    expect(exportFileName({ ...court, court: '서울행정법원 제1부', caseNumber: '2020구합1:2/3*?"<>|' }, 'jsonl')).toBe('서울행정법원_제1부_2020구합123.jsonl');
    expect(exportFileName({ ...court, caseNumber: null }, 'md')).toBe('대법원_bc_fixture.md');
    expect(exportFileName({ ...court, court: null, caseNumber: null }, 'md')).toBe('bc_fixture.md');
    expect(exportFileName({ ...court, court: '대법원.', caseNumber: '2019두1. ' }, 'md')).toBe('대법원_2019두1.md');
    expect(exportFileName({ ...court, court: null, caseNumber: '\u0000\u001f..' }, 'md')).toBe('bc_fixture.md');
  });
});

// DOM 을 흉내 낸 최소 노드 — vitest 는 node 환경이라 jsdom 없이 시험한다.
function el(nodeName: string, children: ExportNode[] = [], attrs: Record<string, string> = {}): ExportNode {
  return { nodeType: 1, nodeName, nodeValue: null, childNodes: children, getAttribute: (name: string) => (name in attrs ? attrs[name] : null) };
}
function txt(value: string): ExportNode {
  return { nodeType: 3, nodeName: '#text', nodeValue: value, childNodes: [] };
}
const comment: ExportNode = { nodeType: 8, nodeName: '#comment', nodeValue: ' ', childNodes: [] };

describe('collectNodeText', () => {
  it('separates block siblings that textContent would glue together', () => {
    const root = el('DIV', [el('P', [txt('가. 첫 문단')]), el('P', [txt('나. 둘째'), comment, txt(' 문단')]), el('UL', [el('LI', [txt('하나')]), el('LI', [txt('둘')])])]);
    expect(collectNodeText(root)).toBe('가. 첫 문단\n나. 둘째 문단\n하나\n둘');
  });
  it('keeps pre-wrapped text and line breaks verbatim', () => {
    expect(collectNodeText(el('P', [txt('첫 줄\n\n  들여쓴 줄'), el('BR'), txt('끝')]))).toBe('첫 줄\n\n  들여쓴 줄\n끝');
  });
  it('tab-separates table cells and breaks rows', () => {
    const table = el('DIV', [el('TABLE', [el('TBODY', [el('TR', [el('TD', [txt('항목')]), el('TD', [txt('값')])]), el('TR', [el('TH', [txt('a')]), el('TD', [txt('b')])])])]), el('P', [txt('표 뒤')])]);
    expect(collectNodeText(table)).toBe('항목\t값\na\tb\n표 뒤');
  });
  it('skips buttons, screen-reader labels, hidden marks and back references', () => {
    const root = el('DIV', [
      el('SPAN', [txt('복사')], { 'data-export-skip': '' }),
      el('P', [txt('본문'), el('A', [txt('↩')], { 'data-footnote-backref': '' })]),
      el('H2', [txt('Footnotes')], { class: 'sr-only' }),
      el('SPAN', [txt('배지')], { 'aria-hidden': 'true' }),
      el('BUTTON', [txt('버튼')]),
      el('DETAILS', [el('SUMMARY', [txt('펼치기')]), el('P', [txt('펼친 글')])]),
    ]);
    expect(collectNodeText(root)).toBe('본문\n펼친 글');
  });
  it('drops trailing spaces and collapses runs of blank lines', () => {
    expect(collectNodeText(el('DIV', [el('P', [txt('a   ')]), txt('\n\n\n\n'), el('P', [txt('b')])]))).toBe('a\n\nb');
  });
});

describe('splitHeadLine', () => {
  it('splits a label from its value on tabs or wide gaps', () => {
    expect(splitHeadLine('피고, 피상고인    중앙노동위원회위원장')).toEqual({ label: '피고, 피상고인', gap: '    ', value: '중앙노동위원회위원장' });
    expect(splitHeadLine('원심판결\t서울고등법원 2019. 1. 1. 선고 2018누1234 판결')).toEqual({ label: '원심판결', gap: '\t', value: '서울고등법원 2019. 1. 1. 선고 2018누1234 판결' });
  });
  it('keeps spaced-out single-letter labels together', () => {
    expect(splitHeadLine('사       건    2019두12345 부당해고')).toEqual({ label: '사       건', gap: '    ', value: '2019두12345 부당해고' });
    expect(splitHeadLine('원 고 주식회사 합성')).toEqual({ label: '원 고', gap: ' ', value: '주식회사 합성' });
    expect(splitHeadLine('판 결 선 고   2020. 1. 5.')).toEqual({ label: '판 결 선 고', gap: '   ', value: '2020. 1. 5.' });
  });
  it('puts indented continuation lines in the value column', () => {
    expect(splitHeadLine('    소송대리인 변호사 합성')).toEqual({ label: '', gap: '    ', value: '소송대리인 변호사 합성' });
  });
  it('leaves ordinary lines whole', () => {
    expect(splitHeadLine('대법원 제1부 판결')).toBeNull();
    expect(splitHeadLine('')).toBeNull();
  });
});
