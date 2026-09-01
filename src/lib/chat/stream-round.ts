import type {
  Content,
  FunctionDeclarationsTool,
  Part,
} from '@google-cloud/vertexai';
import { TOOLS } from './tools/definitions';
import { scrubFakeUrls } from './scrub-urls';
import { getGenerativeModel } from '../vertex/client';
import { isAnthropicConfigured, streamAnthropicRound } from './anthropic-fallback';

export type ToolCallAcc = { id: string; name: string; arguments: string };

// ─── OpenAI-format tool → Vertex FunctionDeclarationsTool ───────────────────

function toVertexTools(): FunctionDeclarationsTool[] {
  return [
    {
      functionDeclarations: TOOLS.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        parameters: t.function.parameters as any,
      })),
    },
  ];
}

// ─── OpenAI-format messages → Vertex Contents ───────────────────────────────
//
// Input message shapes we receive from route.ts:
//  { role: 'system',    content: string }                           → extracted as systemInstruction
//  { role: 'user',      content: string }                           → { role:'user', parts:[{text}] }
//  { role: 'assistant', content: string|null, tool_calls?: [...] }  → { role:'model', parts:[...] }
//  { role: 'tool',      tool_call_id: string, content: string }     → { role:'function', parts:[{functionResponse}] }

export function extractSystemAndContents(msgs: unknown[]): {
  systemInstruction: string | undefined;
  contents: Content[];
} {
  let systemInstruction: string | undefined;
  const contents: Content[] = [];

  for (const raw of msgs) {
    const m = raw as Record<string, unknown>;
    const role = m.role as string;

    if (role === 'system') {
      systemInstruction = (m.content as string) || undefined;
      continue;
    }

    if (role === 'user') {
      contents.push({ role: 'user', parts: [{ text: (m.content as string) || '' }] });
      continue;
    }

    if (role === 'assistant' || role === 'model') {
      const parts: Part[] = [];
      if (m.content && typeof m.content === 'string' && m.content.trim()) {
        parts.push({ text: m.content });
      }
      // Convert OpenAI tool_calls → Vertex functionCall parts
      if (Array.isArray(m.tool_calls)) {
        for (const tc of m.tool_calls as Array<{
          id: string;
          function: { name: string; arguments: string };
        }>) {
          let args: object = {};
          try {
            args = JSON.parse(tc.function?.arguments || '{}');
          } catch {
            // ignore
          }
          parts.push({ functionCall: { name: tc.function.name, args } });
        }
      }
      if (parts.length === 0) parts.push({ text: '' });
      contents.push({ role: 'model', parts });
      continue;
    }

    if (role === 'tool' || role === 'function') {
      // tool_call_id maps to the function name via caller context; Vertex needs the function name.
      // Route.ts stores function name in the corresponding assistant tool_calls entry.
      // We extract name from tool_call_id (not ideal) or fall back to looking at the previous model turn.
      // In practice: the previous content entry (role='model') has a functionCall part with the name.
      const name = extractFunctionNameFromContext(contents, m.tool_call_id as string);
      let response: object = {};
      try {
        response = JSON.parse((m.content as string) || '{}');
      } catch {
        response = { result: m.content };
      }
      contents.push({
        role: 'function',
        parts: [{ functionResponse: { name, response } }],
      });
      continue;
    }
  }

  return { systemInstruction, contents };
}

/**
 * Walk backwards through already-converted contents to find the functionCall name
 * that matches this tool_call_id. Route.ts currently generates id as `call_${idx}`,
 * so we pick the functionCall parts from the most recent model turn in order.
 */
function extractFunctionNameFromContext(contents: Content[], toolCallId: string): string {
  // Look through previous model turns for a functionCall whose id matches
  // Since Vertex functionCall parts don't store an id, we use positional matching:
  // count how many 'function' response turns already exist, use that index.
  const functionResponseCount = contents.filter((c) => c.role === 'function').length;

  // Find the most recent model turn
  for (let i = contents.length - 1; i >= 0; i--) {
    const c = contents[i];
    if (c.role === 'model') {
      const fcParts = c.parts.filter((p) => 'functionCall' in p && p.functionCall);
      if (fcParts[functionResponseCount]) {
        const fc = (fcParts[functionResponseCount] as { functionCall: { name: string } })
          .functionCall;
        return fc.name;
      }
      break;
    }
  }

  // Fallback: extract from tool_call_id pattern "call_0" → index 0
  const idxMatch = toolCallId?.match(/(\d+)$/);
  const idx = idxMatch ? parseInt(idxMatch[1], 10) : 0;

  // Find model turn and get nth functionCall
  for (let i = contents.length - 1; i >= 0; i--) {
    const c = contents[i];
    if (c.role === 'model') {
      const fcParts = c.parts.filter((p) => 'functionCall' in p && p.functionCall);
      if (fcParts[idx]) {
        return (fcParts[idx] as { functionCall: { name: string } }).functionCall.name;
      }
      break;
    }
  }

  return 'unknown_function';
}

// ─── Main streaming function ──────────────────────────────────────────────────

