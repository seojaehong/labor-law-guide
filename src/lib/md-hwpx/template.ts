/**
 * S13 — 템플릿 모드(편집기술사양 T1·T4·T5, 261119).
 *
 * - T1 양식 hwpx 의 header 를 그대로 두고 section 만 만든다. 우리 모양(글자·문단·테두리·글꼴)은 양식 header 끝에 덧붙이고
 *   section 의 참조 번호를 바꿔 단다(U3 — 끝에 붙이고 id = 첫 id + 개수). 역할(본문·제목)은 양식의 **샘플 문단 글자**로 찾고,
 *   샘플이 없으면 본문은 양식에서 가장 많이 쓴 (문단, 글자) 쌍을 쓴다.
 * - 쪽 크기·여백은 양식 section 의 pagePr 를 쓴다(표 폭도 그 기준으로 계산).
 * - T4 바탕 정화: 양식 꾸러미에서는 header·pagePr 만 꺼낸다 — Preview·BinData·메타는 옮기지 않는다. PrvText 는 새 본문 첫 줄.
 * - T5 빈 채우기(fillBrush 안 winBrush faceColor="none")를 지운다 — 인쇄에서 노란 형광펜으로 나온 사고(260824·260827).
 */
import JSZip from 'jszip';
import { packHwpx } from '@/lib/work-rules-report/render';
import { checkHeader } from './header-check';
import { appendItem, BORDER, CHAR, cloneChar, getItem, PARA, patchChar, patchPara } from './header-edit';
import { HEAD_SPACE, mdDocXml, parseMarkdown, type CloneLog, type MdHwpxOptions } from './index';

/** cell = 표 본문 칸, cellHead = 머리행 칸(261124). 그 글자가 든 문단·글자 모양을 표 칸에 이식한다 */
export type TemplateSamples = { body?: string; h1?: string; h2?: string; h3?: string; h4?: string; cell?: string; cellHead?: string };
export type RolePair = { para: number; char: number };

const LANGS = [
  ['hangul', 'HANGUL'],
  ['latin', 'LATIN'],
  ['hanja', 'HANJA'],
  ['japanese', 'JAPANESE'],
  ['other', 'OTHER'],
  ['symbol', 'SYMBOL'],
  ['user', 'USER'],
] as const;

// 우리 엔진의 역할 번호(index.ts 표와 같다): 본문 7/20, 굵게 12, 제목 8~11 / 21~24
const OUR_BODY: RolePair = { para: 20, char: 7 };
const OUR_BOLD = 12;
const OUR_HEAD: Record<'h1' | 'h2' | 'h3' | 'h4', RolePair> = { h1: { char: 8, para: 21 }, h2: { char: 9, para: 22 }, h3: { char: 10, para: 23 }, h4: { char: 11, para: 24 } };
// 표 칸(index.ts 와 같다): 문단 27/28/29 왼쪽·가운데·오른쪽, 글자 13/14 칸·굵은 칸, 15/16 7열 이상
const OUR_CELL_PARA = [27, 28, 29] as const;
const OUR_CELL_ALIGN = ['', 'CENTER', 'RIGHT'] as const;
const OUR_CELL_CHAR = [13, 15];
const OUR_CELL_BOLD = [14, 16];

/** T5 — 빈 채우기 제거: fillBrush 안이 faceColor="none" 인 winBrush 하나뿐이면 fillBrush 를 통째로 지운다 */
export function cleanFillBrush(header: string): string {
  return header.replace(/<hc:fillBrush>\s*<hc:winBrush\s[^>]*faceColor="none"[^>]*\/>\s*<\/hc:fillBrush>/g, '');
}

