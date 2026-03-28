import type { NextConfig } from "next";

const BIGCASE_ORIGIN = "https://labor-decisions-search.vercel.app";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // AI 비교분석 (sanction)
      {
        source: "/sanction",
        destination: `${BIGCASE_ORIGIN}/sanction`,
      },
      {
        source: "/sanction/:path*",
        destination: `${BIGCASE_ORIGIN}/sanction/:path*`,
      },
      // 판정례 상세
      {
        source: "/decisions/:id",
        destination: `${BIGCASE_ORIGIN}/decisions/:id`,
      },
      // 판정례 검색
      {
        source: "/search",
        destination: `${BIGCASE_ORIGIN}/search`,
      },
      {
        source: "/search/:path*",
        destination: `${BIGCASE_ORIGIN}/search/:path*`,
      },
      // 판정례 통계
      {
        source: "/stats",
        destination: `${BIGCASE_ORIGIN}/stats`,
      },
      // 판정례 API (sanction)
      {
        source: "/api/sanction",
        destination: `${BIGCASE_ORIGIN}/api/sanction`,
      },
      // 판정례 API (search)
      {
        source: "/api/search",
        destination: `${BIGCASE_ORIGIN}/api/search`,
      },
    ];
  },
};

export default nextConfig;
