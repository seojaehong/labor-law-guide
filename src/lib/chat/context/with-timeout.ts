/**
 * 검색 한 건이 느리다고 답변 전체가 끌려가면 안 된다.
 *
 * 2026-09-01 장애: search_similar_cases_hybrid 가 Supabase statement_timeout(10초)까지
 * 매달렸다가 죽었다. 상한이 없어서 DB 의 타임아웃이 그대로 사용자 대기시간이 됐고,
 * 첫 글자까지 24~29초가 걸렸다. 컨텍스트 하나를 못 얻는 것보다 답변이 늦는 게 나쁘다.
 *
 * 실패하거나 늦으면 그 컨텍스트만 버리고 나머지로 답한다.
 */
export async function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  label: string,
  fallback: T
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          console.warn(`[chat] ${label} ${ms}ms 초과 — 이 컨텍스트 없이 진행`);
          resolve(fallback);
        }, ms);
      }),
    ]);
  } catch (err) {
    console.warn(`[chat] ${label} 실패 — 이 컨텍스트 없이 진행`, {
      msg: (err as Error)?.message?.slice(0, 150),
    });
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 검색 한 건당 상한. 전체 예산 5~10초에서 검색에 배정한 몫. */
export const RETRIEVAL_TIMEOUT_MS = 2_500;
