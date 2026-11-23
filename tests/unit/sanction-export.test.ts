import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { SANCTION_FONTS, exportSelection, selectable, selectionHwpxMd } from '@/lib/sanction-export';

// 합성 값 — 실제 사건이 아니다
const pass = {
  id: 'harass:가|1', court: '서울행정법원', case_number: '2099구합1', decided_on: '2099-01-09', type: 'harass', disposition: '정직 3월',
  sanction: '적정', sanction_level: '중징계', block_status: 'pass', block_body: '원고는 팀장으로서 부하 직원 <A>에게 폭언 & 욕설을 반복하였다.\n(중략)\n이 사건 정직 처분이 과중하다고 볼 수 없다.', long_text: null, quote: 'x',
};
const long = {
  id: 'attend:가|2', court: '대전지방법원', case_number: '2099구합2', decided_on: '2099-02-01', type: 'attend', disposition: '해고',
  sanction: '과중', block_status: 'long_judgment', block_body: null, long_text: '다음과 같은 사정들, 즉 ① 결근 일수가 적은 점, ② 반성한 점 등을 종합하면 이 사건 해고는 과중하다.', quote: 'y',
};
const failRow = { ...pass, id: 'harass:가|3', case_number: '2099구합3', block_status: 'fail', block_body: null };

async function sectionText(bytes: Uint8Array) {
  const z = await JSZip.loadAsync(bytes);
  const s = await z.file('Contents/section0.xml')!.async('string');
  const header = await z.file('Contents/header.xml')!.async('string');
  const text = [...s.matchAll(/<hp:p [^>]*>([\s\S]*?)<\/hp:p>/g)]
    .map((p) => [...p[1].matchAll(/<hp:t>([^<]*)<\/hp:t>/g)].map((t) => t[1]).join(''))
    .map((t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  return { text, header };
}

describe('양정 블록 골라 내려받기', () => {
  it('고를 수 있는 것 = 검수 통과 블록과 긴 판단(원문 전체)뿐', () => {
    expect(selectable(pass)).toBe(true);
    expect(selectable(long)).toBe(true);
    expect(selectable(failRow)).toBe(false);
  });

  it('hwpx 원고: 고른 순서대로, 머리줄 + 블록 원문 줄을 모두 인용(>)으로, 긴 판단은 안내 문단 뒤에 원문 전체', () => {
    const md = selectionHwpxMd([long, pass]);
    const lines = md.split('\n');
    expect(lines.indexOf('> [관련 판결] 대전지방법원 2099. 2. 1. 선고 2099구합2 판결(해고)')).toBeLessThan(lines.indexOf('> [관련 판결] 서울행정법원 2099. 1. 9. 선고 2099구합1 판결(정직 3월)'));
    for (const l of pass.block_body!.split('\n')) expect(lines).toContain(`> ${l}`);
    expect(lines).toContain(`> ${long.long_text}`);
    expect(md).toMatch(/※ .*원문 전체/);
  });

  it('hwpx: 판결과 판결 사이에 빈 문단이 하나 있다(블록이 붙어 보이지 않게)', async () => {
    const { text } = await sectionText((await exportSelection([pass, { ...pass, id: 'x', case_number: '2099구합9' }], 'hwpx')).bytes!);
    const second = text.findIndex((t) => t.includes('2099구합9'));
    expect(text[second - 1]).toBe('');
    expect(text[second - 2]).toBe(pass.block_body!.split('\n').at(-1));
  });

  it('hwpx: 판결 원문 글자가 한 글자도 바뀌지 않는다(< & 포함), 정본 기본 글꼴은 휴먼고딕', async () => {
    const out = await exportSelection([pass, long], 'hwpx', { font: 'canon' });
    const { text, header } = await sectionText(out.bytes!);
    for (const l of pass.block_body!.split('\n')) expect(text).toContain(l);
    expect(text).toContain(long.long_text);
    expect(header).toContain('face="휴먼고딕"');
    expect(out.filename).toMatch(/\.hwpx$/);
  });

  it('hwpx 글꼴 선택 — 휴먼명조·함초롬바탕·맑은 고딕', async () => {
    expect(SANCTION_FONTS.map((f) => f.face)).toEqual(['휴먼고딕', '휴먼명조', '함초롬바탕', '맑은 고딕']);
    for (const f of SANCTION_FONTS.slice(1)) {
      const { header } = await sectionText((await exportSelection([pass], 'hwpx', { font: f.id })).bytes!);
      expect(header, f.id).toContain(`face="${f.face}"`);
    }
  });

  it('md·jsonl·ai 는 사이트 도구(MCP)와 같은 형식 — 고른 순서, 고를 수 없는 행은 빠진다', async () => {
    const md = (await exportSelection([pass, long, failRow], 'md')).text!;
    expect(md.indexOf('2099구합1')).toBeLessThan(md.indexOf('2099구합2'));
    expect(md).not.toContain('2099구합3');
    const jl = (await exportSelection([long, pass], 'jsonl')).text!.trim().split('\n').map((l) => JSON.parse(l));
    expect(jl.map((r) => r.case_number)).toEqual(['2099구합2', '2099구합1']);
    expect(jl[1].sanction_level).toBe('중징계');
    const ai = (await exportSelection([pass], 'ai')).text!;
    expect(ai).toContain(pass.block_body!.split('\n')[0]);
    // 긴 판단은 검수 전 발췌(quote)가 아니라 판단 원문 전체(long_text)를 싣는다
    const aiLong = (await exportSelection([long], 'ai')).text!;
    expect(aiLong).toContain(`<발췌>${long.long_text}</발췌>`);
  });

  it('하나도 안 고르면 오류', async () => {
    await expect(exportSelection([failRow], 'md')).rejects.toThrow();
  });
});
