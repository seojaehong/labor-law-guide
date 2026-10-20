import { revalidatePath, revalidateTag } from 'next/cache';

export const BLOG_LIST_CACHE_TAG = 'blog-article-lists';

// The detail page includes metadata/JSON-LD; OG is a separate cached route.
export function revalidateArticle(slug: string) {
  const segment = encodeURIComponent(slug);
  revalidatePath(`/blog/${segment}`);
  revalidatePath(`/og/${segment}`);
  // Lists derive their summaries from content and have many query/page variants.
  revalidateTag(BLOG_LIST_CACHE_TAG, { expire: 0 });
}
