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
  // 261124 — 세로(portrait)를 지정해도 기본과 같은 구역
  it.each(['internal', 'tribunal'] as const)('%s — orientation portrait = 기본', (preset) => {
    const items = parseMarkdown(GOLDEN_MD);
    expect(sha(mdSectionXml(items, { preset, orientation: 'portrait' }))).toBe(Object.values(EXPECT[preset])[1]);
  });
});

const EXPECT: Record<string, Record<string, string>> = {
  // 261123 SEC 갱신 — 쪽번호 꼬리말을 secPr subList 에서 첫 문단 <hp:ctrl><hp:footer> 로 옮겼다(한글이 종전 자리를 읽지 않음).
  // header 는 그대로. 파이썬 쌍둥이(generate_hwpx.py)는 261120 동결이라 따라 고치지 않는다(/한글변환 §2-0)
  // 261124 HDR·SEC 갱신 — 표 칸 문단 27~29 를 BREAK_WORD(어절 단위)·줄간격 150 으로(종전 KEEP_WORD·130). SEC 는 표 행 높이 추정만 바뀐다.
  // 용지 방향(orientation) 추가는 기본 출력을 바꾸지 않았다(방향만 넣은 단계에서 종전 해시 그대로 통과).
  // 커밋 d621904 에서는 tableLineSpacing 130 을 주면 261123 구역 해시 그대로였다(구역 차이 = 표 행 높이 추정뿐).
  // 261124 2차 HDR·SEC 갱신 — 본문·제목 문단 20~26 도 BREAK_WORD, 제목 21~24 앞·뒤 간격(16/6·12/3·8/0·6/0pt),
  // 꼬리말 전용 문단 30(종전 21 복제), 문서 첫 제목·쪽 나눔 제목은 앞 간격 0 복제(md-hwpx-heading-space)
  internal: { HDR_INTERNAL: '3e410b6f267b5f35', SEC_INTERNAL: '644d9385bfb90eef' },
  tribunal: { HDR_TRIBUNAL: '0c55d9f41f743bde', SEC_TRIBUNAL: 'c6e377690c07ac3d' },
};
