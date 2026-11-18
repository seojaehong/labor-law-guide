import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { AI_TOOLS } from '@/content/ai-tools';

const safeclaw = AI_TOOLS.find((tool) => tool.id === 'safeclaw')!;
const page = readFileSync('src/app/ai-tools/page.tsx', 'utf8');

describe('AI guidance: public connection and data boundaries', () => {
  it('keeps the public command credential-free and the authenticated command separate', () => {
    expect(safeclaw.install?.claudeCode).not.toMatch(/Bearer|Authorization|토큰/);
    expect(safeclaw.install?.authenticatedClaudeCode).toContain('Authorization: Bearer <발급받은_토큰>');
    expect(page).toContain('t.install.authenticatedClaudeCode');
    expect(page).toContain('공개 도구: 토큰 없이');
    expect(page).toContain('현장 작업: 발급한 토큰');
  });

  it('limits public risk assessment to templates and separates site persistence', () => {
    expect(safeclaw.does.join(' ')).toContain('기본 서식(template) 모드로만');
    expect(safeclaw.does.join(' ')).toContain('토큰 필요');
    expect(safeclaw.privacy).toContain('SafeClaw 서버로 전송');
    expect(safeclaw.privacy).toContain('해당 현장에 저장');
    expect(safeclaw.privacy).toContain('AI 서비스에도 남을 수');
    expect(safeclaw.links.some((link) => link.href.endsWith('/settings/ai-connect'))).toBe(true);
  });

  it('does not present a blanket no-storage guarantee across local and remote tools', () => {
    expect(page).not.toContain('입력한 값을 저장하지 않습니다.');
    expect(page).toContain('로컬 4대보험 서식 도구');
    expect(page).toContain('원격 MCP는 호출 입력을 해당 도구 서버로 전송');
    expect(page).toContain('SafeClaw의 인증된 문서 묶음 작업은 결과를 현장에 저장');
    expect(page).toContain('해당 PC의 보안 저장소');
  });
});