/**
 * 어느 프로바이더가 답했는지와 Vertex 실패에 걸린 시간을 남긴다.
 *
 * 2026-09-01: 같은 질문의 길이만 다른 두 측정값으로 1차식을 풀어보니
 *   t = 9.53초 + 0.00474초 * 답변글자수
 * 답변을 0자로 만들어도 9.5초가 남는다. 질문·길이와 무관한 고정비용이 있다는 뜻이고,
 * 그만한 고정비용은 보통 타임아웃이나 실패 후 재시도다. Vertex 가 느리게 실패한 뒤
 * Anthropic 으로 넘어가는 것이 1순위 용의자인데, vercel logs 스트리밍이 잡히지 않아
 * 서버 밖에서는 확인할 방법이 없었다. 그래서 값을 남겨 응답에 실어 보낸다.
 */
export const lastRoundInfo: { provider: string; vertexFailMs: number } = {
  provider: 'unknown',
  vertexFailMs: 0,
};

export async function streamRound(
  controller: ReadableStreamDefaultController<Uint8Array>,
  msgs: unknown[],
  withTools: boolean,
  encoder: TextEncoder,
  // decoder parameter kept for API compatibility (unused in Vertex path)
  _decoder?: TextDecoder
): Promise<{ content: string; toolCalls: ToolCallAcc[] }> {
  const { systemInstruction, contents } = extractSystemAndContents(msgs);

  // Vertex 실패 시 Anthropic 으로 폴백한다.
  // 2026-08-18: 모델 회수(404) 한 번으로 챗 전체가 중단됐다 — 단일 프로바이더 의존 제거.
  // 클라이언트 생성(자격증명 오류)도 try 안에 둔다 — 밖에 두면 설정 오류가 폴백을 건너뛴다.
  // 스트리밍이 이미 시작된 뒤(=일부 텍스트를 내보낸 뒤)에는 폴백하지 않는다.
  // 중복 출력이 사용자에게 그대로 보이기 때문. 첫 청크 이전 실패만 폴백 대상이다.
  type VertexStream = Awaited<
    ReturnType<ReturnType<typeof getGenerativeModel>['generateContentStream']>
  >;
  let result: VertexStream;
  const vertexStart = Date.now();
  try {
    // Build per-request model with systemInstruction (cannot set on cached model instance)
    const vertex = getGenerativeModel();
    result = await vertex.generateContentStream({
      contents,
      // 챗 전용 상한. 클라이언트 기본값은 4096 인데 그건 /api/sanction 의 JSON 산출물
      // 때문에 크게 잡혀 있다. 챗 본문은 350~500자를 목표로 하므로 그만큼 줄 필요가 없고,
      // 상한이 크면 모델이 길게 쓰는 쪽으로 흐른다. 여기서만 낮춘다.
      // 1200 토큰은 한글 500자에 넉넉한 값이라 정상 답변이 잘리지 않는다.
      generationConfig: { maxOutputTokens: 1200 },
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(withTools ? { tools: toVertexTools() } : {}),
    });
  } catch (err) {
    if (!isAnthropicConfigured()) throw err;
    lastRoundInfo.provider = 'anthropic(vertex-failed)';
    lastRoundInfo.vertexFailMs = Date.now() - vertexStart;
    console.warn('[chat] Vertex 실패 → Anthropic 폴백', {
      afterMs: lastRoundInfo.vertexFailMs,
      msg: (err as Error)?.message?.slice(0, 200),
    });
    return streamAnthropicRound(controller, msgs, encoder);
  }

  let content = '';
  const toolCallsMap: Record<number, ToolCallAcc> = {};

  let tcIdx = 0;
  let emitted = false;
  try {
    for await (const chunk of result.stream) {
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if ('text' in part && part.text) {
          const scrubbed = scrubFakeUrls(part.text);
          content += scrubbed;
          if (scrubbed) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ content: scrubbed })}\n\n`)
            );
            emitted = true;
          }
        }
        if ('functionCall' in part && part.functionCall) {
          const fc = part.functionCall as { name: string; args: object };
          toolCallsMap[tcIdx] = {
            id: `call_${tcIdx}`,
            name: fc.name,
            arguments: JSON.stringify(fc.args),
          };
          tcIdx++;
        }
      }
    }
  } catch (err) {
    // 이미 사용자 화면에 텍스트가 나간 뒤면 폴백 금지 — 답변이 두 번 이어붙는다.
    if (emitted || !isAnthropicConfigured()) throw err;
    lastRoundInfo.provider = 'anthropic(stream-broke)';
    lastRoundInfo.vertexFailMs = Date.now() - vertexStart;
    console.warn('[chat] Vertex 스트림 중단 → Anthropic 폴백', {
      afterMs: lastRoundInfo.vertexFailMs,
      msg: (err as Error)?.message?.slice(0, 200),
    });
    return streamAnthropicRound(controller, msgs, encoder);
  }

  lastRoundInfo.provider = 'vertex';
  lastRoundInfo.vertexFailMs = 0;
  return { content, toolCalls: Object.values(toolCallsMap) };
}
