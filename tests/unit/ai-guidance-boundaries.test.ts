import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { AI_TOOLS } from '@/content/ai-tools';

const safeclaw = AI_TOOLS.find((tool) => tool.id === 'safeclaw')!;
const page = readFileSync('src/app/ai-tools/page.tsx', 'utf8');

describe('AI guidance: public connection and data boundaries', () => {
  // 261122 재홍님 — 일의 무늬는 SafeClaw 를 다른 MCP 처럼 「설치하고 연결」만 안내한다.
  // 토큰 발급·관리자 로그인은 SafeClaw 사이트가 맡는다(이 사이트에서 안내하지 않는다).
  it('guides SafeClaw like other MCPs: install and connect only, no token or admin login', () => {
    expect(safeclaw.install?.claudeCode).not.toMatch(/Bearer|Authorization|토큰/);
    expect(safeclaw.install).not.toHaveProperty('authenticatedClaudeCode');
    const card = [safeclaw.summary, ...safeclaw.does, safeclaw.privacy, ...safeclaw.links.map((l) => `${l.label} ${l.href}`)].join(' ');
    expect(card).not.toMatch(/토큰|로그인|Bearer|ai-connect/);
    expect(page).not.toMatch(/authenticatedClaudeCode|발급한 토큰|토큰 없이/);
  });

  it('limits public risk assessment to templates and keeps the transfer notice', () => {
    expect(safeclaw.does.join(' ')).toContain('기본 서식(template) 모드로만');
    expect(safeclaw.privacy).toContain('SafeClaw 서버로 전송');
    expect(safeclaw.privacy).toContain('AI 서비스에도 남을 수');
    expect(safeclaw.links.some((link) => link.href === 'https://www.safeclaw.kr')).toBe(true);
  });

  it('does not present a blanket no-storage guarantee across local and remote tools', () => {
    expect(page).not.toContain('입력한 값을 저장하지 않습니다.');
    expect(page).toContain('로컬 4대보험 서식 도구');
    expect(page).toContain('원격 MCP는 호출 입력을 해당 도구 서버로 전송');
    expect(page).not.toContain('SafeClaw의 인증된');
    expect(page).toContain('해당 PC의 보안 저장소');
  });
});
