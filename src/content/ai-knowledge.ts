// /ai 「근거 자료 찾기」 자료 요약 프롬프트 (예상질문 DB는 Supabase faq 테이블로 이전 완료)
//
// 261112 — 종전 4개 모듈 중 상황별 가이드(situations)와 핵심 법률 지식(legal-knowledge)을 뺐다.
// 둘 다 노란봉투법(원청 교섭 대응) 중심의 상담 지침과 내장 지식이었다. 요약은 화면에 보인 자료만
// 근거로 써야 하므로, 화면에 없는 내장 지식은 넣지 않는다. 그 내용은 /guide·/manual 등 주제 페이지에 있다.

import { SCOPE_PROMPT } from './system-prompts/scope';
import { ANSWER_STYLE_PROMPT } from './system-prompts/answer-style';

export const SYSTEM_PROMPT = [SCOPE_PROMPT, ANSWER_STYLE_PROMPT].join('\n\n');
