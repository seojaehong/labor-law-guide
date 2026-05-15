import type { CaseCard } from './retrieval';
import { SYSTEM_PROMPT } from './prompt';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
const REQUEST_TIMEOUT_MS = 15_000;

interface StreamOptions {
  apiKey: string;
  messages: { role: string; content: string }[];
  tags: string[];
  cases: CaseCard[];
}

export function createStreamingResponse({ apiKey, messages, tags, cases }: StreamOptions): Response {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(streamController) {
      const emit = (data: Record<string, unknown>) =>
        streamController.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        const resp = await fetch(ANTHROPIC_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: ANTHROPIC_MODEL,
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            messages,
            temperature: 0.3,
            stream: true,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!resp.ok) {
          const errText = await resp.text();
          emit({ type: 'error', message: `API 오류 (${resp.status}): 잠시 후 다시 시도해 주세요.` });
          emit({ type: 'done' });
          streamController.close();
          return;
        }

        // 메타데이터 즉시 전송
        emit({ type: 'meta', tags, cases });

        // Anthropic SSE → 클라이언트 SSE 변환
        const reader = resp.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let totalChars = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6);
            if (payload === '[DONE]') continue;

            try {
              const event = JSON.parse(payload);
              if (event.type === 'content_block_delta' && event.delta?.text) {
                totalChars += event.delta.text.length;
                emit({ type: 'delta', text: event.delta.text });
              }
            } catch {
              // 파싱 실패한 청크는 무시
            }
          }
        }

        // 비정상 종료 감지
        if (totalChars < 10) {
          emit({ type: 'error', message: '응답이 비정상적으로 종료되었습니다. 다시 시도해 주세요.' });
        }
        emit({ type: 'done' });
      } catch (err) {
        clearTimeout(timeout);

        if (err instanceof DOMException && err.name === 'AbortError') {
          emit({ type: 'error', message: '응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.' });
        } else {
          const errMsg = err instanceof Error ? err.message : 'stream error';
          emit({ type: 'error', message: errMsg });
        }
        emit({ type: 'done' });
      } finally {
        streamController.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
