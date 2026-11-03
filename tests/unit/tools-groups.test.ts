import { describe, expect, it } from 'vitest';
import { TOOLS } from '@/content/tools-registry';
import { TOOL_GROUPS, TOOL_INDEX, groupedTools, searchTools } from '@/content/tools-groups';
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

  it('검색은 제목·요약·설명 부분일치, 띄어쓰기 무시', () => {
    expect(searchTools('퇴직금').map((t) => t.href)).toContain('/tools/severance.html');
    expect(searchTools('주휴 수당').map((t) => t.href)).toContain('/tools/weekly-holiday-pay');
    expect(searchTools('').length).toBe(TOOLS.length);
    expect(searchTools('없는말zzz')).toEqual([]);
  });
});
