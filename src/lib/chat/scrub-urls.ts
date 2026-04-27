// 화이트리스트: 정확한 매칭 (path 포함). winhr.co.kr는 챗봇 응답에서 완전 차단.
const STRICT_WHITELIST: Array<RegExp> = [
  /^https?:\/\/(www\.)?노란봉투법\.com(\/[^\s)]*)?$/,
  /^https?:\/\/(www\.)?xn--o80bk8isxeinax68f\.com(\/[^\s)]*)?$/,
  /^https?:\/\/labor-decisions-search\.vercel\.app(\/[^\s)]*)?$/,
];

function isWhitelistedUrl(url: string): boolean {
  return STRICT_WHITELIST.some((p) => p.test(url));
}

export function scrubFakeUrls(text: string): string {
  // 1) 완전 마크다운 링크 [텍스트](URL) → 화이트리스트 외면 텍스트만 남김
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_full, label, url) => {
    return isWhitelistedUrl(url) ? `[${label}](${url})` : label;
  });
  // 2) 베어 URL — winhr.co.kr 어떤 형태도 제거 (회사 안내는 footer/contact 페이지로만)
  text = text.replace(/https?:\/\/(?:www\.)?winhr\.co\.kr[^\s)]*/g, '');
  // 3) /blog/숫자 fake slug 제거
  text = text.replace(/\(\/blog\/\d{1,5}\)/g, '');
  // 4) 청크 분할 잔여물 정리
  text = text.replace(/\]\(\s*\)/g, ']');
  text = text.replace(/\]\(https?:\/\/[^)\s]*(?:winhr|blog\/\d)[^)\s]*$/g, ']');
  text = text.replace(/^[a-zA-Z0-9./_:-]*winhr\.co\.kr[^\s)]*\)?/g, '');
  text = text.replace(/^blog\/\d{1,5}\)?/g, '');
  text = text.replace(/^\)+\s*\n?/g, '');
  return text;
}
