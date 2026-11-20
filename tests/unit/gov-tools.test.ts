import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bannedHits } from '@/lib/tool-kit/banned';
import { GOV_TOOLS } from '@/content/gov-tools';

// /gov-tools — 공단·관공서 업무 도구 모음(261119 재홍님: 공단 로그인·산재 서식·건보 신고서·관할 지사)
describe('공단 업무 도구 모음', () => {
  it('정한 네 가지를 이 순서로 싣는다', () => {
    expect(GOV_TOOLS.map((t) => t.id)).toEqual(['gov-login', 'sanjae', 'nhis-report-form', 'branch-directory']);
  });

  it('카드마다 바로 가는 곳이 하나 이상 있다', () => {
    for (const t of GOV_TOOLS) expect(t.actions.length, t.id).toBeGreaterThan(0);
  });

  it('사이트 안 주소는 실제 페이지가 있다', () => {
    for (const t of GOV_TOOLS) {
      for (const a of t.actions.filter((x) => x.href.startsWith('/'))) {
        const page = existsSync(join(process.cwd(), 'src/app', a.href, 'page.tsx'));
        const howto = existsSync(join(process.cwd(), 'public', a.href, 'index.html')); // /howto/* 정적 안내
        expect(page || howto, a.href).toBe(true);
      }
    }
  });

  it('설치 프로그램은 요구사항과 내려받기 주소를 함께 적는다', () => {
    const g = GOV_TOOLS.find((t) => t.id === 'gov-login')!;
    expect(g.requires).toBeTruthy();
    expect(g.actions.some((a) => a.href.includes('/releases/latest'))).toBe(true);
    expect(g.actions.some((a) => a.href === '/howto/gov-login')).toBe(true);
  });

  it('문구에 금지어가 없다', () => {
    expect(bannedHits(JSON.stringify(GOV_TOOLS))).toEqual([]);
  });

  it('페이지 파일이 있다', () => {
    expect(existsSync(join(process.cwd(), 'src/app/gov-tools/page.tsx'))).toBe(true);
  });
});
