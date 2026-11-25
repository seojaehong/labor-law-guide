// 퇴고 pyre — 파이썬 re·str 의 뜻을 JS 로 옮긴 도움 함수(의미범주·AI 수사 검사가 함께 쓴다).
// 기대값은 같은 입력에 파이썬 3.13(유니코드 15.1)이 낸 값을 UTF-16 위치로 옮긴 것이다. 낱말은 뜻 없는 합성 글자만 쓴다.
import { describe, expect, it } from 'vitest';
import { PY_WORD, toJsSource } from '../../tools/k-labor/lib/prose/check.mjs';
import { cpTail, pyCompile, pySplit, rstripChars, splitlines, stripChars } from '../../tools/k-labor/lib/prose/pyre.mjs';

const E = String.fromCodePoint(0x1f600); // BMP 밖 글자(서로게이트 쌍)
const span = (m: { start(): number; end(): number } | null) => (m ? [m.start(), m.end()] : null);

describe('toJsSource — \\b 는 word 를 켤 때만', () => {
  it('기본은 받지 않는다(check_prose 팩은 그대로)', () => {
    expect(() => toJsSource('퀩\\b')).toThrow();
  });
  it('word: true 이면 파이썬 유니코드 낱말 경계(글자·숫자·_)', () => {
    const rx = new RegExp(toJsSource('뷁\\b', { word: true }), 'u');
    // re.search(r"뷁\b", s)
    expect(rx.test('퀩뷁 쀼')).toBe(true);
    expect(rx.test('퀩뷁.')).toBe(true);
    expect(rx.test('퀩뷁')).toBe(true);
    expect(rx.test('퀩뷁쀼')).toBe(false);
    expect(rx.test('퀩뷁_')).toBe(false);
    expect(rx.test('퀩뷁3')).toBe(false);
    const nb = new RegExp(toJsSource('뷁\\B', { word: true }), 'u');
    expect(nb.test('퀩뷁쀼')).toBe(true);
    expect(nb.test('퀩뷁 ')).toBe(false);
  });
  it('낱말 글자는 파이썬 3.13 표(유니코드 15.1)를 따른다 — 그 뒤 새로 배정된 글자는 낱말이 아니다', () => {
    // re.search(r"퀩\b", "퀩Ᲊ") → 맞음(유니코드 16 새 글자) · re.search(r"퀩\b", "퀩А") → 없음
    expect(pyCompile('퀩\\b').search(`퀩${String.fromCharCode(0x1c89)}`)).not.toBeNull();
    expect(pyCompile('퀩\\b').search(`퀩${String.fromCharCode(0x0410)}`)).toBeNull();
  });
  it('낱말 글자 수 = 파이썬 3.13 의 \\w 글자 수(Node 유니코드 판이 바뀌면 표를 고칠 때다)', () => {
    const w = new RegExp(`^${PY_WORD}$`, 'u');
    let n = 0;
    for (let c = 0; c < 0x110000; c++) if ((c < 0xd800 || c > 0xdfff) && w.test(String.fromCodePoint(c))) n++;
    expect(n).toBe(138558);
  });
  it('\\B 는 빈 글에서 맞지 않는다(파이썬 3.13) · 공백 하나면 0 자리', () => {
    expect(pyCompile('\\B').search('')).toBeNull();
    expect(span(pyCompile('\\B').search(' '))).toEqual([0, 0]);
  });
  it('글자 묶음 안의 \\b 는 받지 않는다', () => {
    expect(() => toJsSource('[\\b]', { word: true })).toThrow();
  });
  it('둘러보기(뒤) 안에서 되풀이되는 잡는 묶음은 받지 않는다(JS 는 뒤에서부터 잡아 마지막 값이 다르다)', () => {
    // re.search(r"(?<=(?P<s>[XY]){2})Z", "XYZ").group("s") == "Y" · JS 는 "X"
    expect(() => toJsSource('(?<=(?P<s>[XY]){2})Z')).toThrow();
    expect(() => toJsSource('(?<=(?:(뷁)퀩)+)Z')).toThrow();
    // 되풀이 없는 잡는 묶음·안 잡는 묶음의 되풀이는 그대로
    expect(() => toJsSource('(?<=(뷁)퀩)Z')).not.toThrow();
    expect(() => toJsSource('(?<=(?:뷁){2})Z')).not.toThrow();
  });
});

