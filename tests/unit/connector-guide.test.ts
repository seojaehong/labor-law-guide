import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { bannedHits } from '@/lib/tool-kit/banned';
import { REMOTE_CONNECTORS } from '@/content/ai-tools';
import { REMOTE_TOOLS } from '../../tools/k-labor/remote.mjs';
import ConnectGuide from '@/app/ai-tools/ConnectGuide';
import ConnectorBanner from '@/components/ConnectorBanner';
import { DISMISSED_CLASS, STORAGE_KEY, getServerSnapshot, shouldShowBanner } from '@/lib/connector-banner';

let pathname = '/';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const K = 'https://yellowenvelope.kr/api/mcp/mcp';
const S = 'https://sanjae-apply.vercel.app/api/mcp/mcp';
const text = (html: string) => html.replace(/<[^>]+>/g, ' ');
const JOB_WORDS = /대신|대행|대리|지도/;

describe('Claude 앱에 연결하기 절', () => {
  const html = renderToString(createElement(ConnectGuide)).replaceAll('<!-- -->', '');

  it('토큰 없이 쓰는 원격 주소 2개를 도구 수와 복사 버튼과 함께 싣는다', () => {
    expect(REMOTE_CONNECTORS.map((c) => c.remote)).toEqual([K, S]);
    expect(html).toContain('Claude 앱에 연결하기');
    expect(html).toContain(K);
    expect(html).toContain(S);
    expect(html).toContain('도구 25개');
    expect(html).toContain('도구 8개');
    expect(html.match(/<button/g)).toHaveLength(2);
  });

  it('k-labor 도구 수는 원격 등록 목록과 같다', () => {
    expect(REMOTE_CONNECTORS[0].remoteTools).toBe(REMOTE_TOOLS.length);
  });

  it('3단계 안내와 서버 전송 고지를 싣는다', () => {
    expect(html.match(/<li/g)).toHaveLength(3);
    const t = text(html);
    expect(t).toMatch(/설정/);
    expect(t).toMatch(/커넥터/);
    expect(t).toMatch(/커스텀 커넥터 추가/);
    expect(t).toMatch(/OAuth/);
    expect(t).toContain('입력은 서버로 전송되지만 저장하지 않습니다');
  });

  it('페이지가 안내 절을 첫 내용으로 렌더하고 커넥터 이름을 한 가지로 쓴다', () => {
    const page = fs.readFileSync('src/app/ai-tools/page.tsx', 'utf8');
    const body = page.slice(page.indexOf('export default function AiToolsPage'));
    expect(body.indexOf('<ConnectGuide')).toBeGreaterThan(-1);
    expect(body.indexOf('<ConnectGuide')).toBeLessThan(body.indexOf('<ChatExample'));
    expect(body.indexOf('<h1')).toBeLessThan(body.indexOf('<ConnectGuide'));
    expect(page).not.toContain('사용자 지정 커넥터');
  });
});

describe('화면 문구', () => {
  it('안내 절·배너·AI 연결 도구 페이지에 금지어가 없다', () => {
    for (const f of ['src/app/ai-tools/ConnectGuide.tsx', 'src/components/ConnectorBanner.tsx', 'src/app/ai-tools/page.tsx']) {
      const s = fs.readFileSync(f, 'utf8');
      expect(bannedHits(s), f).toEqual([]);
      expect(s, f).not.toMatch(JOB_WORDS);
    }
  });
});

