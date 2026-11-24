import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import { mdToHwpx } from '@/lib/md-hwpx';
import { checkHeader } from '@/lib/md-hwpx/header-check';
import { addFont, CHAR, cloneChar, clonePara, getItem, PARA } from '@/lib/md-hwpx/header-edit';
import { mdToHwpxWithTemplate } from '@/lib/md-hwpx/template';

// 261124 — 양식 모드 표 역할(templateSamples.cell·cellHead). 가상 양식: 표 칸 본문 = 가상양식체 9pt 양쪽 정렬·줄간격 130·KEEP_WORD,
// 머리행 칸 = 가상양식체 9pt 굵게·가운데·줄간격 120. 실기관 양식 원문은 쓰지 않는다.
//
// 정한 규칙(시험으로 고정):
//  - cell 을 주면 표 칸 문단 27(왼쪽) = 양식 칸 문단(양식 정렬 그대로), 28·29 = 그 복제에 정렬만 가운데·오른쪽.
//    칸 글자 13·15 = 양식 칸 글자, 칸 안 **굵게**(14·16) = 양식 칸 글자에 굵게만 더한 복제. 7열 이상 작은 글자 구분은 양식 크기로 합쳐진다.
//  - cellHead 를 주면 머리행 칸(tc header="1")의 문단·글자 = 양식 머리 칸 모양. 안 주면 머리행은 위 cell 규칙(가운데 복제·굵게 복제).
//  - 줄간격: tableLineSpacing 을 명시하면 그 값, 아니면 양식 값.
//  - 줄 나눔: 이식한 칸 문단은 BREAK_WORD(어절 단위) — 양식이 KEEP_WORD 여도. 한글에서 KEEP_WORD 가 글자 단위로 끊긴 실렌더가 근거.
//  - 머리행 음영·표 테두리(borderFill)는 우리 것 그대로(양식 표 테두리 이식은 범위 밖).
//  - cell·cellHead 를 안 주면 종전과 바이트 동일.

async function makeTemplate() {
  const z = await JSZip.loadAsync(await mdToHwpx('# 양식 제목\n\n양식 본문 예시 문장.\n\n| 머리 예시 | 둘 |\n|---|---|\n| 칸 예시 글자 | 값 |'));
  let h = await z.file('Contents/header.xml')!.async('string');
  const f = addFont(h, '가상양식체');
  h = f.header;
  const cellChar = cloneChar(h, 7, { height: 900, font: f.id });
  h = cellChar.header;
  const headChar = cloneChar(h, 7, { height: 900, font: f.id, bold: true });
  h = headChar.header;
  const cellPara = clonePara(h, 20, { align: 'JUSTIFY', lineSpacing: 130, breakNonLatinWord: 'KEEP_WORD' });
  h = cellPara.header;
  const headPara = clonePara(h, 20, { align: 'CENTER', lineSpacing: 120, breakNonLatinWord: 'KEEP_WORD' });
  h = headPara.header;
  let s = await z.file('Contents/section0.xml')!.async('string');
  s = s.replace(/paraPrIDRef="\d+"([^>]*>)<hp:run charPrIDRef="\d+"><hp:t>머리 예시/, `paraPrIDRef="${headPara.id}"$1<hp:run charPrIDRef="${headChar.id}"><hp:t>머리 예시`);
  s = s.replace(/paraPrIDRef="\d+"([^>]*>)<hp:run charPrIDRef="\d+"><hp:t>칸 예시 글자/, `paraPrIDRef="${cellPara.id}"$1<hp:run charPrIDRef="${cellChar.id}"><hp:t>칸 예시 글자`);
  z.file('Contents/header.xml', h);
  z.file('Contents/section0.xml', s);
  return { bytes: await z.generateAsync({ type: 'uint8array' }), ids: { cellChar: cellChar.id, headChar: headChar.id, cellPara: cellPara.id, headPara: headPara.id } };
}

const MD = '# 새 문서\n\n새 본문.\n\n| 쟁점 | 수치 | 비고 |\n|---|:---:|---:|\n| 긴 낱말 칸 | **12** | 끝 |';
const SAMPLES = { body: '양식 본문 예시', cell: '칸 예시 글자', cellHead: '머리 예시' };

async function render(tpl: Uint8Array, opts: object) {
  const z = await JSZip.loadAsync(await mdToHwpxWithTemplate(MD, tpl, opts));
  const header = await z.file('Contents/header.xml')!.async('string');
  const section = await z.file('Contents/section0.xml')!.async('string');
  const tcs = [...section.matchAll(/<hp:tc\b[^>]*header="(\d)"[^>]*borderFillIDRef="(\d+)"[\s\S]*?<\/hp:tc>/g)].map((m) => ({
    head: m[1] === '1',
    bf: Number(m[2]),
    para: Number(/paraPrIDRef="(\d+)"/.exec(m[0])![1]),
    chars: [...m[0].matchAll(/charPrIDRef="(\d+)"/g)].map((c) => Number(c[1])),
  }));
  return { header, section, tcs };
}
const paraXml = (h: string, id: number) => getItem(h, PARA, id);
const charXml = (h: string, id: number) => getItem(h, CHAR, id);
const align = (x: string) => /horizontal="(\w+)"/.exec(x)![1];
const lsOf = (x: string) => [...x.matchAll(/lineSpacing type="PERCENT" value="(\d+)"/g)].map((m) => Number(m[1]));
const brk = (x: string) => /breakNonLatinWord="(\w+)"/.exec(x)![1];
const noId = (x: string) => x.replace(/\bid="\d+"/, '');
const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

