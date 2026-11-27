import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { bannedHits } from '@/lib/tool-kit/banned';
import { REMOTE_CONNECTORS } from '@/content/ai-tools';
import { REMOTE_TOOLS } from '../../tools/k-labor/remote.mjs';
import { unpublishedNames } from './k-labor-unpublished';
import ConnectGuide from '@/app/ai-tools/ConnectGuide';
import AiToolsPage from '@/app/ai-tools/page';

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
    expect(html).toContain('도구 26개');
    expect(html).toContain('도구 8개');
    expect(html.match(/<button/g)).toHaveLength(2);
  });

  it('k-labor 도구 수는 원격 등록 목록과 같다', () => {
    // 안내는 게시판 기준 — 아직 게시하지 않은 도구(k-labor-unpublished.ts)는 빼고 센다
    expect(REMOTE_CONNECTORS[0].remoteTools).toBe(REMOTE_TOOLS.filter((t) => !unpublishedNames().includes(t)).length);
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
  // 261124 — 상단 띠 배너(「내 Claude에서 바로 쓰기」)는 도구 우선 원칙에 맞춰 걷고 홈 「AI 연결」 지면으로 흡수했다.
  it('안내 절·AI 연결 페이지에 금지어가 없다', () => {
    for (const f of ['src/app/ai-tools/ConnectGuide.tsx', 'src/app/ai-tools/page.tsx']) {
      const s = fs.readFileSync(f, 'utf8');
      expect(bannedHits(s), f).toEqual([]);
      expect(s, f).not.toMatch(JOB_WORDS);
    }
    expect(fs.existsSync('src/components/ConnectorBanner.tsx')).toBe(false);
  });
});

// 261124 — 첫 사용자는 노무사다. 첫 화면은 「주소 복사 → 3단계 연결」만 펼치고,
// 도구별 카드와 명령줄·도구 이름·패키지 이름은 접은 칸(<details>) 안에 둔다.
describe('AI 연결 페이지 — 펼친 화면', () => {
  const html = renderToString(createElement(AiToolsPage)).replaceAll('<!-- -->', '');
  // <details> 안의 <summary> 는 접힌 채로도 보이므로 남기고, 그 밖의 접힌 내용만 지운다.
  const open = html.replace(/<details\b[^>]*>(<summary\b[\s\S]*?<\/summary>)?[\s\S]*?<\/details>/g, (_m, summary = '') => summary);
  const visible = open.replace(/<[^>]+>/g, ' ');

  it('h1 은 「AI 연결」이고, 접힌 칸 밖에 명령줄·도구 이름·패키지 이름이 없다', () => {
    expect(html).toMatch(/<h1[^>]*>AI 연결<\/h1>/);
    for (const word of ['list_required_forms', '--groups', 'k-labor', 'claude mcp add', 'npx', 'claude_desktop_config', 'MCP(Model Context Protocol)']) {
      expect(visible, word).not.toContain(word);
    }
    // 복사 칸의 원격 주소 둘만 펼친 화면에 남는다(그 주소를 붙이는 것이 연결이다)
    expect(visible.match(/vercel\.app/g) ?? []).toHaveLength(1);
  });

  it('도구별 카드와 개발자용 안내는 닫힌 채로 시작하고, 카드 주소(#id)는 그대로다', () => {
    const details = html.match(/<details\b[^>]*>/g) ?? [];
    expect(details.length).toBeGreaterThanOrEqual(2);
    for (const d of details) expect(d).not.toMatch(/\sopen(=|\s|>)/);
    expect(html).toContain('개발자용');
    for (const id of ['calc', 'sanjae-apply', 'safeclaw']) expect(html).toMatch(new RegExp(`<details[^>]*id="${id}"`));
    // 명령은 접힌 칸 안에 그대로 있다
    expect(html).toContain('claude mcp add --scope user k-labor');
  });

  // 261124 — /howto/* 는 public 정적 HTML 을 rewrite 로 여는 곳이라 Next 의 RSC 프리페치가 404 를 낸다.
  it('정적 사용 안내(/howto/*)는 Next 링크로 걸지 않는다', () => {
    const src = fs.readFileSync('src/app/ai-tools/page.tsx', 'utf8');
    expect(src).toMatch(/startsWith\('\/howto\/'\)/);
  });
});
