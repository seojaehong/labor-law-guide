// 디자인 남은 것 전수(261124) — 공용 손잡이·대비·터치 영역·띠 잔재·명칭을 고정한다.
// 화면 렌더 시험 기반(jsdom)이 없어 컴포넌트·CSS 는 소스 글자로 본다(tool-result-block.test.ts 와 같은 방식).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { rateOn } from '@/content/rates';
import { unitHours } from '@/lib/calc/min-wage';
import { choiceLabel, inputCls, monthlyMinWage } from '@/lib/tool-kit';

const read = (p: string) => readFileSync(p, 'utf8');

// ── 대비 계산(WCAG 2.x 상대 휘도) ──
function hex(h: string): [number, number, number] {
  const s = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) as [number, number, number];
}
function lum([r, g, b]: [number, number, number]): number {
  const f = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const ratio = (a: [number, number, number], b: [number, number, number]) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
/** color-mix(in srgb, A p%, B) — sRGB 값끼리 섞는다 */
const mix = (a: [number, number, number], p: number, b: [number, number, number]) =>
  a.map((c, i) => Math.round(c * p + b[i] * (1 - p))) as [number, number, number];

/** globals.css 에서 한 테마 블록의 토큰을 hex 로 푼다(var() 한 단계까지) */
function tokens(block: 'root' | 'dark'): Record<string, string> {
  const css = read('src/app/globals.css');
  // 주석 안 「:root」를 피하려고 줄머리에서 찾는다
  const start = block === 'root' ? css.search(/^:root \{/m) : css.search(/^\.dark \{/m);
  const body = css.slice(start, css.indexOf('\n}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
function resolve(t: Record<string, string>, root: Record<string, string>, name: string): string {
  let v = t[name] ?? root[name];
  for (let i = 0; i < 4 && v?.startsWith('var('); i++) {
    const ref = v.slice(4, -1).split(',')[0].trim();
    v = t[ref] ?? root[ref];
  }
  return v;
}

describe('입력칸 테두리 대비 — 라이트·다크 모두 3:1 이상(WCAG 1.4.11)', () => {
  const m = inputCls.match(/border-\[color-mix\(in_srgb,var\((--[\w-]+)\)_(\d+)%,var\((--[\w-]+)\)\)\]/);
  it('테두리는 글자색과 바탕색을 섞은 값이다(테마를 따라간다)', () => {
    expect(m).not.toBeNull();
  });
  for (const theme of ['root', 'dark'] as const) {
    it(`${theme === 'root' ? '라이트' : '다크'} — 입력칸 바탕 대비 ≥ 3`, () => {
      const root = tokens('root');
      const t = theme === 'root' ? root : tokens('dark');
      const [, fg, pct, bg] = m!;
      const a = hex(resolve(t, root, fg));
      const b = hex(resolve(t, root, bg));
      const border = mix(a, Number(pct) / 100, b);
      expect(ratio(border, b)).toBeGreaterThanOrEqual(3);
    });
  }
});

describe('라디오·체크 라벨 — 44px 히트 영역', () => {
  it('choiceLabel 은 min-h-[44px] 를 가진다', () => {
    expect(choiceLabel).toContain('min-h-[44px]');
  });
  for (const f of ['src/app/tools/notice-pay/NoticePayClient.tsx', 'src/app/tools/min-wage/MinWageClient.tsx']) {
    it(`${f} 의 라디오·체크 라벨은 모두 choiceLabel 을 쓴다`, () => {
      const src = read(f);
      const labels = [...src.matchAll(/<label[^>]*>\s*<input type="(?:radio|checkbox)"/g)].map((x) => x[0]);
      expect(labels.length).toBeGreaterThan(0);
      for (const l of labels) expect(l).toContain('choiceLabel');
    });
  }
});

describe('월급 기본값 = 최저임금 고시 × 월 소정근로시간(하드코딩 금지)', () => {
  it('2026년 = 10,320원 × 209시간 = 2,156,880원(종전 하드코딩 값과 같다)', () => {
    expect(monthlyMinWage('2026-11-24')).toBe(2_156_880);
    expect(monthlyMinWage('2026-11-24')).toBe(rateOn('minWageHourly', '2026-11-24')!.value * unitHours('month', 40));
  });
  it('2027년 고시로 넘어가면 따라간다(10,700 × 209)', () => {
    expect(monthlyMinWage('2027-01-01')).toBe(2_236_300);
  });
  for (const f of ['src/app/tools/notice-pay/NoticePayClient.tsx', 'src/app/tools/min-wage/MinWageClient.tsx']) {
    it(`${f} 에 2156880 리터럴이 없다`, () => {
      expect(read(f)).not.toMatch(/2_?156_?880/);
      expect(read(f)).toContain('monthlyMinWage(');
    });
  }
});

describe('/tools 묶음 바로가기 — 44px', () => {
  it('tools-directory.css 의 .tools-dir__jump a 는 min-height 44px', () => {
    const css = read('src/app/tools/tools-directory.css');
    const rule = css.slice(css.indexOf('.tools-dir__jump a {'), css.indexOf('}', css.indexOf('.tools-dir__jump a {')));
    expect(rule).toMatch(/min-height:\s*44px/);
  });
});

describe('띠 배너 잔재 정리(#264 가 띠를 없앤 것을 전제로)', () => {
  it('site-refactor.css 에 connector-banner 규칙이 없다', () => {
    expect(read('src/components/site-refactor.css')).not.toMatch(/connector-banner/);
  });
  it('모바일 메뉴 높이에 띠 여유분(- 44px)이 없다', () => {
    const css = read('src/components/editorial-navigation.css');
    const rule = css.slice(css.indexOf('.editorial-mobile-menu {'), css.indexOf('}', css.indexOf('.editorial-mobile-menu {')));
    expect(rule).toContain('max-height: calc(100dvh - var(--site-nav-height, 64px))');
    expect(css).not.toMatch(/ConnectorBanner/);
  });
});

describe('명칭 — 「AI 연결」로 통일', () => {
  it('gov-tools 에 「AI 연결 도구」가 없다', () => {
    expect(read('src/app/gov-tools/page.tsx')).not.toContain('AI 연결 도구');
  });
  it('뉴스레터에 「AI에 연결해서 쓰기」가 없다', () => {
    expect(read('src/lib/newsletter-mail.ts')).not.toContain('AI에 연결해서 쓰기');
  });
});

describe('명칭 — 남은 곳 전수(코드 주석·기계용 serverCard 이름 제외)', () => {
  const code = (p: string) => read(p).split('\n').filter((l) => !/^\s*(\/\/|\{\/\*|\*|<!--)/.test(l)).join('\n');
  it('gov-tools 데이터의 /ai-tools 버튼은 「AI 연결」로 부른다', () => {
    expect(code('src/content/gov-tools.ts')).not.toMatch(/AI 에 연결해 쓰기/);
    expect(code('src/content/gov-tools.ts')).toContain("label: 'AI 연결(MCP)', href: '/ai-tools'");
  });
  it('k-labor 사용설명서 바닥 링크도 「AI 연결」', () => {
    expect(read('public/howto/k-labor/index.html')).not.toContain('AI 연결 도구 모음');
  });
  it('뉴스레터 바닥 링크에 이모지가 없다', () => {
    // 제목 앞 이모지를 떼는 emojiPrefixes 목록은 기능이라 제외하고, 화면에 나가는 줄만 본다
    expect(read('src/lib/newsletter-mail.ts')).not.toMatch(/>📌/);
  });
});

describe('/gov-tools — 정적 사용설명서(/howto/*)는 Next Link 로 프리페치하지 않는다, 버튼 44px', () => {
  const src = read('src/app/gov-tools/page.tsx');
  it('/howto/ 는 일반 a 로 간다', () => {
    expect(src).toMatch(/a\.href\.startsWith\('\/'\) && !a\.href\.startsWith\('\/howto\/'\)/);
  });
  it('행동 버튼은 min-h-[44px]', () => {
    expect(src).toMatch(/const cls = '[^']*min-h-\[44px\]/);
  });
});

describe('UI 문구 전수 — 느낌표·이모지 아이콘·해요체(합니다체 통일, DESIGN.md §8)', () => {
  // 코드에 박힌 화면 문구만 본다. 주석, 사용자 목소리 예시(ai-tools 질문 예), 사용설명서 FAQ 질문 제목은 뺀다.
  const FILES = [
    'src/app/newsletter/confirmed/page.tsx', 'src/app/newsletter/unsubscribed/page.tsx', 'src/app/newsletter/unsubscribe/page.tsx',
    'src/components/SubscribeForm.tsx', 'src/components/leave/LeaveInput.tsx', 'src/components/leave/WorkspaceBar.tsx',
    'src/components/leave/SettlementInput.tsx', 'src/components/leave/PromotionInput.tsx', 'src/components/leave/UsageInput.tsx',
    'src/app/hwp-editor/HwpEditorClient.tsx', 'src/app/tools/contract-check/ContractCheckClient.tsx', 'src/app/ai/SourceFinder.tsx',
    'src/app/api/chat/route.ts', 'src/app/sanction/page.tsx', 'src/app/tools/holiday-pay/page.tsx', 'src/components/AuthorFooter.tsx',
    'src/components/HolidayPayCalculator.tsx',
  ];
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\u{FE0F}?/u;
  const HAEYO = /[가-힣](?:해요|에요|예요|어요|아요|게요|네요|할까요|할게요)(?=[.?\s'"`<,)]|$)/;
  const EXCL = /[가-힣]!/;
  for (const f of FILES) {
    it(f, () => {
      const lines = read(f).split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l));
      const bad = lines.filter((l) => (EMOJI.test(l) && !/emojiPrefixes|replace\(\/\^/.test(l)) || HAEYO.test(l) || EXCL.test(l));
      expect(bad).toEqual([]);
    });
  }
});

describe('터치 영역 — 입력칸·구독 동의 체크', () => {
  it('inputCls 는 min-h-[44px]', () => {
    expect(inputCls).toContain('min-h-[44px]');
  });
  it('구독 동의 체크 라벨은 44px 이상', () => {
    expect(read('src/components/SubscribeForm.tsx')).toMatch(/<label className="[^"]*min-h-\[44px\][^"]*"[^>]*>\s*<input\s+type="checkbox"/);
  });
});

describe('다른 계산기의 라디오·체크 라벨도 44px', () => {
  it('pay-check·hwp·rules-review 체크 라벨 CSS 는 min-height 44px', () => {
    for (const [f, cls] of [['src/app/tools/pay-check/pay-check.css', '.pc-unknown {'], ['src/app/tools/hwp/hwp-tool.css', '.hw-check {'], ['src/app/tools/rules-review/rules-review.css', '.rr-check {']] as const) {
      const css = read(f);
      const rule = css.slice(css.indexOf(cls), css.indexOf('}', css.indexOf(cls)));
      expect(rule, f).toMatch(/min-height:\s*44px/);
    }
  });
  for (const f of ['src/app/tools/council-graph/CouncilGraphClient.tsx', 'src/app/tools/contract-write/RecentInputs.tsx']) {
    it(`${f} 라벨은 choiceLabel`, () => {
      const labels = [...read(f).matchAll(/<label[^>]*>\s*<input\s+type="(?:radio|checkbox)"/g)].map((x) => x[0]);
      expect(labels.length).toBeGreaterThan(0);
      for (const l of labels) expect(l).toContain('choiceLabel');
    });
  }
});

describe('계산기 질문(legend·label)도 합니다체 — 「~나요/~인가요」 없음', () => {
  const FILES = [
    'src/app/tools/contract-check/ContractCheckClient.tsx', 'src/app/tools/daily-worker-tax/DailyWorkerTaxClient.tsx',
    'src/app/tools/leave-pay/LeavePayClient.tsx', 'src/app/tools/midyear-settlement/MidyearSettlementClient.tsx',
    'src/app/tools/min-wage/MinWageClient.tsx', 'src/app/tools/notice-pay/NoticePayClient.tsx', 'src/app/tools/pay-check/PayCheckClient.tsx',
    'src/app/tools/pay-proration/PayProrationClient.tsx', 'src/app/tools/shutdown-allowance/ShutdownAllowanceClient.tsx',
    'src/app/tools/weekly-holiday-pay/WeeklyHolidayClient.tsx', 'src/components/HolidayPayCalculator.tsx', 'src/components/leave/WorkspaceBar.tsx',
  ];
  for (const f of FILES) {
    it(f, () => {
      const lines = read(f).split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l));
      expect(lines.filter((l) => /[가-힣](?:나요|인가요|가요)\??[<'"`]/.test(l))).toEqual([]);
    });
  }
});

describe('구독·명부 지우기 문구 — 남은 해요체', () => {
  it('구독 API 응답 문장은 합니다체', () => {
    const src = read('src/app/api/subscribers/route.ts');
    expect(src).not.toContain('구독이 시작됐어요');
    expect(src).not.toContain('보내드려요');
  });
  it('전부 지우기 확인창도 합니다체', () => {
    expect(read('src/lib/leave/leave-workspaces.ts')).not.toMatch(/계속할까요/);
  });
  it('구독 완료 안내는 말투만 바꾸고 발송 시점을 새로 단정하지 않는다', () => {
    const src = read('src/components/SubscribeForm.tsx');
    expect(src).not.toContain('다음 발송부터');
    expect(src).not.toContain('5월 둘째 주부터');
  });
});

describe('ResultBlock — 같은 글자 두 줄이 와도 React 키가 겹치지 않는다(사용자 입력 행에서 줄이 만들어진다)', () => {
  it('모든 map 의 key 는 순번을 포함한다', () => {
    const src = read('src/components/tool-result/ResultBlock.tsx');
    const keys = src.split('key={').slice(1).map((t) => t.slice(0, t.indexOf(' ')));
    expect(keys.length).toBeGreaterThanOrEqual(9);
    for (const k of keys) expect(k, k).toMatch(/\$\{i\}|\$\{j\}/);
  });
});

describe('멈춤 상태 띠는 한 문구(result-view STATUS_STOP)', () => {
  it('공용 상수가 있고 계산기마다 따로 정의하지 않는다', async () => {
    const rv = await import('@/components/tool-result/result-view');
    expect((rv as Record<string, unknown>).STATUS_STOP).toBe('계산하지 않음 · 이 계산기가 다루는 범위 밖입니다');
    for (const id of ['daily-worker-tax', 'leave-pay', 'midyear-settlement', 'shutdown-allowance']) {
      expect(read(`src/app/tools/${id}/result.ts`), id).not.toMatch(/const STATUS_STOP = '/);
    }
  });
});

describe('연차 계산기(leave.css) 선택지도 44px', () => {
  const css = read('src/app/tools/leave/leave.css');
  for (const sel of ['.lv-clause__opts label {', '.lv-map__check {', '.lv-ws__remember {']) {
    it(sel, () => {
      const rule = css.slice(css.indexOf(sel), css.indexOf('}', css.indexOf(sel)));
      expect(rule).toMatch(/min-height:\s*44px/);
    });
  }
});
