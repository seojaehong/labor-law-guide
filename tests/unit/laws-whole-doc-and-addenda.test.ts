import { describe, expect, it } from 'vitest';
import { splitArticles, periodCheck } from '@/lib/laws/standard-check';

describe('부칙은 본문 조문이 아니다', () => {
  it('본문 앞 목차의 부칙 35와 쪽번호 조문을 건너뛴다', () => {
    const text = '목차\n제1조(목적) … 1\n부칙 35\n제1조(목적) 실제 본문\n제2조(휴가) 연 15일\n부칙 <2026. 1. 1.>\n제1조(시행일) 즉시';
    expect(splitArticles(text).map(a => a.text)).toEqual(['제1조(목적) 실제 본문', '제2조(휴가) 연 15일']);
  });

  it('조문 앞의 부칙 머리와 조문 안의 부칙 인용은 본문을 자르지 않는다', () => {
    const text = '부칙\n제1조(목적) 본문\n부칙 제2조에 따른다.\n제2조(휴가) 본문';
    const articles = splitArticles(text);
    expect(articles.map(a => a.no)).toEqual(['제1조', '제2조']);
    expect(articles[0].text).toContain('부칙 제2조에 따른다.');
  });
  // 2026-10-21 실제 회사 규칙: 「개정 부칙」 뒤에 제1~4조가 또 나왔고 그것을 본문으로 세는 바람에
  // 난임치료휴가를 **부칙 제2조**로 지목했다. 사용자는 본문 제2조(목적)로 읽는다.
  const body = [
    '제1조(목적) 이 규칙은 ○○주식회사의 복무에 관한 사항을 정한다.',
    '제51조(난임치료휴가) ① 회사는 연간 6일의 난임치료휴가를 준다.',
    '',
    '개정 부칙',
    '제1조(개정 시행일) 이 규칙은 2026년 11월 1일부터 시행한다.',
    '제2조(난임치료휴가의 적용) 제51조제4항은 2026년 11월 27일부터 적용한다.',
  ].join('\n');

  it('부칙 이후 조문은 세지 않는다', () => {
    expect(splitArticles(body).map(a => a.no)).toEqual(['제1조', '제51조']);
  });

  it('「부칙」만 있어도 끊고, 본문 중간의 「제N조」 인용은 그대로 둔다', () => {
    expect(splitArticles('제1조(목적) 제2조에 따른다.\n부칙\n제1조(시행일) 즉시').map(a => a.no)).toEqual(['제1조']);
  });
});

describe('다른 조문 안에 들어 있어도 찾는다 — anchor 로', () => {
  // 실제 회사 규칙에서 배우자 출산전후휴가 20일·50일 전·3회 분할이 제46조(경조사 휴가) 안에 있었는데
  // 제목으로 짝을 짓다 보니 「해당 조문 없음」이 나왔다(고객사 이용 의견 1번).
  const STD = [{ id: '제39조', no: '제39조', title: '배우자 출산휴가', chapter: '', kind: '필수' as const, text: '제39조(배우자 출산휴가)', laws: [{ lawId: '000130', article: '제18조의2' }], keywords: ['배우자 출산'], status: 'auto' }];
  const RULES = [{
    lawId: '000130', law: '남녀고용평등법', article: '제18조의2', effective: '20260918', topic: '배우자 출산휴가 20일·3회 분할',
    art93: '8', required: true, keywords: ['배우자 출산'], anchor: ['배우자 출산휴가', '배우자 출산전후휴가'],
    ok: ['20일', '3회'], stale: [], point: '', clause: '', mst: null, std: ['제39조'],
  }];
  const EVENTS = [{
    id: '000130-20260918', lawId: '000130', law: '남녀고용평등법', short: '남녀고용평등법', group: '000130',
    level: '법률', lawKind: '법률', scope: null, date: '20260918', upcoming: false, promulgations: [],
    kinds: ['일부개정'], cause: null, headline: null, summary: '', counts: { 신설: 0, 개정: 1, 삭제: 0 },
    changes: [{ key: '제18조의2', article: '제18조의2', title: '', kind: '개정', rule: null }], rules: [],
  }];
  const run = (text: string) =>
    periodCheck({ text, std: STD as never, events: EVENTS as never, rules: RULES as never, from: '20260101', to: '20261231' });

  it('다른 조문 안에 있으면 찾아내고 어디인지 알려 준다', () => {
    const text = '제46조(경조사 휴가) ② 근무일 기준 20일의 유급 배우자 출산전후휴가를 부여하며 3회에 한정하여 나누어 사용할 수 있다.';
    const v = run(text).items[0].verdicts[0];
    expect(v.status).toBe('반영됨');
    expect(v.where).toBe('제46조(경조사 휴가)');
  });

  it('정말 없으면 그대로 누락이다 — 없는 것을 있다고 하지 않는다', () => {
    const v = run('제46조(경조사 휴가) ① 본인의 결혼 5일').items[0].verdicts[0];
    expect(v.status).toBe('누락');
  });

  it('짝지은 조문에서 이미 찾았으면 뒤집지 않는다', () => {
    const v = run('제39조(배우자 출산휴가) ① 20일을 주며 3회에 한정하여 나누어 사용한다.').items[0].verdicts[0];
    expect(v.status).toBe('반영됨');
  });
});

describe('anchor 가 없는 규칙은 엉뚱한 조문을 집지 않는다', () => {
  // 넓은 keywords 만으로 문서 전체를 훑으면 무관한 조문의 문구가 통과한다.
  // laws-matcher-parity 의 「신청서 + 1주 또는 2주」가 그 경계이고, 여기서도 같은 것을 고정한다.
  const STD = [{ id: '제9조', no: '제9조', title: '대상 제도', chapter: '', kind: '필수' as const, text: '', laws: [], keywords: ['대상제도'], status: 'auto' }];
  const base = {
    lawId: '001872', law: '근로기준법', article: '제60조', effective: '20260918', topic: '무관 통과 경계',
    art93: '1', required: true, keywords: ['신청서'], ok: ['1주 또는 2주'], stale: [], point: '', clause: '', mst: null, std: ['제9조'],
  };
  const text = '제1조(일반 절차) 신청서에 1주 또는 2주를 적는다.';
  const run = (rule: object) => periodCheck({ text, std: STD as never, events: [], rules: [rule] as never, from: '20260101', to: '20261231' });

  it('anchor 가 없으면 누락 그대로다', () => {
    expect(run(base).items[0].verdicts[0].status).toBe('누락');
  });
});
