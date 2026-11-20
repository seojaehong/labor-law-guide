import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { mdDocXml, mdHwpxSummary, mdToHwpx, parseMarkdown, presetHeader, type MdFeatures } from '@/lib/md-hwpx';
import { checkHeader } from '@/lib/md-hwpx/header-check';
import { CHAR, getItem, paraMargins } from '@/lib/md-hwpx/header-edit';

// 편집 기술 조각 S2·S3·S4 — 선택값을 켰을 때만 바뀌고, 켜도 header 불변식(S0)을 지킨다
const doc = (md: string, features: MdFeatures) => {
  const items = parseMarkdown(md, { features });
  return { items, ...mdDocXml(items, { features }) };
};
const paras = (section: string) => [...section.matchAll(/<hp:p [^>]*paraPrIDRef="(\d+)"[^>]*>([\s\S]*?)<\/hp:p>/g)].map((m) => ({ pp: Number(m[1]), inner: m[2], text: [...m[2].matchAll(/<hp:t>([^<]*)<\/hp:t>/g)].map((t) => t[1]).join('') }));
const paraOf = (section: string, start: string) => paras(section).find((p) => p.text.startsWith(start))!;
const runOf = (section: string, text: string) => Number(new RegExp(`charPrIDRef="(\\d+)"><hp:t>${text}</hp:t>`).exec(section)![1]);

describe('S2 — 기호 내어쓰기', () => {
  const md = '본문 평문 문장\n\n○ 가나 기호 문단\n\n- 목록 항목\n\n① 번호 항목\n\n1. 순서 항목';
  it('기호 문단 intent < 0(case·default 모두), 평문 intent 0, 첫 글자가 공백인 문단 없음', () => {
    const { header, section } = doc(md, { indent: true });
    const plain = paraMargins(header, paraOf(section, '본문').pp);
    expect(plain.case.intent).toBe(0);
    expect(plain.default.intent).toBe(0);
    for (const s of ['○ 가나', '- 목록', '① 번호', '1. 순서']) {
      const m = paraMargins(header, paraOf(section, s).pp);
      expect(m.case.intent, s).toBeLessThan(0);
      expect(m.default.intent, s).toBeLessThan(0);
    }
    // 「○ 」 = 1.5em × 12pt = 18pt → case −1800 / default −3600 (한글 저장 꼴, 미실측)
    expect(paraMargins(header, paraOf(section, '○ 가나').pp).case.intent).toBe(-1800);
    for (const p of paras(section)) if (p.text) expect(p.text.startsWith(' '), p.text).toBe(false);
    expect(checkHeader(header, section)).toEqual([]);
  });
  it('기호 폭은 휴먼명조 12pt 한글 렌더 실측값(261119): ㉮·㈎·⑴ 도 기호, 「·」 1em, 「.」 0.27em, 「( )」 0.31em', () => {
    const m2 = '㉮ 가 항목\n\n㈎ 나 항목\n\n⑴ 다 항목\n\n· 라 항목\n\n1. 마 항목\n\n(1) 바 항목';
    const { header, section } = doc(m2, { indent: true });
    const hang = (s: string) => -paraMargins(header, paraOf(section, s).pp).case.intent / 100;
    expect(hang('㉮ 가')).toBe(18);
    expect(hang('㈎ 나')).toBe(18);
    expect(hang('⑴ 다')).toBe(18);
    expect(hang('· 라')).toBe(18); // 1em + 공백 0.5em
    expect(hang('1. 마')).toBeCloseTo(15.24, 1); // 0.5 + 0.27 + 0.5
    expect(hang('(1) 바')).toBeCloseTo(19.49, 1); // 0.312 + 0.5 + 0.312 + 0.5
  });
  it('끄면 기존 출력(공백 들여쓰기) 그대로', () => {
    const { header, section } = doc(md, {});
    expect(header).toBe(presetHeader('internal'));
    expect(paraOf(section, '  본문')).toBeTruthy();
  });
});

