const DEFAULT_SITE_URL = 'https://www.xn--o80bk8isxeinax68f.com';
const DEFAULT_SUBSIDY_GUIDE_URL = 'https://reporeview.vercel.app';

function normalizeSiteUrl(value?: string) {
  if (!value) return DEFAULT_SITE_URL;

  try {
    const url = new URL(value);

    // Keep search signals consolidated on the production custom domain.
    if (url.hostname.endsWith('vercel.app')) {
      return DEFAULT_SITE_URL;
    }

    return url.origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

function normalizeExternalProductUrl(value: string | undefined, fallback: string) {
  if (!value) return fallback;

  try {
    return new URL(value).origin;
  } catch {
    return fallback;
  }
}

export const SITE_URL = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
export const SUBSIDY_GUIDE_URL = normalizeExternalProductUrl(
  process.env.NEXT_PUBLIC_SUBSIDY_GUIDE_URL,
  DEFAULT_SUBSIDY_GUIDE_URL,
);
