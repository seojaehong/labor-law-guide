import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { midyearView } from '@/app/tools/midyear-settlement/result';

// 디자인 평가 261124 마지막 정리 — 웨이트 750·44px 터치·퇴직금 정적 페이지 글꼴·탭 닫기 키보드·세무 문구·링크 이름.
// 파일은 윈도우 autocrlf 로 \r\n 일 수 있으니 읽을 때 정규화한다.
const read = (p: string) => readFileSync(resolve(p), 'utf8').replace(/\r\n/g, '\n');

function cssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...cssFiles(p));
    else if (p.endsWith('.css')) out.push(p);
  }
  return out;
}

describe('웨이트 래더 — 750 같은 사이값 금지 (DESIGN.md §4.3)', () => {
  it('src·public/tools 의 CSS 에 font-weight 750 이 없다', () => {
    for (const f of [...cssFiles('src'), ...cssFiles('public/tools')]) {
      expect(read(f), f).not.toMatch(/font-weight:\s*750/);
    }
  });
});

describe('터치 대상 44px (DESIGN.md §5.1)', () => {
  it('근거 자료 찾기 예시 질문 칩', () => {
    const src = read('src/app/ai/SourceFinder.tsx');
    expect(src).not.toContain('min-h-[36px]');
    expect(src).toMatch(/aria-label="예시 질문"[\s\S]*?min-h-\[44px\]/);
  });
  it('글 상세 「글 목록」 링크', () => {
    expect(read('src/app/blog/[slug]/page.tsx')).toMatch(/href="\/blog"\s*\n\s*className="[^"]*min-h-\[44px\][^"]*"/);
  });
  it('공휴일 수당 「← 도구」 링크(261124 뒤로가기를 /tools 로)', () => {
    expect(read('src/app/tools/holiday-pay/page.tsx')).toMatch(/className="[^"]*min-h-\[44px\][^"]*"\s*\n\s*>\s*\n\s*← 도구/);
  });
  it('판례 펼침 버튼(CaseCard — /guide·/sanction)', () => {
    expect(read('src/components/CaseCard.tsx')).toMatch(/<button onClick=\{[^}]*\} className="[^"]*min-h-\[44px\]/);
  });
  it('접힌 상세 펼침(FoldedDetail — 주휴수당 「더 정확히」 등) — 실측 43px 이라 min-height 도 건다', () => {
    expect(read('src/components/tool/FoldedDetail.tsx')).toMatch(/<summary className="[^"]*min-h-\[44px\][^"]*py-\[10px\]/);
  });
  it('퇴사 계산 입력칸(exit.css)', () => {
    expect(read('src/app/exit/exit.css')).toMatch(/\.ex-field input \{[^}]*min-height: 44px/);
  });
  it('개정 검색 입력·지우기 버튼(laws.css)', () => {
    const css = read('src/app/laws/laws.css');
    expect(css).toMatch(/\.lr-search input \{[^}]*min-height: ?44px/);
    expect(css).toMatch(/\.lr-search button \{[^}]*min-width: ?44px[^}]*min-height: ?44px/);
  });
  it('/laws 펼침 뒤에 나오는 「전체 보기」·「부칙」·「공포일도 넣기」·아이콘 버튼도 44px (390·1440 실측 22~34px)', () => {
    const css = read('src/app/laws/laws.css');
    for (const sel of ['.lr-more', '.lr-addenda summary', '.lr-sub-pop label']) {
      const rule = css.match(new RegExp(`^${sel.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`, 'm'));
      expect(rule?.[1], sel).toMatch(/min-height: 44px/);
    }
    expect(css).toMatch(/^\.lr-btn-sm \{[^}]*min-width: 44px/m);
  });
  it('laws.css·exit.css 의 버튼·입력·선택·펼침 규칙에 44px 미만 높이가 없다', () => {
    for (const f of ['src/app/laws/laws.css', 'src/app/exit/exit.css']) {
      for (const m of read(f).matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        if (!/button|input|select|summary|icon-btn/.test(m[1])) continue;
        for (const h of m[2].matchAll(/(?:^|[;\s])(?:min-)?height:\s*(\d+)px/g)) {
          expect(Number(h[1]), `${f} ${m[1].trim()}`).toBeGreaterThanOrEqual(44);
        }
      }
    }
  });
});