describe('pyCompile — search·match·fullmatch·finditer·sub', () => {
  it('match 는 그 자리에서만, fullmatch 는 끝까지', () => {
    const p = pyCompile('퀩+');
    expect(p.match('뷁퀩퀩')).toBeNull();
    expect(p.match('뷁퀩퀩', 1)?.group(0)).toBe('퀩퀩');
    expect(p.fullmatch('퀩퀩')).not.toBeNull();
    expect(p.fullmatch('퀩퀩뷁')).toBeNull();
    // 갈래가 앞에서 끝나도 끝까지 가는 갈래를 찾는다 — re.fullmatch("퀩|퀩뷁", "퀩뷁")
    expect(pyCompile('퀩|퀩뷁').fullmatch('퀩뷁')?.group(0)).toBe('퀩뷁');
  });
  it('이름 묶음의 시작·끝(지나지 않은 묶음은 -1·None)', () => {
    const m = pyCompile('(?P<a>퀩)(?P<b>뷁)?').search('쀼퀩')!;
    expect(m.start('a')).toBe(1);
    expect(m.end('a')).toBe(2);
    expect(m.start('b')).toBe(-1);
    expect(m.group('b')).toBeNull();
    expect(m.groupdict()).toEqual({ a: '퀩', b: null });
  });
  it('search 의 pos — ^ 는 글 처음에만(파이썬과 같이)', () => {
    const p = pyCompile('^퀩');
    expect(p.search('쀼퀩', 1)).toBeNull();
    expect(pyCompile('퀩').search('퀩쀼퀩', 1)?.start()).toBe(2);
  });
  it('finditer·findall·sub', () => {
    expect(pyCompile('퀩+').finditer('퀩퀩 뷁 퀩').map((m) => m.group(0))).toEqual(['퀩퀩', '퀩']);
    expect(pyCompile('퀩').sub((m) => '·'.repeat(m.group(0)!.length), '쀼퀩뷁퀩')).toBe('쀼·뷁·');
    expect(pyCompile('퀩(뷁)?').findall('퀩뷁 퀩')).toEqual(['뷁', '']);
    expect(pyCompile('퀩').findall('퀩뷁 퀩')).toEqual(['퀩', '퀩']);
  });
  it('빈 글자에 맞을 수 있는 식은 finditer·findall·sub 가 받지 않는다(search·match 는 된다)', () => {
    const p = pyCompile('x*');
    expect(() => p.finditer('ab')).toThrow();
    expect(() => p.findall('ab')).toThrow();
    expect(() => p.sub('-', 'ab')).toThrow();
    expect(span(p.search('ab'))).toEqual([0, 0]);
    expect(() => pyCompile('(?=퀩)').finditer('퀩')).toThrow();
  });
});

describe('BMP 밖 글자(서로게이트 쌍) — 쌍 가운데는 파이썬에 없는 자리다', () => {
  it('닻 ^ $ 는 쌍 가운데서 맞지 않는다', () => {
    expect(pyCompile('^x*$').search(`가${E}나`)).toBeNull();
    expect(span(pyCompile('x*$').search(`가${E}나.`))).toEqual([5, 5]);
    expect(span(pyCompile('(?:[.!~]+)*$').search(`가${E}나.`))).toEqual([4, 5]);
  });
  it('둘러보기로 시작하는 일치도 쌍 가운데서 시작하지 않는다', () => {
    expect(pyCompile('(?<![가-힣]).').finditer(`가${E}나`).map((m) => m.group(0))).toEqual(['가', '나']);
    expect(span(pyCompile(`(?<![퀩])퀩|(?<=${E})`).search(`${E}퀩`))).toEqual([2, 3]);
  });
  it('여러 줄 닻(re.M)', () => {
    expect(pyCompile('^.', { multiline: true }).finditer(`가${E}\n나`).map((m) => m.group(0))).toEqual(['가', '나']);
    expect(pyCompile('.$', { multiline: true }).finditer(`가${E}\n나`).map((m) => span(m))).toEqual([[1, 3], [4, 5]]);
  });
  it('sub 의 앞보기', () => {
    expect(pyCompile(`퀩(?=${E})`).sub('-', `퀩${E}퀩${E}`)).toBe(`-${E}-${E}`);
  });
});

describe('str 도움 함수', () => {
  it('split() — 파이썬 공백(전각 공백 포함)으로 나누고 빈 조각은 버린다', () => {
    expect(pySplit(`  퀩 뷁${String.fromCharCode(0x3000)}쀼\n`)).toEqual(['퀩', '뷁', '쀼']);
    expect(pySplit('')).toEqual([]);
  });
  it('splitlines() — 끝 줄바꿈은 빈 줄을 만들지 않는다', () => {
    expect(splitlines(`퀩\n뷁${String.fromCharCode(0x2028)}쀼\n`)).toEqual(['퀩', '뷁', '쀼']);
    expect(splitlines('퀩\n\n뷁')).toEqual(['퀩', '', '뷁']);
    expect(splitlines('')).toEqual([]);
  });
  it('strip(chars)·rstrip(chars)', () => {
    expect(stripChars('**퀩**', '*')).toBe('퀩');
    expect(rstripChars('퀩.. ', '. ')).toBe('퀩');
  });
  it('s[-n:] 는 코드포인트로', () => {
    expect(cpTail(`퀩${E}뷁`, 2)).toBe(`${E}뷁`);
    expect(cpTail('퀩', 5)).toBe('퀩');
  });
});
