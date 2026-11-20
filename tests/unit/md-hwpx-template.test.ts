import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { mdToHwpx } from '@/lib/md-hwpx';
import { checkHeader } from '@/lib/md-hwpx/header-check';
import { cleanFillBrush, mdToHwpxWithTemplate, templateRoles } from '@/lib/md-hwpx/template';

// S13 템플릿 모드(T1·T4·T5) — 양식 header 는 그대로 두고 끝에 덧붙이기만, 역할은 샘플 글자로, 미리보기는 새로
const items = (h: string, c: string, tag: string) => [...(new RegExp(`<hh:${c}\\b[^>]*>([\\s\\S]*?)</hh:${c}>`).exec(h)?.[1] ?? '').matchAll(new RegExp(`<hh:${tag}\\s[\\s\\S]*?</hh:${tag}>`, 'g'))].map((m) => m[0]);

/** 합성 양식: 샘플 문단을 다른 (문단, 글자) 모양으로, 빈 채우기·한글 칸에만 글꼴 하나 더, 여백 30mm, 미리보기 그림 */
async function makeTemplate() {
  const z = await JSZip.loadAsync(await mdToHwpx('# 양식 제목\n\n양식 본문 예시 문장이다.\n\n다른 본문.\n\n다른 본문 둘.'));
  let h = await z.file('Contents/header.xml')!.async('string');
  h = h.replace(/(<hh:borderFill id="1"[^>]*>[\s\S]*?)(<\/hh:borderFill>)/, '$1<hc:fillBrush><hc:winBrush faceColor="none" hatchColor="#999999" alpha="0"/></hc:fillBrush>$2');
  h = h.replace(/(<hh:fontface lang="HANGUL" fontCnt=")(\d+)("[^>]*>)([\s\S]*?)(<\/hh:fontface>)/, (_, a, n, b, inner, c) => `${a}${Number(n) + 1}${b}${inner}<hh:font id="${n}" face="양식전용체" type="TTF" isEmbedded="0"/>${c}`);
  let s = await z.file('Contents/section0.xml')!.async('string');
  s = s.replace(/paraPrIDRef="20"([^>]*>)<hp:run charPrIDRef="7"><hp:t>(\s*)양식 본문 예시/, 'paraPrIDRef="26"$1<hp:run charPrIDRef="12"><hp:t>$2양식 본문 예시');
  s = s.replace(/(<hp:margin\b[^>]*\b)left="\d+"/, '$1left="8504"');
  z.file('Contents/header.xml', h);
  z.file('Contents/section0.xml', s);
  z.file('Preview/PrvImage.png', new Uint8Array([1, 2, 3, 4]));
  z.file('Preview/PrvText.txt', '사건 문서 첫 쪽');
  return { bytes: await z.generateAsync({ type: 'uint8array' }), header: h, section: s };
}

const MD = '# 새 문서\n\n새 본문 첫 문장.\n\n**굵은 줄**\n\n| 가 | 나 |\n|---|---|\n| 1 | 2 |';

describe('S13 — 템플릿 모드', () => {
  it('양식 header 항목은 순서·내용 그대로 앞에 남고, 우리 모양은 끝에 붙는다 · S0 통과', async () => {
    const t = await makeTemplate();
    const out = await JSZip.loadAsync(await mdToHwpxWithTemplate(MD, t.bytes, { samples: { body: '양식 본문 예시' } }));
    const h = await out.file('Contents/header.xml')!.async('string');
    const s = await out.file('Contents/section0.xml')!.async('string');
    const clean = cleanFillBrush(t.header);
    for (const [c, tag] of [['charProperties', 'charPr'], ['paraProperties', 'paraPr'], ['borderFills', 'borderFill']]) {
      const before = items(clean, c, tag);
      expect(items(h, c, tag).slice(0, before.length), tag).toEqual(before);
    }
    expect(h).toContain('face="양식전용체"');
    expect(checkHeader(h, s)).toEqual([]);
    // 쪽 설정은 양식 것
    expect(s).toMatch(/<hp:margin\b[^>]*\bleft="8504"/);
  });

  it('역할: 본문 문단은 샘플 문단의 (문단, 글자) 모양, 샘플이 없으면 가장 많이 쓴 쌍', async () => {
    const t = await makeTemplate();
    expect(templateRoles(t.section, { body: '양식 본문 예시' }).body).toEqual({ para: 26, char: 12 });
    expect(templateRoles(t.section).body).toEqual({ para: 20, char: 7 });
    expect(() => templateRoles(t.section, { body: '없는 글자' })).toThrow('샘플');
    const out = await JSZip.loadAsync(await mdToHwpxWithTemplate(MD, t.bytes, { samples: { body: '양식 본문 예시' } }));
    const s = await out.file('Contents/section0.xml')!.async('string');
    expect(s).toMatch(/paraPrIDRef="26"[^>]*><hp:run charPrIDRef="12"><hp:t>\s*새 본문 첫 문장/);
  });

  it('T4·T5: 양식 미리보기 그림·글을 옮기지 않고 PrvText 는 새 본문 첫 줄, 빈 채우기 0', async () => {
    const t = await makeTemplate();
    expect(t.header).toContain('faceColor="none"');
    const out = await JSZip.loadAsync(await mdToHwpxWithTemplate(MD, t.bytes));
    expect(out.file('Preview/PrvImage.png')).toBeNull();
    expect(await out.file('Preview/PrvText.txt')!.async('string')).toBe('새 문서');
    expect(await out.file('Contents/header.xml')!.async('string')).not.toMatch(/<hc:winBrush\s[^>]*faceColor="none"/);
  });

  it('양식 없이 만든 기본 출력은 PrvText 를 넣지 않는다(지금까지와 같은 꾸러미)', async () => {
    const z = await JSZip.loadAsync(await mdToHwpx(MD));
    expect(z.file('Preview/PrvText.txt')).toBeNull();
  });
});
