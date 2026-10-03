import type { Page } from '@playwright/test';

/** Count the actual visible graphemes on each rendered line using DOM Range.
 * This deliberately does not estimate characters from width/font-size or ch/ic.
 * UTF-16 offsets are advanced with grapheme clusters, including mixed-script text.
 */
export async function measureReading(page: Page, scope: string) {
  return page.locator(scope).first().evaluate(root => {
    const rectOf = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom };
    };
    const measures = ['한글 측정 문단', '전각한글측정', 'Mixed layout'].map(prefix => {
      const paragraph = [...root.querySelectorAll('p')].find(element => element.textContent?.trim().startsWith(prefix));
      if (!paragraph) return { prefix, missing: true as const };
      const style = getComputedStyle(paragraph);
      const lines: Array<{ top: number; text: string; characters: number; nonspace: number; hangul: number; left: number; right: number }> = [];
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });
      let node: Node | null;
      while ((node = walker.nextNode())) {
        for (const { segment, index } of segmenter.segment(node.textContent || '')) {
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + segment.length);
          const rect = [...range.getClientRects()].find(rect => rect.width > 0 && rect.height > 0);
          if (!rect) continue;
          let line = lines.find(line => Math.abs(line.top - rect.top) < 2);
          if (!line) {
            line = { top: rect.top, text: '', characters: 0, nonspace: 0, hangul: 0, left: rect.left, right: rect.right };
            lines.push(line);
          }
          line.text += segment;
          line.characters++;
          if (!/^\s+$/u.test(segment)) line.nonspace++;
          if (/\p{Script=Hangul}/u.test(segment)) line.hangul++;
          line.left = Math.min(line.left, rect.left);
          line.right = Math.max(line.right, rect.right);
        }
      }
      lines.sort((a, b) => a.top - b.top);
      // Exclude the final partial line from the complete-line statistics.
      const complete = lines.slice(0, -1);
      const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
      return {
        prefix, missing: false as const, rect: rectOf(paragraph),
        fontFamily: style.fontFamily, fontSize: parseFloat(style.fontSize), lineHeight: parseFloat(style.lineHeight),
        letterSpacing: style.letterSpacing, color: style.color, wordBreak: style.wordBreak, overflowWrap: style.overflowWrap,
        lineCount: lines.length,
        medianCharactersPerCompleteLine: median(complete.map(line => line.characters)),
        medianHangulPerCompleteLine: median(complete.map(line => line.hangul)),
        medianNonspacePerCompleteLine: median(complete.map(line => line.nonspace)),
        lines,
        clientWidth: paragraph.clientWidth, scrollWidth: paragraph.scrollWidth,
      };
    });
    const style = getComputedStyle(root);
    const sidebar = document.querySelector('.reading-sidebar') || document.querySelector('aside');
    const sidebarContent = sidebar?.querySelector('.reading-sidebar-content, .sticky');
    const main = document.querySelector('.reading-main') || document.querySelector('article') || root;
    const tableScrollers = [...root.querySelectorAll('.reading-table-scroll')].map(element => ({
      ...rectOf(element), clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
      overflowX: getComputedStyle(element).overflowX, role: element.getAttribute('role'), tabindex: element.getAttribute('tabindex'),
    }));
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth },
      root: { ...rectOf(root), clientWidth: root.clientWidth, scrollWidth: root.scrollWidth, fontSize: style.fontSize },
      main: rectOf(main), mainMaxInlineSize: getComputedStyle(main).maxInlineSize, sidebar: sidebar ? rectOf(sidebar) : null,
      sidebarContent: sidebarContent ? { ...rectOf(sidebarContent), position: getComputedStyle(sidebarContent).position, top: getComputedStyle(sidebarContent).top } : null,
      theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      fontStatus: document.fonts.status,
      primaryFontAvailable: document.fonts.check('18px \"Pretendard Variable\"', '한글水'),
      fontFaces: [...document.fonts].map(face => ({ family: face.family, status: face.status, weight: face.weight })),
      measures, tableScrollers,
    };
  });
}
