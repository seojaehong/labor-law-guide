// md → 한글(hwpx) 변환 — 로컬 스킬 generate_hwpx.py 와 같은 규칙인지 본다(견본은 모두 합성).
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { mdSectionXml, mdToHwpx, parseMarkdown, presetHeader } from '@/lib/md-hwpx';
import { HEADER_XML } from '@/lib/contract-write/hwpx-header';

const paras = (xml: string) => [...xml.matchAll(/<hp:p [^>]*paraPrIDRef="(\d+)"[^>]*pageBreak="(\d)"[^>]*>([\s\S]*?)<\/hp:p>/g)];
const runText = (inner: string) => [...inner.matchAll(/<hp:t>([^<]*)<\/hp:t>/g)].map((m) => m[1]).join('');
const findPara = (xml: string, text: string) => paras(xml).find((m) => runText(m[3]) === text);

describe('parseMarkdown — 줄 분류', () => {
  it('번호·기호로 시작하는 2단계 제목에는 □ 를 겹치지 않는다(261119)', () => {
    const texts = parseMarkdown('## 1. 수신 경위\n\n## 가. 쟁점\n\n## ① 첫째\n\n## □ 이미 기호\n\n## 개요\n\n## 2026년 계획').filter((x) => x.kind === 'h2').map((x) => x.text);
    expect(texts).toEqual(['1. 수신 경위', '가. 쟁점', '① 첫째', '□ 이미 기호', '□ 개요', '□ 2026년 계획']);
  });

  it('제목 단계·□ 붙이기·로마숫자 쪽나눔', () => {
    const items = parseMarkdown('# 검토 의견\n\n## 사실관계\n\n## Ⅱ. 검토\n\n### 1. 쟁점\n\n#### 가. 세부\n');
    expect(items.map((x) => x.kind)).toEqual(['h1', 'h2', 'h2', 'h3', 'h4']);
    expect(items[1]).toMatchObject({ text: '□ 사실관계', pageBreak: false });
    expect(items[2]).toMatchObject({ text: 'Ⅱ. 검토', pageBreak: true });
  });

  it('곧은 따옴표는 둥근 따옴표로, 빈 줄과 가로줄은 버린다', () => {
    const items = parseMarkdown('그는 "예"라고 답했다.\n\n---\n\n끝.');
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: 'body', text: '  그는 “예”라고 답했다.' });
  });

  it('목록 — 법령 번호는 번호만, 그 밖은 「- 」를 남긴다', () => {
    const items = parseMarkdown('- 가. 첫째\n- 일반 항목\n1. 번호 항목');
    expect(items.map((x) => ('text' in x ? x.text : ''))).toEqual(['    가. 첫째', '  - 일반 항목', '  1. 번호 항목']);
    expect(items.every((x) => x.kind === 'list')).toBe(true);
  });

  it('서명부 = 끝 15줄 안의 날짜만 있는 줄부터. 본문의 날짜 문장은 서명부가 아니다', () => {
    const md = '2025. 11. 14.~12. 31.분은 따로 본다.\n\n## 결론\n\n위와 같다.\n\n2026. 11. 19.\n\n노무법인 가나다\n공인노무사 홍길동';
    const items = parseMarkdown(md);
    expect(items[0].kind).not.toBe('sig'); // 파이썬 판과 같게 「숫자. 」 시작은 번호 목록으로 본다
    expect(items[1].kind).toBe('h2');
    const sig = items.filter((x) => x.kind === 'sig').map((x) => ('text' in x ? x.text : ''));
    expect(sig).toEqual(['2026. 11. 19.', '노무법인 가나다', '공인노무사 홍길동']);
  });

  it('서명부 앞 빈 줄만 남긴다', () => {
    const items = parseMarkdown('본문\n\n2026. 11. 19.\n\n서명');
    expect(items.map((x) => x.kind)).toEqual(['body', 'empty', 'sig', 'empty', 'sig']);
  });

  it('표 — 구분행은 정렬로, 빈 칸은 그대로', () => {
    const items = parseMarkdown('| 항목 | 금액 | 비고 |\n|:---:|---:|---|\n| 기본급 | 2,000,000 | |\n| 수당 | 100,000 | 월 |');
    expect(items).toHaveLength(1);
    const t = items[0];
    if (t.kind !== 'table') throw new Error('표가 아님');
    expect(t.aligns).toEqual(['CENTER', 'RIGHT', 'LEFT']);
    expect(t.rows).toEqual([['항목', '금액', '비고'], ['기본급', '2,000,000', ''], ['수당', '100,000', '월']]);
  });
});

