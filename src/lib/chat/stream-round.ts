import { TOOLS } from './tools/definitions';
import { scrubFakeUrls } from './scrub-urls';

export type ToolCallAcc = { id: string; name: string; arguments: string };

export async function callLLM(apiKey: string, msgs: unknown[], withTools: boolean) {
  const reqBody: Record<string, unknown> = {
    model: 'gemini-2.5-flash',
    messages: msgs,
    max_completion_tokens: 4096,
    temperature: 0.3,
    stream: true,
  };
  if (withTools) {
    reqBody.tools = TOOLS;
    reqBody.tool_choice = 'auto';
  }
  return fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(reqBody),
    signal: AbortSignal.timeout(50000),
  });
}

export async function streamRound(
  apiKey: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  msgs: unknown[],
  withTools: boolean,
  encoder: TextEncoder,
  decoder: TextDecoder
): Promise<{ content: string; toolCalls: ToolCallAcc[] }> {
  const resp = await callLLM(apiKey, msgs, withTools);
  if (!resp.ok) throw new Error(await resp.text());
  const reader = resp.body?.getReader();
  if (!reader) return { content: '', toolCalls: [] };
  let buffer = '';
  let content = '';
  const toolCallsMap: Record<number, ToolCallAcc> = {};
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const t = line.trim();
      if (!t || !t.startsWith('data: ')) continue;
      const d = t.slice(6);
      if (d === '[DONE]') continue;
      try {
        const p = JSON.parse(d);
        const delta = p.choices?.[0]?.delta;
        if (!delta) continue;
        if (delta.content) {
          const scrubbed = scrubFakeUrls(delta.content);
          content += scrubbed;
          if (scrubbed) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: scrubbed })}\n\n`));
          }
        }
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCallsMap[idx])
              toolCallsMap[idx] = { id: tc.id || `call_${idx}`, name: '', arguments: '' };
            if (tc.id) toolCallsMap[idx].id = tc.id;
            if (tc.function?.name) toolCallsMap[idx].name = tc.function.name;
            if (tc.function?.arguments) toolCallsMap[idx].arguments += tc.function.arguments;
          }
        }
      } catch {
        // skip malformed
      }
    }
  }
  return { content, toolCalls: Object.values(toolCallsMap) };
}
