import type { Metadata } from 'next';
import Link from 'next/link';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import { AI_TOOLS, type AiTool } from '@/content/ai-tools';

export const metadata: Metadata = publicMetadata({
  title: 'AI 연결 도구(MCP) | Claude에 붙여 쓰는 4대보험·산재 서식 도구 | 일의 무늬',
  description:
    'Claude 같은 AI 도구에 MCP 로 연결해 쓰는 일의 무늬 도구 모음입니다. 산재 신청 서식 채우기, 4대보험 관할 지사 찾기와 건강보험 신고서 만들기를 대화로 씁니다.',
  keywords: ['MCP', 'Claude 연결 도구', '산재 신청 MCP', '4대보험 신고서 MCP', 'Claude Code MCP'],
  alternates: { canonical: `${SITE_URL}/ai-tools` },
  openGraph: {
    title: 'AI 연결 도구(MCP) | 일의 무늬',
    description: 'Claude 에 붙여 쓰는 4대보험·산재 서식 도구 모음.',
    url: `${SITE_URL}/ai-tools`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
});

const box = { border: '1px solid var(--color-border)', borderRadius: 8, padding: '20px 20px 16px' } as const;
const code = {
  display: 'block', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 13, lineHeight: 1.6, padding: '10px 12px', borderRadius: 6, background: 'var(--color-surface-subtle, rgba(127,127,127,.08))',
} as const;

function ToolCard({ t }: { t: AiTool }) {
  const ready = t.status === 'public';
  return (
    <article style={box} data-ai-tool={t.id}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="t-h4" style={{ color: 'var(--color-text-primary)', margin: 0 }}>{t.name}</h3>
        <span
          data-status={t.status}
          style={{
            fontSize: 12, padding: '2px 8px', borderRadius: 999,
            border: `1px solid ${ready ? 'var(--color-accent)' : 'var(--color-border)'}`,
            color: ready ? 'var(--color-accent-ink, var(--color-accent))' : 'var(--color-text-secondary)',
          }}
        >
          {ready ? '공개' : '공개 준비 중'}
        </span>
      </div>
      <p className="mt-3 text-sm leading-7" style={{ color: 'var(--color-text-primary)' }}>{t.summary}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-7" style={{ color: 'var(--color-text-secondary)' }}>
        {t.does.map((d) => <li key={d}>{d}</li>)}
      </ul>
      {t.install && (
        <div className="mt-4 space-y-2 text-sm">
          <p style={{ color: 'var(--color-text-primary)' }}>Claude Code 에서 한 줄로 연결</p>
          <code style={code}>{t.install.claudeCode}</code>
          {t.install.remote && (
            <>
              <p style={{ color: 'var(--color-text-primary)' }}>설치 없이 원격 주소로 연결(claude.ai 사용자 지정 커넥터)</p>
              <code style={code}>{t.install.remote}</code>
            </>
          )}
        </div>
      )}
      {!ready && (
        <p className="mt-4 text-sm leading-7" style={{ color: 'var(--color-text-secondary)' }}>
          설치판은 시험을 마친 뒤 공개합니다. 그 전에도 같은 서식을 웹 화면에서 바로 만들 수 있습니다.
        </p>
      )}
      <p className="mt-3 text-sm leading-7" style={{ color: 'var(--color-text-secondary)' }}>
        <strong style={{ color: 'var(--color-text-primary)' }}>개인정보</strong> · {t.privacy}
      </p>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {t.links.map((l) =>
          l.href.startsWith('/') ? (
            <Link key={l.href} href={l.href} className="underline" style={{ color: 'var(--color-accent-ink, var(--color-accent))' }}>{l.label}</Link>
          ) : (
            <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--color-accent-ink, var(--color-accent))' }}>{l.label}</a>
          ),
        )}
      </p>
    </article>
  );
}

