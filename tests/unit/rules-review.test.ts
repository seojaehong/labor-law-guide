import { describe, expect, it } from 'vitest';
import { parseRegulation, type Regulation } from '@/lib/rules-review/model';
import { annexOwner, groupSame, nameFromFile, nameFromText, sameName, versionDate } from '@/lib/rules-review/names';
import { findRefs, runChecks, type Finding } from '@/lib/rules-review/checks';

// 합성 기관 — 결함을 일부러 심었다. 실명·실제 기관 아님
const reg = (name: string, body: string): Regulation =>
  parseRegulation({ key: name, name, fileName: `${name}.txt`, kind: 'txt', lines: [name, ...body.trim().split('\n')].map((text) => ({ text, controls: 0 })) });

const INSA = reg('직원 인사 규정', `
제    정 : 2001. 03. 01.
최근개정 : 2023. 11. 08.
제1장 총칙
제1조(목적) 이 규정은 시험기관 직원의 인사에 관한 사항을 정한다.
제2조(정의) 이 규정에서 사용하는 용어의 뜻은 다음과 같다.
1. “직원”이란 기관과 근로계약을 맺은 사람을 말한다.
제3조(임용) ① 직원의 임용은 원장이 한다.
② 임용 절차는 「직원인사규정 시행세칙」으로 정한다.
제4조 삭제[2015.01.30.개정]
제5조(승진) ① 승진은 제3조제2항에 따른다.
② 승진 심사는 「직원 보수규정」 제2조에 따른 호봉을 고려한다.
③ 승진에 필요한 서류는 별지 제1호서식에 따른다.
제7조(휴직) ① 휴직 기간은 1년 이내로 한다.
③ 휴직 신청은 제4조를 따른다.
제8조(징계) 징계는 「인사위원회 규정」 제9조에 따른다. 당해 직원에게는 익일까지 알린다.
부 칙
이 규정은 2001년 3월 1일부터 시행한다. 종전 제12조는 폐지한다.
[별지 제1호서식] 승진 신청서
[별표 2] 직급표
`);

const SECHIK = reg('직원인사규정 시행세칙', `
제1조(목적) 이 세칙은 「직원 인사 규정」에 따라 필요한 사항을 정한다.
제2조(정의) 1. “직원”이란 정규직 근로자를 말한다.
제3조(휴직) 휴직 기간은 2년 이내로 한다.[2015.0130개정]
제4조(인용) 직원인사규정 제5조에 따라 승진을 정하고 직원인사규정 제20조는 따로 본다.
`);

const BOSU = reg('직원 보수 규정', `
제1조(목적) 이 규정은 보수를 정한다.
제2조(호봉) 호봉은 별표 1에 따른다.<개정 2020.1.1.>
제3조(지급) ① 보수는 기타 필요한 사항과 함께 매월 지급한다.
➁ 지급일은 매월 25일로 한다.
[별표 1] 호봉표
`);

const CLEAN = reg('문서 관리 규정', `
제1조(목적) 이 규정은 문서 관리를 정한다.
제2조(보존) ① 문서는 「직원 인사 규정」 제3조에 따른 기간 동안 보존한다.
② 보존 방법은 「고등교육법」 제5조와 별표 1에 따른다.
제3조(폐기) 제2조제2항에 따라 폐기한다. 형법 제355조 및 제356조, 「직원 인사 규정」(이하 “인사규정”이라 한다) 제3조와 제5조를 따른다.
제4조(공무원 준용) 「공무원 수당 등에 관한 규정」을 준용한다.
[별표 1] 보존 기간표
<별표 Ⅱ> 삭제[2009.5.20]
`);

const ALL = [INSA, SECHIK, BOSU, CLEAN];
const findings = runChecks(ALL);
const of = (reg: string, kind: Finding['kind']) => findings.filter((f) => f.reg === reg && f.kind === kind);

