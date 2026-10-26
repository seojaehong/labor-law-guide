import { describe, expect, it } from 'vitest';
import { cleanBlogSummary, extractBlogLead } from '@/lib/blog-summary';

// 2026-10-26 라이브 화면에서 잡힌 것 — daily-20261026-01 의 본문 머리다.
// 빈 줄 없이 붙은 HTML 이고, 소수점이 든 숫자가 첫 문장에 있다.
const HTML_BLOB = '<h2>오늘의 한 줄</h2>\n<p>기간제로 일해 본 직장인 가운데 같은 직장에서 정규직이 된 사람은 14.7%였다. 직장갑질119가 10월 25일 발표한 조사 결과다. 같은 날 연합뉴스는 중대재해로 영업정지를 받은 대형 건설사들이 취소소송과 집행정지로 수주를 이어 가고 있다고 보도했다.</p>\n<p>근로소득자로는 5인 미만인데 사업소득자를 더하면 5인 이상이 되는 사업장은 2025년 기준 14만9,537곳이었다.</p>';

describe('블로그 요약 — 한 덩이 HTML', () => {
  it('태그가 화면에 그대로 나가지 않는다', () => {
    const lead = extractBlogLead(HTML_BLOB);
    expect(lead).toBeTruthy();
    expect(lead).not.toContain('<');
    expect(lead).not.toContain('>');
    expect(lead).not.toContain('오늘의 한 줄'); // 헤딩은 리드가 아니다
    expect(lead).toContain('기간제로 일해 본 직장인');
  });

  it('소수점에서 문장을 끊어 「14. 7%」로 만들지 않는다', () => {
    const lead = extractBlogLead(HTML_BLOB)!;
    expect(lead).toContain('14.7%');
    expect(lead).not.toContain('14. 7');
  });

  it('DB 요약이 깨끗하면 그걸 쓴다', () => {
    const summary = '직장갑질119 조사에서 기간제 경험 직장인 14.7%만 같은 직장 정규직이 됐다. 중대재해 영업정지를 받은 대형 건설사들은 집행정지로 수주를 이어 가고, 가짜 5인 미만 의심 사업장은 2025년 14만9,537곳이었다.';
    const out = cleanBlogSummary(summary, HTML_BLOB)!;
    expect(out).not.toContain('<');
    expect(out).toContain('14.7%');
    expect(out).not.toContain('14. 7');
  });

  it('요약이 비어도 본문에서 태그 없는 리드를 만든다', () => {
    const out = cleanBlogSummary(null, HTML_BLOB)!;
    expect(out).not.toContain('<');
    expect(out).toContain('기간제');
  });
});
