import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { AI_TOOLS } from '@/content/ai-tools';
import { bannedHits } from '@/lib/tool-kit/banned';

// AI 연결 도구(MCP) 안내 — 공개된 것만 설치 명령을 싣는다.
// 「공개 준비 중」 도구에 설치 명령이 붙으면 아직 없는 패키지를 남이 깔게 된다.
describe('AI 연결 도구 목록', () => {
  it('도구마다 상태가 공개 또는 준비 중이다', () => {
    expect(AI_TOOLS.length).toBeGreaterThanOrEqual(2);
    for (const t of AI_TOOLS) expect(['public', 'preparing']).toContain(t.status);
  });

  it('설치 명령은 공개된 도구에만 있다', () => {
    for (const t of AI_TOOLS) {
      if (t.status === 'preparing') {
        expect(t.install, t.id).toBeUndefined();
        expect(t.download, t.id).toBeUndefined();
      } else if (t.install) expect(t.install.claudeCode, t.id).toMatch(/^claude mcp add /);
      else expect(t.download?.href, t.id).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/releases\//);
    }
  });

  it('산재 신청 도우미는 공개, 4대보험 신고서 도구는 준비 중', () => {
    expect(AI_TOOLS.find((t) => t.id === 'sanjae-apply')?.status).toBe('public');
    expect(AI_TOOLS.find((t) => t.id === 'insurance-forms')?.status).toBe('preparing');
  });

  it('문구에 금지어가 없다', () => {
    const text = JSON.stringify(AI_TOOLS);
    expect(bannedHits(text)).toEqual([]);
    // 행정사법 — 제출을 맡는 말
    expect(text).not.toMatch(/대신|대행|대리/);
  });

  it('사이트맵에 들어간다', () => {
    const src = fs.readFileSync('src/app/sitemap/[id]/route.ts', 'utf8');
    expect(src).toContain('${SITE_URL}/ai-tools`');
  });
});
