import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mdSectionXml, parseMarkdown, presetHeader } from '@/lib/md-hwpx';

// 기본 출력 고정 — 편집기술 조각(S1~S13)은 전부 선택값이다. 기본 출력이 한 글자라도 바뀌면
// 파이썬 쌍둥이(generate_hwpx.py)와 어긋나 루브릭 parity 가 깨진다. 기본을 바꿀 때는 쌍둥이·루브릭을 같이 고치고 이 값을 갱신한다.
const GOLDEN_MD = [
  '# 검토 보고',
  '',
  '## Ⅰ. 개요',
  '',
  '본문 문장에 **굵은 글씨**와 대법원 2017. 12. 22. 선고 2016다202947 판결이 있다.',
  '',
  '## 1. 수신 경위',
  '',
  '- 첫 항목',
  '- ① 번호 항목',
  '1. 순서 목록',
  '',
  '### 가. 쟁점',
  '',
  '> 인용 문장',
  '',
  '| 구분 | 내용 | 금액 |',
  '|---|:---:|---:|',
  '| 가 | **나** | 1,000 |',
  '| 다 | 라<br>마 | 2,000 |',
  '',
  '○ 기호 문단',
  '',
  '2026. 11. 19.',
  '',
  '노무법인 ○○',
].join('\n');

const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

describe('md-hwpx 기본 출력 고정', () => {
  it.each([
    ['internal', 'HDR_INTERNAL', 'SEC_INTERNAL'],
    ['tribunal', 'HDR_TRIBUNAL', 'SEC_TRIBUNAL'],
  ] as const)('%s', (preset, h, s) => {
    const items = parseMarkdown(GOLDEN_MD);
    expect({ [h]: sha(presetHeader(preset)), [s]: sha(mdSectionXml(items, { preset })) }).toEqual(EXPECT[preset]);
  });
});

const EXPECT: Record<string, Record<string, string>> = {
  internal: { HDR_INTERNAL: '1749e0d22a548f39', SEC_INTERNAL: '6846e63d29696023' },
  tribunal: { HDR_TRIBUNAL: 'acb2894f61fe0334', SEC_TRIBUNAL: 'f4d85ad1937fae3c' },
};
