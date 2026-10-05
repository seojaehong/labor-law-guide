import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import type { LawEvent } from '@/lib/laws/format';
import { checkRules } from '@/lib/laws/rules-check';
import {
  eventsInPeriod,
  matchArticles,
  periodCheck,
  splitArticles,
  stdForEvent,
  type StdArticle,
  type StdRule,
} from '@/lib/laws/standard-check';
import { compareDocx, kindOf, readDocText } from '@/lib/laws/doc-io';

const std = (id: string, title: string, kind: '필수' | '선택', laws: [string, string][], keywords: string[] = [title]): StdArticle => ({
  id,
  no: id,
  title,
  chapter: null,
  kind,
  text: `${id}(${title}) 표준 문안`,
  laws: laws.map(([lawId, article]) => ({ lawId, law: lawId, article })),
  keywords,
  status: 'auto',
});

const STD: StdArticle[] = [
  std('제1조', '목적', '필수', []),
  std('제30조', '연차유급휴가', '필수', [['001872', '제60조']], ['연차유급휴가', '연차', '유급휴가']),
  std('제45조', '배우자 출산휴가', '필수', [['000130', '제18조의2']], ['배우자출산휴가', '배우자', '출산휴가']),
  std('제46조', '육아휴직', '필수', [['000130', '제19조']], ['육아휴직']),
];

const ev = (lawId: string, date: string, articles: string[]): LawEvent =>
  ({
    id: `${lawId}-${date}`,
    lawId,
    law: lawId,
    short: lawId,
    group: lawId,
    level: '법률',
    lawKind: '법률',
    scope: null,
    date,
    upcoming: false,
    promulgations: [],
    kinds: ['일부개정'],
    cause: null,
    headline: null,
    summary: '',
    counts: { 신설: 0, 개정: articles.length, 삭제: 0 },
    changes: articles.map((a) => ({ key: a, article: a, title: '', kind: '개정', rule: null })),
    rules: [],
  }) as LawEvent;

const EVENTS = [
  ev('000130', '20250223', ['제18조의2', '제19조']),
  ev('001872', '20270610', ['제60조']),
  ev('009999', '20250601', ['제3조']),
];

const rule = (o: Partial<StdRule>): StdRule => ({
  lawId: '000130',
  law: '남녀고용평등법',
  article: '제18조의2',
  effective: '20250223',
  topic: '배우자 출산휴가 20일',
  art93: '8',
  required: true,
  keywords: ['배우자'],
  ok: ['20일'],
  stale: ['10일'],
  point: '',
  clause: '제○조(배우자 출산휴가) ① 회사는 … 20일의 휴가를 준다.',
  mst: null,
  std: ['제45조'],
  ...o,
});

const RULES = [rule({}), rule({ lawId: '001872', article: '제60조', effective: '20270610', topic: '연차 분할', keywords: ['연차'], ok: ['나누어'], stale: [], std: ['제30조'], clause: '분할 문안' })];

const MY = `제1조(목적) 이 규칙은 회사의 근로조건을 정한다.
제20조(연차휴가) ① 회사는 1년간 80퍼센트 이상 출근한 근로자에게 15일의 유급휴가를 준다.
제31조(배우자 출산휴가) ① 회사는 배우자 출산 시 10일의 유급휴가를 준다.
제50조(기타) 연차 관련 세부는 따로 정한다.`;

describe('splitArticles', () => {
  it('조문 머리로 나누고 이어지는 줄을 붙인다', () => {
    const a = splitArticles('머리말\n제1조(목적) 가\n나\n제2조 【정의】 다');
    expect(a.map((x) => [x.no, x.title])).toEqual([
      ['제1조', '목적'],
      ['제2조', '정의'],
    ]);
    expect(a[0].text).toBe('제1조(목적) 가\n나');
  });
});

