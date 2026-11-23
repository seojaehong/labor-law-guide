import { describe, expect, it } from 'vitest';
import {
  isOwnSiteUrl,
  looksLikeOwnPage,
  stripSiteChrome,
  screenSourceRow,
} from '@/lib/source-self-scrape';

// 합성 입력 — 2026-03 recollect-v3 가 우리 상세 페이지(노란봉투법.com/decisions/bc_…)를 긁어 저장한 행의 모양을 본떴다.
const JUDGMENT = [
  '대법원',
  '제2부',
  '판결',
  '사건: 2099다1 임금',
  '[이유]',
  '상고이유를 판단한다.',
  '사용자가 근로자를 해고하였으나 해고에 정당한 이유가 없어 무효인 경우에는 임금을 지급하여야 한다.',
].join('\n');
const CHROME_TAIL = [
  '원문 보기',
  '유사 판정례',
  '유사 판정례 검색',
  '같은 유형의 다른 판정 사례 확인',
  'AI에게 질문하기',
  '이 판정례가 우리 사안에 적용되는지 확인',
  '전문가 상담이 필요하신가요?',
  '노무법인 위너스에서 사업장 맞춤 상담을 제공합니다.',
  '무료 상담 신청하기',
  '사건 정보',
  '판정결과',
  'overturned',
  '전문가 상담',
  '이 판정례와 유사한 사안이라면 노무법인 위너스에 문의하세요.',
  '상담 문의',
].join('\n');
const OWN_HEADER_A = '2099고정1 | 합성지방법원 granted 판정 | 노란봉투법 가이드\n판정례 검색\n핵심 쟁점\n합성 쟁점\n결과 요약\n합성 요약';
const OWN_HEADER_B = 'AI 노동법 상담\nAI 상담\n2099가단1 합성 사건\n← 검색으로\n합성지방법원 2099. 1. 1. 선고 2099가단1 판결';

describe('isOwnSiteUrl', () => {
  it.each([
    'https://노란봉투법.com/decisions/bc_da125932',
    'https://xn--o80bk8isxeinax68f.com/decisions/bc_1',
    'https://www.노란봉투법.com/decisions/bc_1',
    'https://yellowenvelope.kr/decisions/bc_1',
    'http://www.yellowenvelope.kr/x',
  ])('우리 도메인 %s 은 원천이 아니다', (url) => {
    expect(isOwnSiteUrl(url)).toBe(true);
  });
  it.each([
    'https://bigcase.ai/cases/%EB%8C%80%EB%B2%95%EC%9B%90/2018%EB%8B%A4279040',
    'https://www.law.go.kr/LSW/precInfoP.do?precSeq=1',
    'https://yellowenvelope.kr.evil.example/x',
    'not a url',
    '',
    null,
    undefined,
  ])('그 밖의 주소 %s 는 우리 도메인이 아니다', (url) => {
    expect(isOwnSiteUrl(url)).toBe(false);
  });
});

describe('looksLikeOwnPage', () => {
  it('우리 페이지 머리(제목 | 노란봉투법 가이드)로 시작하면 우리 화면이다', () => {
    expect(looksLikeOwnPage(`${OWN_HEADER_A}\n${JUDGMENT}\n${CHROME_TAIL}`)).toBe(true);
  });
  it('우리 페이지 머리(AI 노동법 상담 · ← 검색으로)로 시작하면 우리 화면이다', () => {
    expect(looksLikeOwnPage(`${OWN_HEADER_B}\n${JUDGMENT}`)).toBe(true);
  });
  it('판결문으로 시작하면 우리 화면이 아니다(꼬리에 화면 글자가 붙어 있어도)', () => {
    expect(looksLikeOwnPage(`${JUDGMENT}\n${CHROME_TAIL}`)).toBe(false);
    expect(looksLikeOwnPage(JUDGMENT)).toBe(false);
  });
});

describe('stripSiteChrome', () => {
  it('판결문 뒤에 붙은 화면 글자를 첫 표지 줄부터 끝까지 잘라 낸다', () => {
    const out = stripSiteChrome(`${JUDGMENT}\n판정 요지\n${JUDGMENT}\n${CHROME_TAIL}`);
    expect(out).not.toMatch(/전문가 상담|무료 상담 신청하기|AI에게 질문하기|노무법인 위너스|판정결과|상담 문의/);
    expect(out.startsWith(JUDGMENT)).toBe(true);
  });
  it('화면 글자가 없으면 한 글자도 바꾸지 않는다', () => {
    expect(stripSiteChrome(JUDGMENT)).toBe(JUDGMENT);
    const withWords = '원고는 피고에게 상담 비용을 청구하였다.\n판정결과에 대한 불복이 있었다.\nAI에게 질문하기를 권하였다고 진술하였다.';
    expect(stripSiteChrome(withWords)).toBe(withWords);
  });
  it('낱말이 아니라 줄 전체가 표지와 같을 때만 자른다', () => {
    const text = `${JUDGMENT}\n증인은 「무료 상담 신청하기」 버튼을 눌렀다고 진술하였다.\n끝.`;
    expect(stripSiteChrome(text)).toBe(text);
  });
  it('같은 입력에 늘 같은 결과(결정적)', () => {
    const input = `${JUDGMENT}\n${CHROME_TAIL}`;
    expect(stripSiteChrome(input)).toBe(stripSiteChrome(input));
    expect(stripSiteChrome(stripSiteChrome(input))).toBe(stripSiteChrome(input));
  });
});

describe('screenSourceRow', () => {
  const sections = [{ title: '이유', text: `${JUDGMENT}\n${CHROME_TAIL}` }];
  it('우리 도메인에서 긁은 행은 통째로 버린다(남는 글이 우리 AI 정리라서)', () => {
    const row = { source_url: 'https://노란봉투법.com/decisions/bc_x', full_text_clean: JUDGMENT, full_text_raw: '', body_sections: [{ text: JUDGMENT }] };
    expect(screenSourceRow(row)).toBeNull();
  });
  it('주소가 바깥이어도 본문이 우리 페이지 머리로 시작하면 버린다', () => {
    const row = { source_url: 'https://bigcase.ai/cases/x', full_text_clean: `${OWN_HEADER_A}\n${JUDGMENT}`, full_text_raw: '', body_sections: [] };
    expect(screenSourceRow(row)).toBeNull();
  });
  it('바깥 원천 본문 끝에 붙은 화면 글자는 잘라 내고 행은 살린다', () => {
    const row = { source_url: 'https://bigcase.ai/cases/x', full_text_clean: `${JUDGMENT}\n${CHROME_TAIL}`, full_text_raw: `${JUDGMENT}\n${CHROME_TAIL}`, body_sections: sections };
    const out = screenSourceRow(row)!;
    expect(out.full_text_clean).toBe(JUDGMENT);
    expect(out.full_text_raw).toBe(JUDGMENT);
    expect((out.body_sections as Array<{ text: string }>)[0].text).toBe(JUDGMENT);
  });
  it('깨끗한 행은 같은 객체 값을 그대로 돌려준다', () => {
    const row = { source_url: 'https://bigcase.ai/cases/x', full_text_clean: JUDGMENT, full_text_raw: null, body_sections: { not: 'array' }, coverage_ratio: 0.5 };
    expect(screenSourceRow(row)).toEqual(row);
  });
});
