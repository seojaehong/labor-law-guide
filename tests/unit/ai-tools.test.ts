import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { AI_PACKAGES, AI_TOOLS, serverCard } from '@/content/ai-tools';
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

  it('산재 신청 도우미와 k-labor 묶음은 공개 — k-labor 카드는 자기 묶음만 켜는 명령을 싣는다', () => {
    expect(AI_TOOLS.find((t) => t.id === 'sanjae-apply')?.status).toBe('public');
    const groups: Record<string, string> = {
      'insurance-forms': 'nhis',
      contract: 'contract',
      calc: 'calc',
      'leave-tax': 'leave,tax',
      checks: 'calc,duties',
      'work-rules': 'work-rules',
    };
    for (const [id, g] of Object.entries(groups)) {
      const t = AI_TOOLS.find((x) => x.id === id);
      expect(t?.status, id).toBe('public');
      expect(t?.install?.claudeCode, id).toMatch(new RegExp(`npx -y k-labor mcp --groups ${g}$`));
    }
    // 묶음 이름은 패키지 server.mjs 의 GROUPS 와 같아야 한다
    const server = fs.readFileSync('tools/k-labor/server.mjs', 'utf8');
    for (const g of new Set(Object.values(groups).flatMap((s) => s.split(',')))) expect(server, g).toMatch(new RegExp(`\\n\\s+'?${g}'?: \\{ register`));
  });

  it('문구에 금지어가 없다', () => {
    const text = JSON.stringify(AI_TOOLS);
    expect(bannedHits(text)).toEqual([]);
    // 행정사법 — 제출을 맡는 말
    expect(text).not.toMatch(/대신|대행|대리/);
  });

  // 등재 단위는 카드가 아니라 패키지다. 이름·설치 명령·server.json·카드 파일이 ai-tools.ts 와 갈라지지 않게 한다.
  it('MCP 카드는 패키지에 매달리고 설치 명령이 그 패키지를 부른다', () => {
    for (const t of AI_TOOLS) {
      if (!t.install) continue;
      const p = AI_PACKAGES.find((x) => x.id === t.package);
      expect(p, t.id).toBeDefined();
      expect(t.install.claudeCode, t.id).toContain(`npx -y ${p!.npm} mcp`);
      expect(t.install.remote, t.id).toBe(p!.remote);
    }
    for (const p of AI_PACKAGES) expect(AI_TOOLS.some((t) => t.package === p.id), p.id).toBe(true);
  });

  it('k-labor 의 package.json·server.json 이 목록과 같다', () => {
    const p = AI_PACKAGES.find((x) => x.id === 'k-labor')!;
    const pkg = JSON.parse(fs.readFileSync('tools/k-labor/package.json', 'utf8'));
    const srv = JSON.parse(fs.readFileSync('tools/k-labor/server.json', 'utf8'));
    expect(pkg.name).toBe(p.npm);
    expect(pkg.mcpName).toBe(p.mcpName);
    expect(srv.name).toBe(p.mcpName);
    expect(srv.repository).toEqual({ url: p.repo, source: 'github', subfolder: 'tools/k-labor' });
    expect(srv.description.length).toBeLessThanOrEqual(100);
    // 버전은 package.json 이 정본 — server.json 두 곳이 따라간다
    expect(srv.version).toBe(pkg.version);
    expect(fs.readFileSync('tools/k-labor/server.mjs', 'utf8')).toContain(`const VERSION = '${pkg.version}';`);
    expect(srv.packages).toHaveLength(1);
    expect(srv.packages[0]).toMatchObject({ registryType: 'npm', identifier: p.npm, version: pkg.version, transport: { type: 'stdio' } });
    expect(srv.remotes).toBeUndefined();
  });

  it('server-card.json 은 목록에서 만든 것과 같다', () => {
    const file = JSON.parse(fs.readFileSync('public/.well-known/mcp/server-card.json', 'utf8'));
    expect(file).toEqual(serverCard());
    expect(bannedHits(JSON.stringify(file))).toEqual([]);
  });

  it('llms.txt 가 AI 연결 도구 안내를 가리키고, k-labor 안내에 게시 전 문구가 남지 않았다', () => {
    expect(fs.readFileSync('public/llms.txt', 'utf8')).toContain('https://yellowenvelope.kr/ai-tools');
    expect(fs.readFileSync('tools/k-labor/README.md', 'utf8')).not.toMatch(/아직 npm 에 올리지/);
  });

  // AI 가 사이트를 읽는 입구(llms.txt·agent-card·WebMCP)도 화면과 같은 말을 쓴다 — 「AI 상담」「자가진단」은 화면에서 이미 뺐다.
  it('AI 입구 파일에 금지어와 옛 도메인이 없다', () => {
    const files = [
      'public/llms.txt', 'public/llms-full.txt', 'public/.well-known/agent-card.json', 'public/.well-known/agent-skills/index.json',
      'public/.well-known/agent-skills/labor-law-guide/SKILL.md', 'public/.well-known/agent-skills/case-search/SKILL.md',
    ];
    for (const f of files) {
      const s = fs.readFileSync(f, 'utf8');
      expect(bannedHits(s), f).toEqual([]);
      expect(s, f).not.toMatch(/xn--o80bk8isxeinax68f/);
    }
    const card = JSON.parse(fs.readFileSync('public/.well-known/agent-card.json', 'utf8'));
    expect(card.url).toBe('https://yellowenvelope.kr');
    expect(card.supportedInterfaces).toBeUndefined();
    expect(card.skills.map((s: { id: string }) => s.id)).not.toContain('ai-consultation');
  });

  it('public/.well-known 어디에도 옛 도메인이 없고, next.config 가 광고하는 파일은 실제로 있다', () => {
    for (const e of fs.readdirSync('public/.well-known', { recursive: true, withFileTypes: true })) {
      if (!e.isFile()) continue;
      const f = `${e.parentPath}/${e.name}`;
      expect(fs.readFileSync(f, 'utf8'), f).not.toMatch(/xn--o80bk8isxeinax68f/);
    }
    const config = fs.readFileSync('next.config.ts', 'utf8');
    const advertised = [...config.matchAll(/\/\.well-known\/[\w./-]+/g)].map((m) => m[0]);
    expect(advertised.length).toBeGreaterThan(0);
    for (const p of advertised) expect(fs.existsSync(`public${p.replace(/\/$/, '')}`), p).toBe(true);
  });

  it('WebMCP 도구 등록에 금지어가 없고 옛 「ai-consultation」 이름을 쓰지 않는다', () => {
    const layout = fs.readFileSync('src/app/layout.tsx', 'utf8');
    const block = layout.match(/id="webmcp-init"[\s\S]*?<\/Script>/)?.[0] ?? '';
    expect(block).toContain('provideContext');
    expect(bannedHits(block)).toEqual([]);
    expect(block).not.toContain('ai-consultation');
  });

  it('사이트맵에 들어간다', () => {
    const src = fs.readFileSync('src/app/sitemap/[id]/route.ts', 'utf8');
    expect(src).toContain('${SITE_URL}/ai-tools`');
  });
});
