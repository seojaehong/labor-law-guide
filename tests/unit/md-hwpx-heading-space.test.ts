import { describe, expect, it } from 'vitest';
import { HEADER_XML } from '@/lib/contract-write/hwpx-header';
import { mdDocXml, parseMarkdown, presetHeader } from '@/lib/md-hwpx';

// 261124 — 제목 앞뒤 간격·본문 어절 단위 줄 나눔(가상 원고)
//
// 실원고(가로·fit)를 한글 COM 으로 PDF 를 뽑아 보니 「1. 요약」「2. …」 제목 앞 간격이 거의 없었다.
// 바탕 값: 21(h1) prev 170 · 22(h2)·23(h3) prev 85 · 24(h4) prev 42 HWPUNIT, next 0.
// 새 값(pt): h1 앞 16·뒤 6 / h2 앞 12·뒤 3 / h3 앞 8 / h4 앞 6.
//  - h2 12/3 은 같은 바탕 header 의 문단 12(prev 12pt·next 3pt, case 1200·default 2400 꼴)와 같은 값이다.
//    저장소의 다른 렌더러(work-rules-report·contract-write)는 제목 간격을 따로 두지 않고 20·21 을 그대로 쓴다.
//  - 쓰는 꼴은 한글 저장본과 같은 case = pt×100, default = pt×200(header-edit ParaPatch.pt, 문단 12 도 이 꼴).
// 쪽 맨 위: 한글은 쪽 첫 줄 문단의 앞 간격을 지우지 않고 그대로 둔다. 그래서
//  - 문서 첫 제목(맨 위)과 쪽 나눔(Ⅰ~Ⅹ 장)으로 쪽 맨 위에 오는 제목은 앞 간격 0 인 복제 문단을 쓴다.
//  - 글이 흘러 우연히 쪽 맨 위에 걸린 제목은 XML 로는 알 수 없어 앞 간격이 남는다(그 쪽만 첫 줄이 12~16pt 내려간다).
// 꼬리말(쪽번호)은 제목 1 문단(21)을 빌려 쓰고 있었다 — 21 에 간격을 주면 꼬리말도 움직이므로,
// 종전 21 모양을 그대로 복제한 꼬리말 전용 문단으로 옮긴다.
const para = (h: string, id: number) => new RegExp(`<hh:paraPr id="${id}"[\\s\\S]*?</hh:paraPr>`).exec(h)![0];
const sp = (x: string, k: 'prev' | 'next') => [...x.matchAll(new RegExp(`<hc:${k} value="(-?\\d+)"`, 'g'))].map((m) => Number(m[1]));
const paraIds = (sec: string) => [...sec.matchAll(/<hp:p id="\d+" paraPrIDRef="(\d+)"[^>]*>(?:<hp:run charPrIDRef="\d+"><hp:t>([^<]*)<\/hp:t>)?/g)].map((m) => [Number(m[1]), m[2] ?? '']);

describe('제목 앞뒤 간격', () => {
  it.each(['internal', 'tribunal'] as const)('%s — 제목 1~4 간격(case·default = pt×100·pt×200), keepWithNext 유지', (preset) => {
    const h = presetHeader(preset);
    const want: Record<number, [number, number]> = { 21: [16, 6], 22: [12, 3], 23: [8, 0], 24: [6, 0] };
    for (const [id, [prev, next]] of Object.entries(want)) {
      const x = para(h, Number(id));
      expect(sp(x, 'prev'), `prev ${id}`).toEqual([prev * 100, prev * 200]);
      expect(sp(x, 'next'), `next ${id}`).toEqual([next * 100, next * 200]);
      expect(x).toContain('keepWithNext="1"');
    }
    expect(sp(para(h, 20), 'prev')).toEqual(sp(para(HEADER_XML, 20), 'prev')); // 본문 간격은 그대로
  });

  it('문서 첫 제목과 쪽 나눔 제목은 앞 간격 0, 가운데 제목은 제 간격', () => {
    const md = '# 가상 검토의견서\n\n## 1. 요약\n\n본문.\n\n## 2. 사실관계\n\n본문.\n\n## Ⅱ. 검토\n\n### 가. 쟁점\n\n본문.';
    const { header, section } = mdDocXml(parseMarkdown(md));
    const ids = paraIds(section);
    const of = (t: string) => ids.find(([, s]) => s === t)![0] as number;
    const prev = (t: string) => sp(para(header, of(t)), 'prev');
    expect(prev('가상 검토의견서')).toEqual([0, 0]);
    expect(prev('Ⅱ. 검토')).toEqual([0, 0]);
    expect(prev('1. 요약')).toEqual([1200, 2400]);
    expect(prev('2. 사실관계')).toEqual([1200, 2400]);
    expect(prev('가. 쟁점')).toEqual([800, 1600]);
    for (const t of ['가상 검토의견서', 'Ⅱ. 검토']) expect(para(header, of(t))).toContain('keepWithNext="1"');
    expect(sp(para(header, of('가상 검토의견서')), 'next')).toEqual([600, 1200]); // 뒤 간격은 남는다
  });

  it('본문으로 시작하면 첫 ## 제목은 제 간격', () => {
    const { header, section } = mdDocXml(parseMarkdown('머리 문장.\n\n## 1. 요약'));
    const id = paraIds(section).find(([, s]) => s === '1. 요약')![0] as number;
    expect(id).toBe(22);
    expect(sp(para(header, id), 'prev')).toEqual([1200, 2400]);
  });

  it('꼬리말(쪽번호)은 종전 제목 1 모양(간격 170·가운데) 그대로인 전용 문단', () => {
    const { header, section } = mdDocXml(parseMarkdown('# 제목\n\n본문'));
    const foot = /<hp:footer\b[\s\S]*?<\/hp:footer>/.exec(section)![0];
    const id = Number(/paraPrIDRef="(\d+)"/.exec(foot)![1]);
    expect(id).not.toBe(21);
    // 종전 21 = 바탕 21 에 프리셋 줄간격만 입힌 것 — id 만 다르고 글자 그대로
    const old21 = para(HEADER_XML, 21).replace(/(<hh:lineSpacing type="PERCENT" value=")\d+/g, '$1160');
    expect(para(header, id).replace(/\bid="\d+"/, '')).toBe(old21.replace(/\bid="\d+"/, ''));
  });
});

describe('본문 문단 어절 단위 줄 나눔', () => {
  it('20~29 전부 BREAK_WORD(공용 바탕 HEADER_XML 은 그대로)', () => {
    for (const preset of ['internal', 'tribunal'] as const) {
      const h = presetHeader(preset);
      for (let id = 20; id <= 29; id++) expect(/breakNonLatinWord="(\w+)"/.exec(para(h, id))![1], `${id}`).toBe('BREAK_WORD');
    }
    for (const id of [20, 21, 25, 26]) expect(para(HEADER_XML, id)).toContain('breakNonLatinWord="KEEP_WORD"');
  });
});
