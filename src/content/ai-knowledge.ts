// AI 챗봇 지식 베이스 (예상질문 DB는 Supabase faq 테이블 19,781건으로 이전 완료)
// SYSTEM_PROMPT는 4개 의미 단위 모듈로 분할 (system-prompts/*).

import { SCOPE_PROMPT } from './system-prompts/scope';
import { SITUATIONS_PROMPT } from './system-prompts/situations';
import { ANSWER_STYLE_PROMPT } from './system-prompts/answer-style';
import { LEGAL_KNOWLEDGE_PROMPT } from './system-prompts/legal-knowledge';

export const SYSTEM_PROMPT = [
  SCOPE_PROMPT,
  SITUATIONS_PROMPT,
  ANSWER_STYLE_PROMPT,
  LEGAL_KNOWLEDGE_PROMPT,
].join('\n\n');
