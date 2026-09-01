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

/**
 * FAQ 만 상한을 더 준다.
 * 2026-09-01 실측에서 search_faq_combined 가 3.6초라 2.5초 상한에 걸려 잘렸고,
 * 그 결과 faq_matched=false 인 요청이 생겼다. 속도를 얻자고 가장 중요한 컨텍스트를
 * 버리면 안 된다. 검색들은 병렬로 돌므로 전체 대기시간은 여기 4초가 상한이 된다.
 */
export const FAQ_TIMEOUT_MS = 4_000;