/** 양식 section 에서 역할 → (문단, 글자) 번호. 샘플 글자가 든 <hp:t> 의 바로 앞 run·문단을 쓴다 */
export function templateRoles(section: string, samples: TemplateSamples = {}): Partial<Record<keyof TemplateSamples, RolePair>> {
  const out: Partial<Record<keyof TemplateSamples, RolePair>> = {};
  for (const [role, text] of Object.entries(samples) as [keyof TemplateSamples, string | undefined][]) {
    if (!text) continue;
    const at = section.indexOf(text);
    if (at < 0) throw new Error(`양식에 샘플 글자가 없습니다(${role}): ${text}`);
    const before = section.slice(0, at);
    const char = [...before.matchAll(/<hp:run charPrIDRef="(\d+)"/g)].pop();
    const para = [...before.matchAll(/<hp:p\s[^>]*?paraPrIDRef="(\d+)"/g)].pop();
    if (!char || !para) throw new Error(`샘플 글자의 문단·글자 모양을 찾지 못했습니다(${role}): ${text}`);
    out[role] = { para: Number(para[1]), char: Number(char[1]) };
  }
  if (!out.body) {
    // 가장 많이 쓴 (문단, 글자) 쌍 — 글자가 있는 문단만 센다
    const count = new Map<string, number>();
    for (const m of section.matchAll(/<hp:p\s[^>]*?paraPrIDRef="(\d+)"[^>]*>(?:(?!<hp:p\s)[\s\S])*?<hp:run charPrIDRef="(\d+)"><hp:t>[^<]*\S/g)) {
      const k = `${m[1]}:${m[2]}`;
      count.set(k, (count.get(k) ?? 0) + 1);
    }
    const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!best) throw new Error('양식에서 본문 문단을 찾지 못했습니다. samples.body 를 주세요');
    const [p, c] = best[0].split(':').map(Number);
    out.body = { para: p, char: c };
  }
  return out;
}

type FontRow = { id: number; face: string; xml: string };
function fontRows(header: string, lang: string): FontRow[] {
  const face = new RegExp(`<hh:fontface lang="${lang}"[^>]*>([\\s\\S]*?)</hh:fontface>`).exec(header);
  if (!face) return [];
  return [...face[1].matchAll(/<hh:font\s[^>]*?id="(\d+)"[^>]*?face="([^"]*)"[^>]*?(?:\/>|>[\s\S]*?<\/hh:font>)/g)].map((m) => ({ id: Number(m[1]), face: m[2], xml: m[0] }));
}

/** 언어 칸 하나에 글꼴을 찾거나 끝에 붙인다(fontCnt 를 올린다) */
function fontIn(header: string, lang: string, src: FontRow): { header: string; id: number } {
  const rows = fontRows(header, lang);
  const hit = rows.find((r) => r.face === src.face);
  if (hit) return { header, id: hit.id };
  const id = rows.length;
  const add = src.xml.replace(/\bid="\d+"/, `id="${id}"`);
  const re = new RegExp(`(<hh:fontface lang="${lang}"[^>]*?fontCnt=")\\d+("[^>]*>)([\\s\\S]*?)(</hh:fontface>)`);
  if (!re.test(header)) throw new Error(`양식 header 에 ${lang} 글꼴 칸이 없습니다`);
  return { header: header.replace(re, (_, a, b, inner, close) => `${a}${id + 1}${b}${inner}${add}${close}`), id };
}