describe('mdSectionXml — 문단·글자 모양', () => {
  it('제목은 단계별 글자·문단 모양, 본문 굵게와 판례 번호는 굵은 글자(12)', () => {
    const xml = mdSectionXml(parseMarkdown('# 의견서\n\n## 개요\n\n본문 **강조** 그리고 대법원 2017. 12. 22. 선고 2016다202947 판결 참조.'));
    const h1 = findPara(xml, '의견서')!;
    expect(h1[1]).toBe('21');
    expect(h1[3]).toContain('charPrIDRef="8"');
    expect(findPara(xml, '□ 개요')![1]).toBe('22');
    const body = paras(xml).find((m) => runText(m[3]).includes('강조'))!;
    expect(body[1]).toBe('20');
    expect(body[3]).toContain('<hp:run charPrIDRef="12"><hp:t>강조</hp:t></hp:run>');
    expect(body[3]).toContain('<hp:run charPrIDRef="12"><hp:t>대법원 2017. 12. 22. 선고 2016다202947 판결</hp:t></hp:run>');
    expect(xml).not.toContain('**');
  });

  it('로마숫자 장 제목은 쪽을 나누고, 서명부는 오른쪽(26)', () => {
    const xml = mdSectionXml(parseMarkdown('## Ⅰ. 개요\n\n본문.\n\n2026. 11. 19.\n\n노무법인 가나다'));
    expect(findPara(xml, 'Ⅰ. 개요')![2]).toBe('1');
    expect(findPara(xml, '2026. 11. 19.')![1]).toBe('26');
    expect(findPara(xml, '노무법인 가나다')![1]).toBe('26');
  });

  it('쪽번호 꼬리말이 기본으로 들어가고 끌 수 있다', () => {
    expect(mdSectionXml(parseMarkdown('본문'))).toContain('<hp:autoNum numType="PAGE"');
    expect(mdSectionXml(parseMarkdown('본문'), { footer: false })).not.toContain('subListType="FOOTER"');
  });
});

describe('표', () => {
  const tbl = (xml: string) => /<hp:tbl [\s\S]*?<\/hp:tbl>/.exec(xml)![0];

  it('머리행 음영·반복, 정렬, 칸 안 줄바꿈과 굵게, 열 폭 합 = 본문 폭', () => {
    const xml = tbl(mdSectionXml(parseMarkdown('| 항목 | 금액 | 비고 |\n|:---:|---:|---|\n| **기본급** | 2,000,000 | 첫 줄<br>둘째 줄 |')));
    expect(xml).toContain('repeatHeader="1"');
    expect(xml).toContain('colCnt="3"');
    const tcs = [...xml.matchAll(/<hp:tc [^>]*header="(\d)"[^>]*borderFillIDRef="(\d)"[\s\S]*?paraPrIDRef="(\d+)"[\s\S]*?<hp:cellSz width="(\d+)"/g)];
    expect(tcs.slice(0, 3).map((m) => [m[1], m[2], m[3]])).toEqual([['1', '4', '28'], ['1', '4', '28'], ['1', '4', '28']]);
    expect(tcs.slice(3).map((m) => m[3])).toEqual(['28', '29', '27']);
    expect(tcs.slice(0, 3).reduce((s, m) => s + Number(m[4]), 0)).toBe(59528 - 5670 * 2);
    expect(xml).toContain('<hp:run charPrIDRef="14"><hp:t>기본급</hp:t></hp:run>');
    expect(xml).toContain('<hp:lineBreak/>');
    expect(xml).not.toContain('&lt;br');
    expect([...xml.matchAll(/rowAddr="(\d+)"/g)].map((m) => m[1])).toEqual(['0', '0', '0', '1', '1', '1']);
  });

  it('짧은 표는 글자처럼, 긴 표는 떠 있는 표(쪽을 넘긴다)', () => {
    const short = '| 가 | 나 |\n|---|---|\n| 1 | 2 |';
    const long = ['| 연번 | 내용 |', '|---|---|', ...Array.from({ length: 40 }, (_, i) => `| ${i + 1} | 합성 견본 문장 ${i + 1} |`)].join('\n');
    expect(tbl(mdSectionXml(parseMarkdown(short)))).toContain('treatAsChar="1"');
    expect(tbl(mdSectionXml(parseMarkdown(long)))).toContain('treatAsChar="0"');
  });

  it('7열 이상이면 작은 글자(15·16)', () => {
    const md = `| ${'가 |'.repeat(7)}\n|${'---|'.repeat(7)}\n| ${'1 |'.repeat(7)}`;
    const xml = tbl(mdSectionXml(parseMarkdown(md)));
    expect(xml).toContain('charPrIDRef="16"');
    expect(xml).toContain('charPrIDRef="15"');
  });
});

