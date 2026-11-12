import { describe, expect, it } from 'vitest';
import { TOOLS } from '@/content/tools-registry';
import { HOME_PICKS, TOOL_GROUPS, TOOL_INDEX, groupedTools, searchTools } from '@/content/tools-groups';
import { bannedHits } from '@/lib/tool-kit/banned';

// /tools 목록은 상황 묶음으로 나눠 보여 준다. 등록부에 도구를 더하면 여기에도 자리를 정해야 한다.

describe('도구 상황 묶음', () => {
  it('등록부의 도구는 전부 묶음과 한 줄 요약이 있다', () => {
    const missing = TOOLS.filter((t) => !TOOL_INDEX[t.href]).map((t) => t.href);
    expect(missing).toEqual([]);
  });

  it('묶음표에 등록부에 없는 주소가 남지 않는다', () => {
    const hrefs = new Set(TOOLS.map((t) => t.href));
    expect(Object.keys(TOOL_INDEX).filter((h) => !hrefs.has(h))).toEqual([]);
  });

  it('묶음은 6개이고 빈 묶음이 없다', () => {
    expect(TOOL_GROUPS.map((g) => g.label)).toEqual(['채용·계약', '매달 급여', '휴가·휴일', '퇴사·정산', '4대보험·신고', '문서·규정']);
    const groups = groupedTools();
    expect(groups.every((g) => g.tools.length > 0)).toBe(true);
    expect(groups.reduce((n, g) => n + g.tools.length, 0)).toBe(TOOLS.length);
  });

  it('한 줄 요약은 짧고 금지어가 없다', () => {
    for (const [href, m] of Object.entries(TOOL_INDEX)) {
      expect(m.summary.length, href).toBeLessThanOrEqual(36);
      expect(bannedHits(m.summary), href).toEqual([]);
      expect(m.summary.includes('포괄'), href).toBe(false);
    }
  });

  it('홈 바로가기는 등록부에 있는 도구이고, 제 묶음 안에 있다', () => {
    for (const g of TOOL_GROUPS) {
      const picks = HOME_PICKS[g.id];
      expect(picks.length, g.id).toBeGreaterThan(0);
      for (const p of picks) {
        expect(TOOL_INDEX[p.href]?.group, p.href).toBe(g.id);
        expect(bannedHits(p.label), p.href).toEqual([]);
      }
    }
  });

  it('퇴사 점검표 둘은 퇴사·정산 묶음에 있고, 사이트맵에 두 번 실리지 않는다(261112)', () => {
    const exit = groupedTools().find((g) => g.id === 'exit')!.tools.map((t) => t.href);
    expect(exit).toEqual(expect.arrayContaining(['/exit', '/exit-employer']));
    // 사이트맵 정적 목록(sitemap/[id]/route.ts)에 이미 있다 — 등록부에서 sitemap 값을 주면 중복된다
    for (const href of ['/exit', '/exit-employer']) expect(TOOLS.find((t) => t.href === href)?.sitemap).toBeUndefined();
    expect(searchTools('퇴사').map((t) => t.href)).toEqual(expect.arrayContaining(['/exit', '/exit-employer']));
  });

  it('검색은 제목·요약·설명 부분일치, 띄어쓰기 무시', () => {
    expect(searchTools('퇴직금').map((t) => t.href)).toContain('/tools/severance.html');
    expect(searchTools('주휴 수당').map((t) => t.href)).toContain('/tools/weekly-holiday-pay');
    expect(searchTools('').length).toBe(TOOLS.length);
    expect(searchTools('없는말zzz')).toEqual([]);
  });
});