describe('규정 이름', () => {
  it('파일 이름에서 분류번호·날짜·개정 꼬리를 뗀다', () => {
    expect(nameFromFile('2-3-18 직원 인사 규정_일부개정(20231103)_일부개정.hwp')).toBe('직원 인사 규정');
    expect(nameFromFile('교원 소속변경에 관한 세칙(20221227)_신규제정.hwp')).toBe('교원 소속변경에 관한 세칙');
    expect(nameFromFile('1-1-1 학교법인다라학원 정관(20240206)_일부개정.hwp')).toBe('학교법인다라학원 정관');
  });
  it('본문 첫머리에서 이름을 찾는다', () => {
    expect(nameFromText([{ text: '직원인사규정 시행세칙', controls: 0 }, { text: '제1조(목적) …', controls: 0 }])).toBe('직원인사규정 시행세칙');
    expect(nameFromText([{ text: '제1조(목적) …', controls: 0 }])).toBeNull();
  });
  it('띄어쓰기·가운뎃점·기관 머리가 달라도 같은 규정으로 본다', () => {
    expect(sameName('직원 인사 규정', '직원인사규정')).toBe(true);
    expect(sameName('물품 구매·용역 및 계약 규정', '물품 구매용역 및 계약 규정')).toBe(true);
    expect(sameName('가나대학교 명예졸업 규정', '명예졸업 규정')).toBe(true);
    expect(sameName('교원 인사 규정', '직원 인사 규정')).toBe(false);
  });
  it('같은 규정의 여러 파일은 늦은 판 → hwpx·hwp 순으로 하나만 고른다', () => {
    const g = groupSame([
      { path: 'a/직원 인사 규정(20231103).pdf.hwp', name: '직원 인사 규정', kind: 'hwp' as const, date: '20231103', size: 10 },
      { path: 'b/직원인사규정(20220101).hwpx', name: '직원인사규정', kind: 'hwpx' as const, date: '20220101', size: 10 },
      { path: 'c/직원 인사 규정(20231103).hwpx', name: '직원 인사 규정', kind: 'hwpx' as const, date: '20231103', size: 10 },
      { path: 'd/교원 인사 규정.hwp', name: '교원 인사 규정', kind: 'hwp' as const, date: '', size: 10 },
    ]);
    expect(g).toHaveLength(2);
    expect(g[0].chosen.path).toBe('c/직원 인사 규정(20231103).hwpx');
    expect(g[0].others).toHaveLength(2);
    expect(versionDate('x(20231103)_일부개정.hwp')).toBe('20231103');
    expect(versionDate('x.hwp', '2023. 11. 8.')).toBe('20231108');
  });
  it('별표·별지 파일은 앞부분 규정에 붙인다', () => {
    expect(annexOwner('직원 인사 규정 별지 제1호서식')).toBe('직원 인사 규정');
    expect(annexOwner('직원 인사 규정')).toBeNull();
  });
});

describe('조문 찾기', () => {
  it('조문·항·부칙·별표·머리 정보를 나눈다', () => {
    expect(INSA.articles.map((a) => a.no)).toEqual(['제1조', '제2조', '제3조', '제4조', '제5조', '제7조', '제8조']);
    expect(INSA.articles[3].deleted).toBe(true);
    expect(INSA.articles[2].paras).toEqual([1, 2]);
    expect(INSA.annexes.map((a) => a.key)).toEqual(['별지1', '별표2']);
    expect(INSA.meta.amended).toBe('2023. 11. 08.');
    expect(INSA.suppStart).not.toBeNull();
  });
  it('인용을 낫표·이름·이름 없는 조문으로 나눠 찾는다', () => {
    const r = findRefs('「직원 보수규정」 제2조에 따른 호봉과 제3조제2항, 직원인사규정 제5조, 「고등교육법」 제5조, 법 제7조');
    expect(r.filter((x) => !x.foreign).map((x) => [x.name, x.no, x.para])).toEqual([
      ['직원 보수규정', '제2조', null], [null, '제3조', 2], ['직원인사규정', '제5조', null], ['고등교육법', '제5조', null],
    ]);
  });
  it('이어 적은 조문은 앞 인용의 대상을 따른다', () => {
    const r = findRefs('「정관」(이하 “정관”이라 한다) 제44조, 제86조와 형법 제355조 및 제356조, 회계 규칙 제52조(장부),제53조(서류)');
    expect(r.map((x) => [x.name, x.no])).toEqual([
      ['정관', '제44조'], ['정관', '제86조'], ['(다른 법령·규정)', '제355조'], ['(다른 법령·규정)', '제356조'], ['회계 규칙', '제52조'], ['회계 규칙', '제53조'],
    ]);
    // 「회계 규칙」은 묶음에 없는 이름이라 대조에서는 말하지 않는다(낫표 없는 이름은 경계가 불확실하다)
    expect(runChecks([parseRegulation({ key: 'x', name: '시험 규정', fileName: 'x.txt', kind: 'txt', lines: [{ text: '제1조(목적) 회계 규칙 제52조(장부),제53조(서류)에 따른다.', controls: 0 }] })])).toEqual([]);
  });
});

