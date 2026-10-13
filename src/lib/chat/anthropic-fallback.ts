import Anthropic from '@anthropic-ai/sdk';
import { scrubFakeUrls } from './scrub-urls';
import type { ToolCallAcc } from './stream-round';

// Vertex 장애 시 챗을 살리기 위한 2순위 프로바이더.
//
// 배경 (2026-08-18 장애): /api/chat 가 Vertex 단독이라, 사용하던 프리뷰 모델이
// 회수(404)되자 챗 전체가 즉시 중단됐다. 폴백이 하나만 있었어도 막을 수 있었다.
//
// 설계 — 의도적으로 '텍스트 전용'이다:
//   route.ts 는 계산형 질문(퇴직금·통상임금·최저임금 등)에만 withTools=true 를 준다.
//   일반 법률 Q&A는 이미 systemPrompt 에 FAQ·판례 컨텍스트가 주입돼 있어
//   tool 없이도 정상 답변이 나온다. 따라서 tool 변환 없이도 대다수 트래픽을 그대로 커버하고,
//   계산형 질문은 계산기 없이 답하게 되어 품질이 낮아지지만 '전면 실패'보다는 낫다.
//   완전한 tool 패리티는 이 폴백의 목표가 아니다.

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

let cached: Anthropic | null = null;
function getClient(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
  cached = new Anthropic({ apiKey });
  return cached;
}

export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

type AnthropicMsg = { role: 'user' | 'assistant'; content: string };

/**
 * route.ts 가 만드는 OpenAI 형식 메시지를 Anthropic Messages 형식으로 변환한다.
 * tool 관련 메시지는 tool_use/tool_result 블록으로 옮기지 않고 텍스트로 눌러 담는다
 * (위 '텍스트 전용' 설계 참고).
 */
export function toAnthropicMessages(msgs: unknown[]): {
  system: string | undefined;
  messages: AnthropicMsg[];
} {
  let system: string | undefined;
  const out: AnthropicMsg[] = [];

  for (const raw of msgs) {
    const m = raw as {
      role?: string;
      content?: unknown;
      tool_calls?: unknown[];
    };
    const text = typeof m.content === 'string' ? m.content : '';

    if (m.role === 'system') {
      system = system ? `${system}\n\n${text}` : text;
      continue;
    }
    if (m.role === 'user') {
      if (text.trim()) out.push({ role: 'user', content: text });
      continue;
    }
    if (m.role === 'assistant') {
      // tool_calls 만 있고 본문이 없는 assistant 턴은 폴백에선 의미가 없으므로 버린다
      if (text.trim()) out.push({ role: 'assistant', content: text });
      continue;
    }
    if (m.role === 'tool') {
      // 도구 결과는 사용자 턴의 참고자료로 전달
      if (text.trim()) {
        out.push({ role: 'user', content: `[도구 실행 결과]\n${text}` });
      }
      continue;
    }
  }

  // Anthropic 은 첫 메시지가 user 여야 하고, 마지막이 assistant 면 이어쓰기가 된다.
  while (out.length && out[0].role !== 'user') out.shift();
  if (!out.length) out.push({ role: 'user', content: '위 맥락을 바탕으로 답변해주세요.' });

  // 연속 동일 role 은 합쳐서 보낸다 (API는 허용하지만 의도를 명확히)
  const merged: AnthropicMsg[] = [];
  for (const m of out) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${m.content}`;
    else merged.push({ ...m });
  }
  return { system, messages: merged };
}

/**
 * Vertex 와 동일한 SSE 프레임(`data: {"content": "..."}`)을 그대로 내보낸다.
 * 반환 형태도 streamRound 와 동일하게 맞춘다(toolCalls 는 항상 빈 배열).
 */
export async function streamAnthropicRound(
  controller: ReadableStreamDefaultController<Uint8Array>,
  msgs: unknown[],
  encoder: TextEncoder
): Promise<{ content: string; toolCalls: ToolCallAcc[] }> {
  const { system, messages } = toAnthropicMessages(msgs);
  const client = getClient();

  const stream = client.messages.stream({
    model: MODEL,
    // Vertex 쪽 상한과 같은 값으로 맞춘다. 폴백이라고 답변 길이가 달라지면
    // 사용자가 체감하는 응답 속도가 요청마다 널뛴다.
    max_tokens: 1200,
    ...(system ? { system } : {}),
    messages,
  });

  let content = '';
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      const scrubbed = scrubFakeUrls(event.delta.text);
      if (scrubbed) {
        content += scrubbed;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: scrubbed })}\n\n`));
      }
    }
  }

  return { content, toolCalls: [] };
}
