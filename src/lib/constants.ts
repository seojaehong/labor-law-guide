// 영문 primary 도메인. punycode 한글 도메인(노란봉투법.com)은 alias로 redirect.
const DEFAULT_SITE_URL = 'https://yellowenvelope.kr';
const PUNYCODE_HOST = 'xn--o80bk8isxeinax68f.com';

function normalizeSiteUrl(value?: string) {
  if (!value) return DEFAULT_SITE_URL;

  try {
    const url = new URL(value);

    // Keep search signals consolidated on the production custom domain.
    if (url.hostname.endsWith('vercel.app')) {
      return DEFAULT_SITE_URL;
    }
    // punycode/한글 도메인 alias도 영문 primary로 통일
    if (url.hostname.endsWith(PUNYCODE_HOST)) {
      return DEFAULT_SITE_URL;
    }

    return url.origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export const SITE_URL = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