/** 우리 header·section 을 양식 header 로 옮긴다. roles 에 든 우리 번호는 양식 번호로 바로 바꾼다 */
export function transplant(
  ours: { header: string; section: string; clones?: CloneLog },
  tplHeader: string,
  roles: Partial<Record<keyof TemplateSamples, RolePair>>,
  opt: { tableLineSpacing?: number; tableAlign?: 'left' | 'justify' } = {},
): { header: string; section: string } {
  let h = cleanFillBrush(tplHeader);
  const fontMap = new Map<string, number>();
  const bfMap = new Map<number, number>();
  const charMap = new Map<number, number>();
  const paraMap = new Map<number, number>();

  const font = (lang: string, ourId: number) => {
    const k = `${lang}:${ourId}`;
    if (!fontMap.has(k)) {
      const src = fontRows(ours.header, lang).find((r) => r.id === ourId);
      if (!src) throw new Error(`우리 header 에 ${lang} 글꼴 ${ourId} 이 없습니다`);
      const r = fontIn(h, lang, src);
      h = r.header;
      fontMap.set(k, r.id);
    }
    return fontMap.get(k)!;
  };
  const bf = (id: number) => {
    if (!bfMap.has(id)) {
      // 우리 바탕(borderFill 2)에도 빈 채우기가 있다 — 옮기면서 지운다(기본 출력은 골든 해시 때문에 그대로 둔다)
      const r = appendItem(h, BORDER, cleanFillBrush(getItem(ours.header, BORDER, id)));
      h = r.header;
      bfMap.set(id, r.id);
    }
    return bfMap.get(id)!;
  };
  const char = (id: number): number => {
    if (!charMap.has(id)) {
      const cl = ours.clones?.char.get(id);
      if (cl) {
        // 선택값이 만든 복제(밑줄·인용 글자 등)는 양식의 역할 모양 위에서 같은 patch 로 다시 만든다
        const base = roleChar.get(cl.src) ?? char(cl.src);
        let x = patchChar(getItem(h, CHAR, base), { ...cl.patch, font: undefined });
        if (cl.patch.font !== undefined) {
          const f = cl.patch.font;
          x = x.replace(/<hh:fontRef\b[^>]*\/>/, `<hh:fontRef ${LANGS.map(([attr, lang]) => `${attr}="${font(lang, f)}"`).join(' ')}/>`);
        }
        const r = appendItem(h, CHAR, x);
        h = r.header;
        charMap.set(id, r.id);
        return r.id;
      }
      let x = getItem(ours.header, CHAR, id);
      x = x.replace(/<hh:fontRef\b[^>]*\/>/, (ref) => {
        let out = ref;
        for (const [attr, lang] of LANGS) out = out.replace(new RegExp(`\\b${attr}="(\\d+)"`), (_, v) => `${attr}="${font(lang, Number(v))}"`);
        return out;
      });
      x = x.replace(/\bborderFillIDRef="(\d+)"/, (_, v) => `borderFillIDRef="${bf(Number(v))}"`);
      const r = appendItem(h, CHAR, x);
      h = r.header;
      charMap.set(id, r.id);
    }
    return charMap.get(id)!;
  };
  const para = (id: number): number => {
    if (!paraMap.has(id)) {
      const cl = ours.clones?.para.get(id);
      if (cl) {
        const base = rolePara.get(cl.src) ?? para(cl.src);
        const r = appendItem(h, PARA, patchPara(getItem(h, PARA, base), cl.patch));
        h = r.header;
        paraMap.set(id, r.id);
        return r.id;
      }
      let x = getItem(ours.header, PARA, id);
      x = x.replace(/\btabPrIDRef="\d+"/, 'tabPrIDRef="0"').replace(/<hh:heading type="[A-Z]+" idRef="\d+" level="\d+"\/>/, '<hh:heading type="NONE" idRef="0" level="0"/>');
      x = x.replace(/(<hh:border\b[^>]*?\bborderFillIDRef=")(\d+)"/, (_, a, v) => `${a}${bf(Number(v))}"`);
      const r = appendItem(h, PARA, x);
      h = r.header;
      paraMap.set(id, r.id);
    }
    return paraMap.get(id)!;
  };

  // 역할 — 본문·굵게(양식 본문 글자에 굵게만 더함)·샘플로 준 제목
  const roleChar = new Map<number, number>();
  const rolePara = new Map<number, number>();
  if (roles.body) {
    roleChar.set(OUR_BODY.char, roles.body.char);
    rolePara.set(OUR_BODY.para, roles.body.para);
    const b = cloneChar(h, roles.body.char, { bold: true });
    h = b.header;
    roleChar.set(OUR_BOLD, b.id);
  }
  for (const k of ['h1', 'h2', 'h3', 'h4'] as const) {
    const r = roles[k];
    if (!r) continue;
    roleChar.set(OUR_HEAD[k].char, r.char);
    // 261124 — 양식 제목 문단의 앞 간격이 0 이면 복제해 앞·뒤 간격만 프리셋 값으로(표 바로 뒤 제목이 테두리에 붙던 사고).
    // 앞 간격이 이미 있으면 양식 값을 그대로. 뒤 간격은 양식이 0 일 때만 채운다. 첫 제목·쪽 나눔 제목의 앞 0 복제는 이 문단 위에서 다시 만든다
    const src = getItem(h, PARA, r.para);
    const val = (k2: 'prev' | 'next') => Number(new RegExp(`<hc:${k2} value="(-?\\d+)"`).exec(src)?.[1] ?? 0);
    const [prev, next] = HEAD_SPACE[OUR_HEAD[k].para];
    if (val('prev') > 0) rolePara.set(OUR_HEAD[k].para, r.para);
    else {
      const add = appendItem(h, PARA, patchPara(src, { pt: true, prev, ...(val('next') > 0 ? {} : { next }) }));
      h = add.header;
      rolePara.set(OUR_HEAD[k].para, add.id);
    }
  }
  // 표 역할(261124) — 이식한 칸 문단은 어절 단위(BREAK_WORD), 줄간격은 tableLineSpacing 을 명시했을 때만 그 값(아니면 양식 값)
  const cellPara = (src: number, align?: 'LEFT' | 'CENTER' | 'RIGHT') => {
    const r = appendItem(
      h,
      PARA,
      patchPara(getItem(h, PARA, src), { breakNonLatinWord: 'BREAK_WORD', ...(opt.tableLineSpacing !== undefined ? { lineSpacing: opt.tableLineSpacing } : {}), ...(align ? { align } : {}) }),
    );
    h = r.header;
    return r.id;
  };
  if (roles.cell) {
    const cell = roles.cell;
    // 27 = 양식 칸 문단(양식 정렬 그대로, features.table.align='left' 면 정렬만 LEFT), 28·29 = 복제에 정렬만 가운데·오른쪽
    const leftAlign = opt.tableAlign === 'left' ? 'LEFT' : undefined;
    OUR_CELL_PARA.forEach((p, i) => rolePara.set(p, cellPara(cell.para, OUR_CELL_ALIGN[i] || leftAlign)));
    for (const c of OUR_CELL_CHAR) roleChar.set(c, cell.char);
    const b = cloneChar(h, cell.char, { bold: true });
    h = b.header;
    for (const c of OUR_CELL_BOLD) roleChar.set(c, b.id);
  }
  const head = roles.cellHead ? { para: cellPara(roles.cellHead.para), char: roles.cellHead.char } : undefined;

  const remap = (xml: string, useRoles: boolean) =>
    xml
      .replace(/\bcharPrIDRef="(\d+)"/g, (_, v) => `charPrIDRef="${(useRoles ? roleChar.get(Number(v)) : undefined) ?? char(Number(v))}"`)
      .replace(/\bparaPrIDRef="(\d+)"/g, (_, v) => `paraPrIDRef="${(useRoles ? rolePara.get(Number(v)) : undefined) ?? para(Number(v))}"`)
      .replace(/\bborderFillIDRef="(\d+)"/g, (_, v) => `borderFillIDRef="${bf(Number(v))}"`)
      .replace(/\bstyleIDRef="\d+"/g, 'styleIDRef="0"');
  // 꼬리말(쪽번호)은 역할을 쓰지 않는다 — 제목 문단 모양을 빌려 쓰고 있어서 양식 제목 모양이 되면 안 된다
  const FOOT = /<hp:footer\b[\s\S]*?<\/hp:footer>/g;
  const parts = ours.section.split(FOOT);
  const feet = ours.section.match(FOOT) ?? [];
  let section = parts.map((p, i) => remap(p, true) + (feet[i] !== undefined ? remap(feet[i], false) : '')).join('');
  // 머리행 칸(tc header="1")은 문단·글자를 양식 머리 칸 모양으로. 칸 테두리·음영(borderFill)은 우리 것 그대로
  if (head)
    section = section.replace(/<hp:tc\b[^>]*\bheader="1"[\s\S]*?<\/hp:tc>/g, (tc) =>
      tc.replace(/\bcharPrIDRef="\d+"/g, `charPrIDRef="${head.char}"`).replace(/\bparaPrIDRef="\d+"/g, `paraPrIDRef="${head.para}"`),
    );
  return { header: h, section };
}

export interface TemplateOptions extends MdHwpxOptions {
  samples?: TemplateSamples;
}

/** 양식 hwpx + md → hwpx. 양식 header 는 그대로(끝에 덧붙인 항목·빈 채우기 제거만), 쪽 설정은 양식 pagePr */
export async function mdToHwpxWithTemplate(md: string, template: Uint8Array, opts: TemplateOptions = {}): Promise<Uint8Array> {
  const z = await JSZip.loadAsync(template);
  const tplHeader = await z.file('Contents/header.xml')?.async('string');
  const tplSection = await z.file('Contents/section0.xml')?.async('string');
  if (!tplHeader || !tplSection) throw new Error('양식 hwpx 에 header.xml·section0.xml 이 없습니다');
  const pagePr = /<hp:pagePr\b[\s\S]*?<\/hp:pagePr>/.exec(tplSection)?.[0];
  const items = parseMarkdown(md, opts);
  const ours = mdDocXml(items, { ...opts, pagePr });
  const { header, section } = transplant(ours, tplHeader, templateRoles(tplSection, opts.samples), { tableLineSpacing: opts.tableLineSpacing, tableAlign: opts.features?.table?.align });
  const issues = checkHeader(header, section);
  if (issues.length) throw new Error(`hwpx header 불변식 위반: ${issues.map((x) => x.message).join(' / ')}`);
  const title = items.find((x) => x.kind === 'h1');
  const first = items.find((x) => 'text' in x && x.text.trim());
  const prvText = first && 'text' in first ? first.text.replace(/\*\*/g, '').trim() : '';
  return packHwpx(header, section, title && 'text' in title ? title.text : '', ours.bins, { prvText });
}