describe('matchArticles', () => {
  it('번호가 달라도 제목으로 짝짓는다', () => {
    const m = matchArticles(splitArticles(MY), STD);
    expect(m.get('제30조')?.map((u) => u.no)).toEqual(['제20조']);
    expect(m.get('제45조')?.map((u) => u.no)).toEqual(['제31조']);
    expect(m.has('제46조')).toBe(false);
  });

  it('표준 문안 자체를 넣으면 모든 조문이 자기와 짝지어진다', () => {
    const text = STD.map((s) => s.text).join('\n');
    const m = matchArticles(splitArticles(text), STD);
    for (const s of STD) expect(m.get(s.id)?.[0].no).toBe(s.no);
  });
});

describe('기간', () => {
  it('최종 개정일 다음 날부터 기준일까지', () => {
    expect(eventsInPeriod(EVENTS, '20250101', '20261005').map((e) => e.id)).toEqual(['000130-20250223', '009999-20250601']);
    expect(eventsInPeriod(EVENTS, '20250223', '20261005').map((e) => e.id)).toEqual(['009999-20250601']);
  });

  it('바뀐 조문을 인용한 표준 조문에만 걸린다', () => {
    expect(stdForEvent(EVENTS[0], STD).map((x) => x.std.id)).toEqual(['제45조', '제46조']);
    expect(stdForEvent(EVENTS[2], STD)).toEqual([]);
  });
});

describe('periodCheck', () => {
  it('2025.1. 취업규칙 → 오늘: 육아지원 개정이 들어오고 옛 문구는 고칠 것', () => {
    const r = periodCheck({ text: MY, std: STD, events: EVENTS, rules: RULES, from: '20250101', to: '20261005' });
    const byId = Object.fromEntries(r.items.map((i) => [i.std.id, i]));
    expect(byId['제45조'].status).toBe('고칠 것');
    expect(byId['제45조'].verdicts[0].stale).toEqual(['10일']);
    expect(byId['제45조'].proposalFrom).toBe('매핑');
    // 육아휴직은 매핑이 없고 내 조문도 없다 → 필수 표준 조문 추가, 배포 전 시행분이라 표준 문안을 준다
    expect(byId['제46조'].status).toBe('조문 추가');
    expect(byId['제46조'].proposalFrom).toBe('표준취업규칙');
    expect(byId['제30조']).toBeUndefined(); // 연차 분할은 2027 시행이라 기간 밖
    expect(r.missingRequired.map((s) => s.id)).toEqual(['제46조']);
  });

  it('2026.1. 이후로 잡으면 2025 개정은 빠지고, 기준일을 2027.6.10.으로 늘리면 연차 분할이 들어온다', () => {
    const r1 = periodCheck({ text: MY, std: STD, events: EVENTS, rules: RULES, from: '20260101', to: '20261005' });
    expect(r1.items).toEqual([]);
    const r2 = periodCheck({ text: MY, std: STD, events: EVENTS, rules: RULES, from: '20260101', to: '20270610' });
    expect(r2.items.map((i) => [i.std.id, i.status])).toEqual([['제30조', '고칠 것']]);
  });

  it('본문 없이 기간만 고르면 문안 묶음을 준다', () => {
    const r = periodCheck({ text: '', std: STD, events: EVENTS, rules: RULES, from: '20250101', to: '20261005' });
    expect(r.items.map((i) => i.std.id).sort()).toEqual(['제45조', '제46조']);
    expect(r.items.every((i) => i.proposal)).toBe(true);
    expect(r.missingRequired).toEqual([]);
  });

  it('B(문서 전체 키워드)와의 차이 — A 는 짝지은 조문 안에서만 본다', () => {
    // 「제50조(기타)」에 「연차」가 있어도 A 는 연차 표준 조문과 짝지은 제20조만 본다
    const a = periodCheck({ text: MY, std: STD, events: EVENTS, rules: RULES, from: '20260101', to: '20270610' });
    const b = checkRules(MY, [RULES[1]]);
    expect(a.items[0].verdicts[0].where).toBe('제20조(연차휴가)');
    expect(['제20조(연차휴가)', '제50조(기타)']).toContain(b[0].where);
  });
});