describe('규정 간 대조 — 심은 결함을 잡는다', () => {
  it('없는 조문·삭제된 조문·없는 항을 인용한 곳', () => {
    expect(of('직원인사규정 시행세칙', 'article-ref').map((f) => f.before)).toEqual(['직원인사규정 제20조']);
    expect(of('직원 인사 규정', 'deleted-ref').map((f) => f.before)).toEqual(['제4조']);
    expect(of('직원 인사 규정', 'para-ref')).toHaveLength(0); // 제3조제2항은 있다
  });
  it('띄어쓰기만 다른 규정 이름은 정식 이름으로 바꿀 문안을 낸다', () => {
    const f = of('직원 인사 규정', 'reg-name');
    expect(f.map((x) => [x.before, x.after])).toEqual([['직원 보수규정', '직원 보수 규정']]);
  });
  it('묶음에 없는 규정 인용', () => {
    expect(of('직원 인사 규정', 'reg-ref').map((f) => f.before)).toEqual(['인사위원회 규정']);
  });
  it('조 번호 빠짐과 항 번호 건너뜀', () => {
    expect(of('직원 인사 규정', 'numbering').map((f) => f.before)).toEqual(['제6조']);
    expect(of('직원 인사 규정', 'para-numbering').map((f) => f.before)).toEqual(['1→3']);
  });
  it('모양만 같은 다른 동그라미 숫자로 적은 항 번호', () => {
    const f = of('직원 보수 규정', 'para-glyph');
    expect(f.map((x) => [x.before, x.after])).toEqual([['➁', '②']]);
    expect(of('직원 보수 규정', 'para-numbering')).toHaveLength(0);
  });
  it('별표·서식 — 부르는데 없는 것, 실렸는데 안 부르는 것', () => {
    expect(of('직원 인사 규정', 'annex-unused').map((f) => f.before)).toEqual(['별표 2']);
    expect(of('직원 인사 규정', 'annex-missing')).toHaveLength(0);
  });
  it('같은 용어를 규정마다 다르게 정의한 곳', () => {
    expect(of('직원 인사 규정', 'definition')).toHaveLength(1);
    expect(of('직원인사규정 시행세칙', 'definition')[0].other?.reg).toBe('직원 인사 규정');
  });
  it('규정과 시행세칙의 같은 제목 조문에서 숫자 기준이 다른 곳', () => {
    const f = of('직원인사규정 시행세칙', 'same-matter');
    expect(f).toHaveLength(1);
    expect(f[0].before).toBe('2년');
  });
  it('알기 쉬운 표현 — 바꿀 말과 자리를 모두 낸다', () => {
    const f = of('직원 인사 규정', 'plain');
    expect(f.map((x) => [x.before, x.after])).toEqual([['당해', '해당'], ['익일', '다음 날']]);
    expect(of('직원 보수 규정', 'plain').map((x) => x.after)).toEqual(['그 밖의']);
  });
  it('날짜가 깨진 개정 표시와 섞인 개정 표시 모양', () => {
    expect(of('직원인사규정 시행세칙', 'amend-mark').map((f) => f.before)).toContain('2015.0130');
    // 기준은 법령 표기 방식(<개정 …>) — 옛 모양([… 개정])만 걸린다
    expect(of('직원 인사 규정', 'amend-mark').map((f) => f.before)).toEqual(['[2023.9.1.개정]']);
    expect(of('직원 보수 규정', 'amend-mark')).toEqual([]);
  });
  it('항목 번호는 다시 돌려도 같다', () => {
    expect(runChecks(ALL).map((f) => f.id)).toEqual(findings.map((f) => f.id));
    expect(new Set(findings.map((f) => f.id)).size).toBe(findings.length);
  });
});

describe('규정 간 대조 — 깨끗한 글에서는 울리지 않는다', () => {
  it('문서 관리 규정은 걸린 곳이 없다', () => {
    expect(findings.filter((f) => f.reg === '문서 관리 규정')).toEqual([]);
  });
  it('부칙 안의 종전 조문 번호는 보지 않는다', () => {
    expect(findings.some((f) => f.before.includes('제12조'))).toBe(false);
  });
});
