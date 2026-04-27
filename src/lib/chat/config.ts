// 한글 도메인 (사용자 가독성)
export const SITE_DOMAIN = 'https://노란봉투법.com';
export const SANCTION_DOMAIN = 'https://labor-decisions-search.vercel.app';

// 환각 URL 차단 — 화이트리스트 외 도메인은 스트리밍 중 자동 제거
// winhr.co.kr는 챗봇 응답에서 절대 노출 X (footer/contact 페이지로만 접근). 환각 위험 차단.
export const URL_WHITELIST = [
  'https://노란봉투법.com',
  'http://노란봉투법.com',
  'https://www.xn--o80bk8isxeinax68f.com',
  'https://labor-decisions-search.vercel.app',
];

export const CHAT_MAX_DURATION = 60;