describe('doc-io', () => {
  it('파일 종류', () => {
    expect([kindOf('a.HWPX'), kindOf('b.docx'), kindOf('c.hwp'), kindOf('d.pdf')]).toEqual(['hwpx', 'docx', 'hwp', null]);
  });

  it('hwpx — 표 안 문단이 바깥 문단과 섞이지 않는다', async () => {
    const zip = new JSZip();
    zip.file(
      'Contents/section0.xml',
      '<hs:sec><hp:p id="1"><hp:run><hp:t>제1조(목적) 이 규칙은</hp:t><hp:t> 근로조건을 정한다.</hp:t></hp:run></hp:p>' +
        '<hp:p id="2"><hp:run><hp:t>표 앞 글자</hp:t><hp:tbl><hp:tr><hp:tc><hp:subList><hp:p id="3"><hp:run><hp:t>셀 &amp; 하나</hp:t></hp:run></hp:p></hp:subList></hp:tc></hp:tr></hp:tbl></hp:run></hp:p>' +
        '<hp:p id="4"><hp:run><hp:t>제2조(정의) 사원</hp:t></hp:run></hp:p></hs:sec>',
    );
    const text = await readDocText(await zip.generateAsync({ type: 'uint8array' }), 'hwpx');
    expect(text.split('\n')).toEqual(['제1조(목적) 이 규칙은 근로조건을 정한다.', '표 앞 글자', '셀 & 하나', '제2조(정의) 사원']);
  });

  it('docx — 신구대조표를 써서 다시 읽으면 표 글자가 나온다', async () => {
    const blob = await compareDocx({
      title: '취업규칙 신구대조표',
      intro: ['기간 2025.1.1.~2026.10.5.'],
      head: ['표준 조문', '현행', '개정안', '근거'],
      widths: [1800, 4200, 4200, 2800],
      rows: [
        ['제45조', '제31조(배우자 출산휴가) 10일 <옛 문구>', '20일', '남녀고용평등법 제18조의2'],
        ['제46조', '', '육아휴직 표준 문안\n둘째 줄', '남녀고용평등법 제19조'],
      ],
      foot: ['1차 자동 점검입니다.'],
    });
    const text = await readDocText(await blob.arrayBuffer(), 'docx');
    expect(text).toContain('제31조(배우자 출산휴가) 10일 <옛 문구>');
    expect(text).toContain('육아휴직 표준 문안둘째 줄');
    expect(text.split('\n').filter((l) => l.startsWith('제4')).length).toBe(2);
  });
});

describe('명칭 변경·제93조', () => {
  it('everywhere 매핑은 짝지은 조문 밖에 남은 옛 명칭도 잡는다', () => {
    const text = `제31조(배우자 출산전후휴가) ① 회사는 20일의 배우자 출산전후휴가를 준다.
제18조(휴직명령) ③ 배우자 출산휴가 중인 사원에게는 휴직을 명하지 않는다.`;
    const r = rule({ topic: '명칭', everywhere: true, ok: ['출산전후휴가'], stale: ['배우자 출산휴가'] });
    const res = periodCheck({ text, std: STD, events: [], rules: [r], from: '20250101', to: '20261005' });
    const v = res.items[0].verdicts[0];
    expect(v.status).toBe('미반영');
    expect(v.where).toContain('제18조(휴직명령)');
  });

  it('제93조 각 호 — 키워드가 하나도 없는 호만', () => {
    const items = [
      { no: '3', label: '가족수당', keywords: ['가족수당'] },
      { no: '9의2', label: '사업장 환경 개선', keywords: ['사업장 환경', '신체적 조건'] },
      { no: '13', label: '그 밖에', keywords: [] },
    ];
    const res = periodCheck({ text: '제1조(목적) 가족수당은 지급하지 아니한다.', std: STD, events: [], rules: [], from: '20250101', to: '20261005', art93: items });
    expect(res.missing93.map((i) => i.no)).toEqual(['9의2']);
  });
});