describe('퇴직금 정적 페이지 글꼴 — 조각 CSS (DESIGN.md §4.1·§10-9)', () => {
  const brand = read('public/tools/severance-brand.css');
  it('범위 없는 원본 Pretendard @font-face 를 두지 않는다', () => {
    for (const m of brand.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
      if (/Pretendard/.test(m[1])) expect(m[1]).toMatch(/unicode-range/);
    }
    expect(brand).not.toContain('/fonts/PretendardVariable.woff2');
  });
  it('같은 출처의 조각 CSS 를 부른다', () => {
    expect(brand.trimStart().startsWith('@import url("/fonts/pretendard-subset/pretendardvariable-dynamic-subset.css")')).toBe(true);
  });
  it('조각은 빌드·개발 때 node_modules 에서 복사하고 저장소에는 올리지 않는다', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts.prebuild).toContain('copy-pretendard-subset.mjs');
    expect(pkg.scripts.predev).toContain('copy-pretendard-subset.mjs');
    expect(read('.gitignore')).toMatch(/^\/public\/fonts\/pretendard-subset\/$/m);
  });
});

describe('퇴직금 탭 삭제 — 키보드로 닿는 별도 버튼', () => {
  const html = read('public/tools/severance.html');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  function render(names: string[]) {
    const container = { innerHTML: '', contains: () => false, querySelector: () => null };
    const document = { addEventListener() {}, getElementById: () => container, activeElement: null };
    const localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    const ctx = vm.createContext({ document, localStorage });
    vm.runInContext(script, ctx);
    vm.runInContext(`state.workers = ${JSON.stringify(names)}.map(n => ({ ...createDefaultWorker(), workerName: n })); state.currentIndex = 0; renderTabs();`, ctx);
    return container.innerHTML;
  }
  it('삭제는 탭 버튼 밖의 <button> 이고 이름이 붙는다', () => {
    const out = render(['가나다', '라마바']);
    expect(out).not.toMatch(/<span class="tab-remove"/);
    const removes = [...out.matchAll(/<button type="button" class="tab-remove"[^>]*aria-label="([^"]+)"/g)].map((m) => m[1]);
    expect(removes).toEqual(['가나다 삭제', '라마바 삭제']);
    // 버튼 안에 버튼이 없다 — 여는 태그 다음 닫는 태그가 먼저 온다
    for (const seg of out.split('<button').slice(1)) expect(seg.indexOf('</button>')).toBeGreaterThan(-1);
    expect(out).not.toMatch(/<button[^>]*>[^<]*(<span[^>]*>[^<]*<\/span>)*[^<]*<button/);
  });
  it('근로자가 1명이면 삭제 버튼이 없다', () => {
    expect(render(['가나다'])).not.toContain('tab-remove');
  });
});

describe('세무 문구 — 예상치', () => {
  it('중도퇴사 연말정산 0원 안내는 「예상 정산액」', () => {
    const src = read('src/app/tools/midyear-settlement/result.ts');
    expect(src).toContain('예상 정산액이 0원입니다');
    expect(src).not.toMatch(/[^상] 정산액이 0원입니다/);
    expect(typeof midyearView).toBe('function');
  });
});

describe('링크 이름 — 「AI 챗봇」 금지(제품 결정 261112)', () => {
  it('뉴스레터 하단 링크는 「근거 자료 찾기」로 /ai 에 간다', () => {
    const src = read('src/lib/newsletter-mail.ts');
    expect(src).not.toContain('AI 챗봇');
    expect(src).toMatch(/href="\$\{SITE_URL\}\/ai"[^>]*>→ 근거 자료 찾기/);
  });
});