describe('닫을 수 있는 띠 배너', () => {
  function fakeStorage(initial: Record<string, string> = {}, broken = false) {
    const m = new Map(Object.entries(initial));
    return {
      getItem: (k: string) => { if (broken) throw new Error('blocked'); return m.get(k) ?? null; },
      setItem: (k: string, v: string) => { if (broken) throw new Error('blocked'); m.set(k, v); },
      dump: () => [...m.values()],
    };
  }
  async function freshStore() {
    vi.resetModules();
    return import('@/lib/connector-banner');
  }

  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  // 261112 — 종전에는 서버 렌더가 비어 있었고 hydration 뒤 띠가 끼어들며 페이지를 밀었다(CLS).
  // 이제 서버는 저장소와 무관하게 띠를 그리고, 닫은 사람은 <head> 선반영 스크립트 + CSS 로 첫 페인트 전에 숨긴다.
  it('서버 렌더는 저장소와 무관하게 띠를 그려 hydration 이 어긋나지 않고 화면이 밀리지 않는다', () => {
    expect(getServerSnapshot()).toBe(false);
    for (const initial of [{}, { 'connector-banner-dismissed': '1' }] as Record<string, string>[]) {
      vi.stubGlobal('localStorage', fakeStorage(initial));
      pathname = '/';
      const html = renderToString(createElement(ConnectorBanner));
      expect(html).toContain('내 Claude에서 바로 쓰기');
      expect(html).toContain('connector-banner');
    }
    pathname = '/ai-tools';
    expect(renderToString(createElement(ConnectorBanner))).toBe('');
  });

  it('닫은 사람은 첫 페인트 전에 숨긴다 — 선반영 스크립트와 CSS 가 같은 키·클래스를 쓴다', () => {
    const layout = fs.readFileSync('src/app/layout.tsx', 'utf8');
    const css = fs.readFileSync('src/components/site-refactor.css', 'utf8');
    expect(STORAGE_KEY).toBe('connector-banner-dismissed');
    expect(layout).toContain('localStorage.getItem(\'${BANNER_STORAGE_KEY}\')');
    expect(layout).toContain('classList.add(\'${BANNER_DISMISSED_CLASS}\')');
    expect(css).toContain(`.${DISMISSED_CLASS} .connector-banner { display:none; }`);
  });

  it('/ai-tools 와 그 아래에서는 숨기고 그 밖에서는 보인다', () => {
    expect(shouldShowBanner('/', false)).toBe(true);
    expect(shouldShowBanner('/tools', false)).toBe(true);
    expect(shouldShowBanner('/ai', false)).toBe(true);
    expect(shouldShowBanner('/ai-tools', false)).toBe(false);
    expect(shouldShowBanner('/ai-tools/x', false)).toBe(false);
    expect(shouldShowBanner('/', true)).toBe(false);
  });

  it('닫으면 저장되고 다음 방문에서도 안 뜬다', async () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
    const a = await freshStore();
    expect(a.getSnapshot()).toBe(false);
    a.dismissBanner();
    expect(a.getSnapshot()).toBe(true);
    expect(storage.dump()).toEqual(['1']);
    const b = await freshStore();
    expect(b.getSnapshot()).toBe(true);
  });

  it('저장소가 막혀도 깨지지 않고 그 화면에서는 닫힌다', async () => {
    vi.stubGlobal('localStorage', fakeStorage({}, true));
    const s = await freshStore();
    expect(s.getSnapshot()).toBe(false);
    const listener = vi.fn();
    const off = s.subscribe(listener);
    expect(() => s.dismissBanner()).not.toThrow();
    expect(listener).toHaveBeenCalledOnce();
    expect(s.getSnapshot()).toBe(true);
    off();
  });

  it('레이아웃이 내비 앞에 한 번 싣고, 문구와 링크가 맞고, 좁은 폭에서 줄어든다', () => {
    const layout = fs.readFileSync('src/app/layout.tsx', 'utf8');
    expect(layout.match(/<ConnectorBanner \/>/g)).toHaveLength(1);
    expect(layout.indexOf('<ConnectorBanner />')).toBeLessThan(layout.indexOf('<GlassNav />'));
    const src = fs.readFileSync('src/components/ConnectorBanner.tsx', 'utf8');
    expect(src).toContain('내 Claude에서 바로 쓰기');
    expect(src).toContain('href="/ai-tools"');
    expect(src).toContain('min-w-0');
    expect(src).toMatch(/aria-label="[^"]*닫기"/);
  });
});
