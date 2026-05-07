/**
 * NIM Reranker — NVIDIA build.nvidia.com hosted llama-3.2-nv-rerankqa-1b-v2
 * 1분 40회 무료 한도. Retrieval top 16 → rerank → top 5 만 LLM context로.
 *
 * env: NVIDIA_NIM_KEY, NIM_RERANK_ENABLED (= "true" 활성)
 * 호출 실패 또는 timeout 시 입력 그대로 반환 (fail-safe).
 */
const NIM_ENDPOINT =
  'https://ai.api.nvidia.com/v1/retrieval/nvidia/llama-3_2-nv-rerankqa-1b-v2/reranking';
const NIM_MODEL = 'nvidia/llama-3.2-nv-rerankqa-1b-v2';
const NIM_TIMEOUT_MS = 3000;

export type Rerankable = { id: number | string; text: string };

export async function rerankPassages<T extends Rerankable>(
  query: string,
  passages: T[],
  topN: number
): Promise<T[]> {
  if (process.env.NIM_RERANK_ENABLED !== 'true') return passages.slice(0, topN);
  if (passages.length <= topN) return passages;
  const apiKey = process.env.NVIDIA_NIM_KEY;
  if (!apiKey) return passages.slice(0, topN);

  try {
    const resp = await fetch(NIM_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: NIM_MODEL,
        query: { text: query },
        passages: passages.map((p) => ({ text: p.text.slice(0, 1000) })),
      }),
      signal: AbortSignal.timeout(NIM_TIMEOUT_MS),
    });
    if (!resp.ok) {
      console.warn('[rerank] NIM HTTP', resp.status);
      return passages.slice(0, topN);
    }
    const data = (await resp.json()) as { rankings?: { index: number; logit: number }[] };
    const rankings = data.rankings;
    if (!Array.isArray(rankings) || rankings.length === 0) return passages.slice(0, topN);
    // logit 내림차순 정렬, top N 인덱스 → 원래 passage 매핑
    const reranked = rankings
      .slice()
      .sort((a, b) => b.logit - a.logit)
      .slice(0, topN)
      .map((r) => passages[r.index])
      .filter((p): p is T => p !== undefined);
    console.log('[rerank] NIM ok', { input: passages.length, output: reranked.length });
    return reranked.length > 0 ? reranked : passages.slice(0, topN);
  } catch (e) {
    console.warn('[rerank] NIM error', { msg: (e as Error)?.message });
    return passages.slice(0, topN);
  }
}