describe('S3 — 강조 밑줄', () => {
  const md = '문장 안에 **강조 낱말**이 있다.\n\n**줄 전체 강조**\n\n여기 <u>밑줄만</u> 있다. 대법원 2017. 12. 22. 선고 2016다202947 판결';
  it('문장 안 ** = 굵게+밑줄, 줄 전체 = 굵게만, <u> = 밑줄, 판례 번호 = 굵게만', () => {
    const { header, section, items } = doc(md, { underline: true });
    const inline = getItem(header, CHAR, runOf(section, '강조 낱말'));
    expect(inline).toContain('<hh:bold/>');
    expect(inline).toContain('<hh:underline type="BOTTOM"');
    const whole = getItem(header, CHAR, runOf(section, '줄 전체 강조'));
    expect(whole).toContain('<hh:bold/>');
    expect(whole).toContain('<hh:underline type="NONE"');
    const u = getItem(header, CHAR, runOf(section, '밑줄만'));
    expect(u).not.toContain('<hh:bold/>');
    expect(u).toContain('<hh:underline type="BOTTOM"');
    expect(getItem(header, CHAR, runOf(section, '대법원 2017. 12. 22. 선고 2016다202947 판결'))).toContain('<hh:underline type="NONE"');
    expect(section).not.toContain('&lt;u&gt;');
    expect(mdHwpxSummary(items, { underline: true }).leftovers).not.toContain('<u>');
    expect(mdHwpxSummary(items).leftovers).toContain('<u>');
    expect(checkHeader(header, section)).toEqual([]);
  });
});

describe('S4 — 인용 블록', () => {
  const md = '본문\n\n> [관련 판결] 대법원 2020. 1. 1. 선고 2019다1 판결\n> 인용 첫 문장이다.\n>\n> 인용 둘째 문장이다.\n\n본문 뒤';
  it('인용 문단 줄간격 180·intent 0·글자 11pt 휴먼고딕, 제목줄만 굵게, leftovers 에 > 없음', () => {
    const { header, section, items } = doc(md, { quote: true });
    const q = paraOf(section, '인용 첫');
    const pr = /<hh:paraPr id="(\d+)"[\s\S]*?<\/hh:paraPr>/g;
    const qpp = [...header.matchAll(pr)].find((m) => Number(m[1]) === q.pp)![0];
    expect(qpp.match(/lineSpacing type="PERCENT" value="180"/g)).toHaveLength(2);
    const m = paraMargins(header, q.pp);
    expect(m.case.intent).toBe(0);
    expect(m.case.left).toBe(1650);
    const c = getItem(header, CHAR, runOf(section, '인용 첫 문장이다.'));
    expect(c).toMatch(/height="1100"/);
    expect(c).not.toContain('<hh:bold/>');
    expect(getItem(header, CHAR, runOf(section, '\\[관련 판결\\] 대법원 2020. 1. 1. 선고 2019다1 판결'))).toContain('<hh:bold/>');
    expect(header).toContain('face="휴먼고딕"');
    // 인용 안 빈 줄도 인용 서식, 인용 문단 4개 모두 같은 문단 모양
    expect(paras(section).filter((p) => p.pp === q.pp)).toHaveLength(4);
    expect(mdHwpxSummary(items, { quote: true }).leftovers).not.toContain('> ');
    expect(checkHeader(header, section)).toEqual([]);
  });
  it('끄면 > 는 leftovers 로 보고된다(기존 동작)', () => {
    expect(mdHwpxSummary(parseMarkdown(md)).leftovers).toContain('> ');
  });
});

describe('세 조각을 함께 켜고 hwpx 로 묶기', () => {
  it('mdToHwpx 가 header 불변식을 지킨 파일을 낸다', async () => {
    const md = '# 제목\n\n○ **강조** 문장\n\n> [관련 판결] 서울행정법원 2024. 1. 1. 선고 2023구합1 판결\n> 인용\n\n| 가 | 나 |\n|---|---|\n| 1 | 2 |';
    const bytes = await mdToHwpx(md, { features: { indent: true, underline: true, quote: true } });
    const z = await JSZip.loadAsync(bytes);
    const header = await z.file('Contents/header.xml')!.async('string');
    const section = await z.file('Contents/section0.xml')!.async('string');
    expect(checkHeader(header, section)).toEqual([]);
    expect(header).toContain('face="휴먼고딕"');
  });
});