describe('양식 모드 표 역할(cell·cellHead)', () => {
  it('표 역할을 안 주면 종전과 바이트 동일', async () => {
    const t = await makeTemplate();
    const r = await render(t.bytes, { samples: { body: SAMPLES.body } });
    // b976181(표 역할 추가 직전)에서 잰 값
    expect(sha(r.header + r.section)).toBe('d0e7d7aee9355302');
  });

  it('cell·cellHead 를 주면 칸 문단·글자가 양식 모양, 정렬 변형은 복제에 정렬만, BREAK_WORD·양식 줄간격', async () => {
    const t = await makeTemplate();
    const { header: h, section, tcs } = await render(t.bytes, { samples: SAMPLES });
    expect(checkHeader(h, section)).toEqual([]);
    const head = tcs.filter((x) => x.head);
    const body = tcs.filter((x) => !x.head);
    expect(head).toHaveLength(3);
    expect(body).toHaveLength(3);
    for (const c of head) {
      expect(c.chars.every((id) => id === t.ids.headChar)).toBe(true);
      const p = paraXml(h, c.para);
      expect(noId(p.replace(/breakNonLatinWord="\w+"/, ''))).toBe(noId(paraXml(h, t.ids.headPara).replace(/breakNonLatinWord="\w+"/, '')));
      expect(brk(p)).toBe('BREAK_WORD');
      expect(lsOf(p)).toEqual([120, 120]);
    }
    const [left, mid, right] = body;
    expect(left.chars).toEqual([t.ids.cellChar]);
    expect(align(paraXml(h, left.para))).toBe('JUSTIFY');
    expect(align(paraXml(h, mid.para))).toBe('CENTER');
    expect(align(paraXml(h, right.para))).toBe('RIGHT');
    for (const c of body) {
      const p = paraXml(h, c.para);
      expect(brk(p)).toBe('BREAK_WORD');
      expect(lsOf(p)).toEqual([130, 130]);
      // 정렬·줄 나눔만 다르고 나머지는 양식 칸 문단 그대로
      const norm = (x: string) => noId(x).replace(/horizontal="\w+"/, '').replace(/breakNonLatinWord="\w+"/, '');
      expect(norm(p)).toBe(norm(paraXml(h, t.ids.cellPara)));
    }
    // 칸 안 **12** = 양식 칸 글자 + 굵게
    const bold = charXml(h, mid.chars[0]);
    expect(bold).toContain('<hh:bold/>');
    expect(noId(bold).replace('<hh:bold/>', '')).toBe(noId(charXml(h, t.ids.cellChar)));
  });

  it('tableLineSpacing 을 명시하면 양식 줄간격보다 우선', async () => {
    const t = await makeTemplate();
    const { header: h, tcs } = await render(t.bytes, { samples: SAMPLES, tableLineSpacing: 180 });
    for (const c of tcs) expect(lsOf(paraXml(h, c.para))).toEqual([180, 180]);
  });

  it('cellHead 없이 cell 만 주면 머리행은 칸 문단의 가운데 복제·굵게 복제', async () => {
    const t = await makeTemplate();
    const { header: h, tcs } = await render(t.bytes, { samples: { body: SAMPLES.body, cell: SAMPLES.cell } });
    for (const c of tcs.filter((x) => x.head)) {
      expect(align(paraXml(h, c.para))).toBe('CENTER');
      const ch = charXml(h, c.chars[0]);
      expect(ch).toContain('<hh:bold/>');
      expect(ch).toContain('height="900"');
    }
  });

  it('머리행 음영·표 테두리(borderFill)는 우리 것 그대로', async () => {
    const t = await makeTemplate();
    const a = await render(t.bytes, { samples: { body: SAMPLES.body } });
    const b = await render(t.bytes, { samples: SAMPLES });
    const fill = (r: Awaited<ReturnType<typeof render>>, head: boolean) => getItem(r.header, { container: 'borderFills', tag: 'borderFill', base: 1 }, r.tcs.find((x) => x.head === head)!.bf);
    expect(fill(b, true)).toBe(fill(a, true));
    expect(fill(b, false)).toBe(fill(a, false));
  });

  it('없는 표 샘플 글자는 멈춘다', async () => {
    const t = await makeTemplate();
    await expect(mdToHwpxWithTemplate(MD, t.bytes, { samples: { cell: '없는 칸 글자' } })).rejects.toThrow('cell');
  });
});
