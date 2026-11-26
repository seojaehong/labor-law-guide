// 퇴고 체험 시험용 합성 글 — 실제 고객·사건 글을 넣지 않는다.
// 줄 나눔(CRLF·CR·U+2028·\f)·인용 줄·표 줄·서로게이트(이모지)·따옴표를 섞어 위치 계산과 엔진 동등성을 같이 본다.
import { BEFORE_AFTER, EXAMPLES } from '../../../src/app/tools/toego/copy';

export const MIXED: string[] = [
  '가상 회사는 이를 검토하였고, 도급인이 할수 있는 조치임 .\r\n결과를 가르는 것은 시간입니다.\r\n> 인용 줄은 할수 있다 그대로 둔다',
  '😀 이사장및 이사들이 할수 있는 것은\u2028제 3조 ( 가상 ) 를 보면 ,\f“ 따옴표 ” 와 ‘ 작은 ’ 따옴표\r마지막 줄...',
  '| 표 | 할수 있다 | “잠금 해제” |\n[관련 판결] 가상 법원 2026. 1. 1. 선고 판결\n# 제목 및 목차\n\t들여쓴 줄은 맞물리고, 짚어 본다',
  '𝟘𝟙 이모지 뒤 😀😀 할수 있는 것을 들여다보고, 현장의 숨결을 짚어 본다 .\r\n\r\n둘째 문단은 성공을 달성하는 자리였다.',
];

export const CORPUS: string[] = [
  ...EXAMPLES.map((e) => e.text),
  BEFORE_AFTER.before,
  BEFORE_AFTER.after,
  ...MIXED,
  '',
  '   ',
  '줄 하나뿐',
];
