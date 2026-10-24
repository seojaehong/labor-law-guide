// 스캔 쪽 한 장 → 글자. 서버 라우트와 정확도 실측 시험이 같은 호출을 쓴다(모델·지시·노력 수준이 어긋나지 않게).
import Anthropic from '@anthropic-ai/sdk';
import { looksRead, OCR_SYSTEM } from './ocr-check';

export const OCR_MODELS = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5' } as const;
export type OcrModel = keyof typeof OCR_MODELS;
// 기본값은 실측 시험용 — 라우트는 남은 시간 예산으로 따로 준다
const CALL_TIMEOUT_MS = 25_000;
export type ReadOptions = { timeoutMs?: number; maxRetries?: number };

export async function readPage(client: Anthropic, model: OcrModel, mediaType: string, data: string, opts: ReadOptions = {}): Promise<{ text: string; ok: boolean; usage: { input: number; output: number } }> {
  const res = await client.messages.create({
    model: OCR_MODELS[model],
    max_tokens: 8000,
    // 옮겨 적기라 깊이 생각할 일이 아니다 — 생각은 켜 두되(소넷 5.5 는 끌 수 없다) 노력을 낮춘다
    output_config: { effort: 'low' },
    system: OCR_SYSTEM,
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/jpeg', data } },
      { type: 'text', text: '이 쪽의 글자를 규칙대로 옮겨 주세요.' },
    ] }],
  }, { timeout: opts.timeoutMs ?? CALL_TIMEOUT_MS, maxRetries: opts.maxRetries ?? 1 });
  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
  return { text, ok: looksRead(text, res.stop_reason), usage: { input: res.usage?.input_tokens ?? 0, output: res.usage?.output_tokens ?? 0 } };
}
