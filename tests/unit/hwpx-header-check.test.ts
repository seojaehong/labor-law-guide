import { describe, expect, it } from 'vitest';
import { checkHeader } from '@/lib/md-hwpx/header-check';
import { HEADER_XML } from '@/lib/contract-write/hwpx-header';
import { mdSectionXml, parseMarkdown, presetHeader } from '@/lib/md-hwpx';

// S0 — header 불변식(편집기술사양 U3·U4·U5). 한글은 charPr·paraPr·borderFill 을 id 가 아니라 등장 순서로 읽는다.
const mini = (chars: string, cnt = 2) =>
  `<hh:head><hh:refList><hh:borderFills itemCnt="1"><hh:borderFill id="1"/></hh:borderFills>` +
  `<hh:charProperties itemCnt="${cnt}">${chars}</hh:charProperties>` +
  `<hh:paraProperties itemCnt="1"><hh:paraPr id="0"/></hh:paraProperties></hh:refList></hh:head>`;

describe('checkHeader — S0 header 불변식', () => {
  it('엔진 바탕 header 와 프리셋 header 는 통과한다', () => {
    expect(checkHeader(HEADER_XML)).toEqual([]);
    expect(checkHeader(presetHeader('internal'))).toEqual([]);
    expect(checkHeader(presetHeader('tribunal'))).toEqual([]);
  });

  it('중간에 끼운 charPr 가 있으면 ids≠순서 오류', () => {
    const errs = checkHeader(mini('<hh:charPr id="0"/><hh:charPr id="2"/><hh:charPr id="1"/>', 3));
    expect(errs.map((e) => e.code)).toContain('ID_ORDER');
    expect(errs.find((e) => e.code === 'ID_ORDER')!.container).toBe('charProperties');
  });

  it('itemCnt 가 실제 개수와 다르면 오류', () => {
    const errs = checkHeader(mini('<hh:charPr id="0"/><hh:charPr id="1"/>', 3));
    expect(errs.map((e) => e.code)).toEqual(['ITEM_CNT']);
  });

  it('section 이 범위 밖 id 를 가리키면 오류(한글은 오류 없이 0번으로 떨어뜨린다)', () => {
    const header = mini('<hh:charPr id="0"/><hh:charPr id="1"/>');
    const section = '<hp:p paraPrIDRef="0"><hp:run charPrIDRef="5"/></hp:p><hp:tc borderFillIDRef="2"/>';
    const codes = checkHeader(header, section).map((e) => `${e.code}:${e.container}`);
    expect(codes).toEqual(['REF_RANGE:charProperties', 'REF_RANGE:borderFills']);
  });

  it('엔진이 만든 section 은 범위 안 id 만 쓴다', () => {
    const md = '# 제목\n\n## 1. 개요\n\n- 항목 **굵게**\n\n| 가 | 나 |\n|---|---|\n| 1 | 2 |\n';
    for (const preset of ['internal', 'tribunal'] as const) {
      expect(checkHeader(presetHeader(preset), mdSectionXml(parseMarkdown(md), { preset }))).toEqual([]);
    }
  });
});