export default function AiToolsPage() {
  return (
    <main className="layout-reading">
      <h1 className="t-h2" style={{ color: 'var(--color-text-primary)' }}>AI 연결 도구</h1>
      <p className="mt-4 text-sm leading-7" style={{ color: 'var(--color-text-secondary)' }}>
        Claude 같은 AI 도구에 붙여 쓰는 일의 무늬 도구 모음입니다. 연결해 두면 대화하면서 서식을 찾고 채울 수 있습니다.
        연결 방식은 MCP(Model Context Protocol)라는 공개 표준을 씁니다.
      </p>

      <section className="mt-8 space-y-4" aria-labelledby="list">
        <h2 id="list" className="t-h3" style={{ color: 'var(--color-text-primary)' }}>도구</h2>
        {AI_TOOLS.map((t) => <ToolCard key={t.id} t={t} />)}
      </section>

      <section className="mt-10 space-y-3 text-sm leading-7" aria-labelledby="how" style={{ color: 'var(--color-text-secondary)' }}>
        <h2 id="how" className="t-h3" style={{ color: 'var(--color-text-primary)' }}>연결하는 법</h2>
        <p>Node.js 20 이상이 설치된 PC 에서 아래처럼 연결합니다.</p>
        <p style={{ color: 'var(--color-text-primary)' }}>Claude Desktop — claude_desktop_config.json 에 추가</p>
        <code style={code}>{`{
  "mcpServers": {
    "sanjae-apply": { "command": "npx", "args": ["-y", "sanjae-apply", "mcp"] }
  }
}`}</code>
        <p>Windows 에서 npx 를 찾지 못하면 command 를 &quot;cmd&quot;, args 앞에 &quot;/c&quot; 를 넣어 감쌉니다.</p>
      </section>

      <section className="mt-10 space-y-2 text-sm leading-7" aria-labelledby="privacy" style={{ color: 'var(--color-text-secondary)' }}>
        <h2 id="privacy" className="t-h3" style={{ color: 'var(--color-text-primary)' }}>개인정보 원칙</h2>
        <p>AI 대화에 적은 내용은 그 AI 서비스의 대화 기록에 남습니다. 그래서 주민등록번호처럼 민감한 값은 대화창에 적지 않는 것을 기본으로 설계합니다.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>명단은 PC 안의 파일로 넘기고, 도구가 그 파일을 직접 읽습니다.</li>
          <li>도구 응답에는 주민등록번호를 싣지 않습니다.</li>
          <li>팩스·문자를 보내는 도구는 확인을 거친 뒤에만 보냅니다.</li>
        </ul>
      </section>

      <section className="mt-10 space-y-2 text-sm leading-7" aria-labelledby="not" style={{ color: 'var(--color-text-secondary)' }}>
        <h2 id="not" className="t-h3" style={{ color: 'var(--color-text-primary)' }}>하지 않는 일</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>신고와 제출은 사업주가 직접 합니다. 이 도구들은 서식을 찾고 채우는 일을 돕습니다.</li>
          <li>공단의 승인이나 처리 결과를 미리 말하지 않습니다.</li>
          <li>입력한 값을 저장하지 않습니다.</li>
        </ul>
      </section>

      <section className="mt-10 space-y-3 text-sm leading-7" aria-labelledby="faq" style={{ color: 'var(--color-text-secondary)' }}>
        <h2 id="faq" className="t-h3" style={{ color: 'var(--color-text-primary)' }}>자주 묻는 질문</h2>
        <p><strong style={{ color: 'var(--color-text-primary)' }}>AI 없이도 쓸 수 있나요?</strong><br />네. 같은 서식을 <Link href="/tools" className="underline">계산·점검 도구</Link> 화면에서 바로 만들 수 있습니다.</p>
        <p><strong style={{ color: 'var(--color-text-primary)' }}>요금이 있나요?</strong><br />연결과 서식 만들기는 무료입니다. 팩스·문자는 이용자 본인의 팝빌 계정 요금이 듭니다.</p>
        <p><strong style={{ color: 'var(--color-text-primary)' }}>어떤 AI 에서 되나요?</strong><br />MCP 를 지원하는 도구(Claude Code, Claude Desktop, claude.ai 사용자 지정 커넥터 등)에서 씁니다.</p>
      </section>
    </main>
  );
}