describe('프리셋', () => {
  const ls = (h: string, id: number) => /lineSpacing type="PERCENT" value="(\d+)"/.exec(new RegExp(`<hh:paraPr id="${id}"[\\s\\S]*?</hh:paraPr>`).exec(h)![0])![1];

  it('internal 은 바탕 그대로(행간 160), tribunal 은 행간 200·표 칸만 130', () => {
    expect(ls(presetHeader('internal'), 20)).toBe('160');
    const t = presetHeader('tribunal');
    expect(ls(t, 20)).toBe('200');
    expect(ls(t, 22)).toBe('200');
    expect(ls(t, 27)).toBe('130');
    expect(ls(t, 29)).toBe('130');
    expect(HEADER_XML).toContain('lineSpacing type="PERCENT" value="160"');
  });

  it('tribunal 여백 위 45mm·아래 30mm, 긴 표 판정도 그 본문 높이로', () => {
    const xml = mdSectionXml(parseMarkdown('본문'), { preset: 'tribunal' });
    expect(xml).toContain('left="5670" right="5670" top="12758" bottom="8505"');
  });
});

describe('mdToHwpx — 꾸러미', () => {
  it('mimetype 이 첫 항목·무압축, 폴더 항목 없음, 제목 메타 = 첫 h1', async () => {
    const bytes = await mdToHwpx('# 합성 의견서\n\n본문 **굵게**.', { preset: 'tribunal' });
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files);
    expect(names[0]).toBe('mimetype');
    expect(names.some((n) => n.endsWith('/'))).toBe(false);
    expect(await zip.file('Contents/content.hpf')!.async('string')).toContain('<opf:title>합성 의견서</opf:title>');
    const header = await zip.file('Contents/header.xml')!.async('string');
    expect(header).toContain('value="200"');
    expect(await zip.file('Contents/section0.xml')!.async('string')).toContain('<hp:t>굵게</hp:t>');
  });
});

describe('실제 원고 루브릭에서 찾은 것(261119)', () => {
  it('전각 숫자 「１.」 줄도 번호 목록이다(파이썬 \d 는 유니코드 숫자를 잡는다)', () => {
    expect(parseMarkdown('１.  비위행위 : 정의')).toEqual([{ kind: 'list', text: '  １. 비위행위 : 정의' }]);
  });
  it('여러 줄에 걸친 **굵게** 는 줄마다 닫고 다시 연다 — 기호가 글자로 남지 않는다', () => {
    const items = parseMarkdown('- 앞 **굵은 시작\n이어지는 끝** 뒤');
    expect(items.map((x) => ('text' in x ? x.text : ''))).toEqual(['  - 앞 **굵은 시작**', '  **이어지는 끝** 뒤']);
    const sec = mdSectionXml(items);
    expect(sec).not.toContain('**');
    expect(sec).toContain('<hp:t>굵은 시작</hp:t>');
  });
  it('짝이 없는 ** 는 건드리지 않는다(다음 줄에 닫는 짝이 없거나 코드 안)', () => {
    expect(parseMarkdown('제외 목록에 `**` 를 더했다\n다음 줄')[0]).toEqual({ kind: 'body', text: '  제외 목록에 `**` 를 더했다' });
    expect(parseMarkdown('별표 ** 하나\n\n다른 문단 ** 하나').map((x) => ('text' in x ? x.text : ''))).toEqual(['  별표 ** 하나', '  다른 문단 ** 하나']);
  });
});
