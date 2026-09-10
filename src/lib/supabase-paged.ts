/**
 * PostgREST 는 limit 을 안 주면 **1000행에서 조용히 끊는다.** 오류도 안 난다.
 * blog_articles 가 2026-09-10 기준 960건이라 며칠 뒤면 목록·사이트맵에서
 * 글이 소리 없이 사라진다. 그래서 끝까지 페이지를 넘겨 가며 받는다.
 *
 *   const rows = await fetchAllRows((from, to) =>
 *     supabaseServer.from('blog_articles')
 *       .select('slug')
 *       .order('published_at', { ascending: false })
 *       .range(from, to)
 *   );
 *
 * 쿼리는 **매번 새로 만들어야 한다** — 빌더는 한 번 await 하면 재사용할 수 없다.
 * 정렬도 반드시 준다. 정렬이 없으면 페이지마다 순서가 달라져 빠지는 행이 생긴다.
 */
const PAGE = 1000;
const MAX_PAGES = 50; // 5만 행. 여기 걸리면 그 목록은 페이지네이션을 따로 설계해야 한다

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < MAX_PAGES; p++) {
    const from = p * PAGE;
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) {
      console.error('fetchAllRows error:', error.message);
      break;
    }
    const rows = data || [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
  console.warn(`fetchAllRows: ${MAX_PAGES}페이지 상한에 걸렸다 — 목록이 잘렸을 수 있다`);
  return out;
}
