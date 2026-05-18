import type {
  Content,
  FunctionDeclarationsTool,
  Part,
} from '@google-cloud/vertexai';
import { TOOLS } from './tools/definitions';
import { scrubFakeUrls } from './scrub-urls';
import { getGenerativeModel } from '../vertex/client';

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

export async function streamRound(
  controller: ReadableStreamDefaultController<Uint8Array>,
  msgs: unknown[],
  withTools: boolean,
  encoder: TextEncoder,
  // decoder parameter kept for API compatibility (unused in Vertex path)
  _decoder?: TextDecoder
): Promise<{ content: string; toolCalls: ToolCallAcc[] }> {
  const { systemInstruction, contents } = extractSystemAndContents(msgs);

  // Build per-request model with systemInstruction (cannot set on cached model instance)
  const vertex = getGenerativeModel('gemini-2.5-flash-preview-04-17');

  const requestBody: Parameters<typeof vertex.generateContentStream>[0] = {
    contents,
    ...(systemInstruction ? { systemInstruction } : {}),
    ...(withTools ? { tools: toVertexTools() } : {}),
  };

  const result = await vertex.generateContentStream(requestBody);

  let content = '';
  const toolCallsMap: Record<number, ToolCallAcc> = {};

  let tcIdx = 0;
  for await (const chunk of result.stream) {
    const parts = chunk.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if ('text' in part && part.text) {
        const scrubbed = scrubFakeUrls(part.text);
        content += scrubbed;
        if (scrubbed) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: scrubbed })}\n\n`));
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

  return { content, toolCalls: Object.values(toolCallsMap) };
}
