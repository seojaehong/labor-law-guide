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

/**
 * 검색 한 건당 상한.
 *
 * 2026-09-01 1차에 2.5초로 잡았다가 회귀를 냈다. 판정례를 살리려고 상한을 걸었는데
 * 그 상한에 행정해석이 걸려서 잘렸다 — 최근 30건 중 11건(37%)에서 행정해석 컨텍스트가
 * 0자였다. 판정례를 살리고 행정해석을 죽인 셈이다.
 *
 * 상한의 목적은 '느린 것을 잘라내기'가 아니라 'DB statement_timeout 10초가 그대로
 * 사용자 대기시간이 되는 것을 막기'다. 정상 지연을 다듬는 용도가 아니다.
 * 실측 정상값은 FAQ 0.55초 / 행정해석 0.9초 / 법원판례 0.4초 / 판정례 0.1~0.6초로
 * 전부 1초 안쪽이다. 그런데도 2.5초에 걸렸다는 건 서버리스 환경의 편차가 크다는 뜻이다.
 *
 * 검색 넷은 병렬로 돌기 때문에 전체 대기시간은 합이 아니라 max() 다.
 * 즉 상한을 올려도 평소에는 비용이 0이고, 진짜로 멈춘 경우에만 그 값을 문다.
 * 컨텍스트를 잃는 손해가 몇 초 늦는 손해보다 크므로 넉넉하게 잡는다.
 */
export const RETRIEVAL_TIMEOUT_MS = 5_000;

/** FAQ 도 같은 값을 쓴다. 따로 둘 이유가 없어졌다. */
export const FAQ_TIMEOUT_MS = RETRIEVAL_TIMEOUT_MS;
