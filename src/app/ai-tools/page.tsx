import type { Metadata } from 'next';
import Link from 'next/link';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import { AI_TOOLS, type AiTool } from '@/content/ai-tools';

export const metadata: Metadata = publicMetadata({
  title: 'AI 연결 도구(MCP) | Claude에 붙여 쓰는 노동 업무 도구 | 일의 무늬',
  description:
    'Claude 같은 AI 도구에 MCP 로 연결해 쓰는 일의 무늬 도구 모음입니다. 산재 신청 서식 채우기, 4대보험 신고서, 근로계약서, 임금·연차·세금 계산, 취업규칙 점검을 대화로 씁니다.',
  keywords: ['MCP', 'Claude 연결 도구', '산재 신청 MCP', '4대보험 신고서 MCP', 'Claude Code MCP', 'k-labor', '노동 계산기 MCP', '취업규칙 MCP'],
  alternates: { canonical: `${SITE_URL}/ai-tools` },
  openGraph: {
    title: 'AI 연결 도구(MCP) | 일의 무늬',
    description: 'Claude 에 붙여 쓰는 산재·4대보험·계산기·취업규칙 도구 모음.',
    url: `${SITE_URL}/ai-tools`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
});

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const ink = { color: 'var(--color-text-primary)' } as const;
const sub = { color: 'var(--color-text-secondary)' } as const;
const link = { color: 'var(--color-accent-ink, var(--color-accent))' } as const;

function Code({ children }: { children: string }) {
  return (
    <pre
      className="whitespace-pre-wrap rounded-lg border px-4 py-3 text-[13px] leading-6 [overflow-wrap:anywhere]"
      style={{ fontFamily: MONO, borderColor: 'var(--color-border)', background: 'var(--color-bg-primary)', ...ink }}
    >
      <code>{children}</code>
    </pre>
  );
}

/** 첫 화면 — 실제 산재 신청 도우미 응답(요양급여·출퇴근·제3자 없음·치료 중)을 줄여 옮겼다 */
function ChatExample() {
  return (
    <figure
      className="rounded-2xl border p-5 sm:p-6"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-surface)' }}
      aria-label="대화 예시"
    >
      <figcaption className="mb-4 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
        연결한 뒤 대화창에서
      </figcaption>
      <p
        className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-6"
        style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent-ink, #fff)' }}
      >
        출근길에 넘어져서 다쳤어요. 아직 치료 중이고 다른 사람 잘못은 아니에요. 요양급여 신청하려면 뭐가 필요해요?
      </p>
      <p className="mt-4 text-xs leading-5" style={sub}>
        <span aria-hidden className="mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: 'var(--color-success)' }} />
        산재 신청 도우미가 <span style={{ fontFamily: MONO }}>list_required_forms</span> 를 실행했습니다
      </p>
      <div className="mt-3 space-y-3 text-sm leading-6" style={ink}>
        <p>출퇴근 재해 요양급여는 아래 서식이 필요합니다.</p>
        <ul className="space-y-1.5">
          {[
            ['요양급여 신청서', '별지 제2호'],
            ['요양급여 신청 소견서', '별지 제3호, 의료기관 의사 작성'],
            ['출퇴근재해 발생신고서', '신청서 합본'],
          ].map(([t, n]) => (
            <li key={t} className="flex gap-2">
              <span aria-hidden style={{ color: 'var(--color-accent)' }}>✓</span>
              <span>
                {t} <span style={sub}>({n})</span>
              </span>
            </li>
          ))}
        </ul>
        <p style={sub}>
          아직 없는 첨부: 의무기록지·영상 CD, 출퇴근 사고 증빙(119 구급활동일지·목격자 확인서 등).
          근거는 산업재해보상보험법 제37조제1항제3호, 제41조제1항입니다.
        </p>
      </div>
    </figure>
  );
}

function ToolCard({ t }: { t: AiTool }) {
  const ready = t.status === 'public';
  return (
    <article
      className="flex flex-col rounded-2xl border p-6"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-surface)' }}
      data-ai-tool={t.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="t-h4" style={{ ...ink, margin: 0 }}>{t.name}</h3>
        <span
          data-status={t.status}
          className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
          style={
            ready
              ? { background: 'var(--color-success-bg)', color: 'var(--color-success-ink)' }
              : { background: 'var(--grey-100)', color: 'var(--color-text-secondary)' }
          }
        >
          {ready ? '공개' : '공개 준비 중'}
        </span>
      </div>
      <p className="mt-3 text-[15px] leading-7" style={ink}>{t.summary}</p>
      <ul className="mt-3 space-y-1.5 text-sm leading-6" style={sub}>
        {t.does.map((d) => (
          <li key={d} className="flex gap-2">
            <span aria-hidden style={{ color: 'var(--color-accent)' }}>✓</span>
            <span>{d}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex-1 space-y-3 text-sm">
        {t.download && (
          <>
            <a
              href={t.download.href}
              className="inline-block rounded-lg px-4 py-2.5 font-semibold"
              style={{ background: 'var(--color-accent)', color: 'var(--color-bg-surface)' }}
              rel="noopener"
            >
              {t.download.label}
            </a>
            <p className="leading-6" style={sub}>
              <strong style={ink}>필요한 것</strong> {t.download.requires}
            </p>
            {t.download.note && <p className="leading-6" style={sub}>{t.download.note}</p>}
          </>
        )}
        {t.install ? (
          <>
            <p className="font-semibold" style={ink}>Claude Code 에서 한 줄로 연결</p>
            <Code>{t.install.claudeCode}</Code>
            {t.install.remote && (
              <>
                <p className="font-semibold" style={ink}>설치 없이 원격 주소로 연결</p>
                <Code>{t.install.remote}</Code>
              </>
            )}
          </>
        ) : t.download ? null : (
          <p className="rounded-lg px-4 py-3 leading-6" style={{ background: 'var(--color-bg-primary)', ...sub }}>
            설치판은 시험을 마친 뒤 공개합니다. 그 전에도 같은 서식을 웹 화면에서 바로 만들 수 있습니다.
          </p>
        )}
      </div>

      <div className="mt-5 border-t pt-4 text-sm leading-6" style={{ borderColor: 'var(--color-border)', ...sub }}>
        <p>
          <strong style={ink}>개인정보</strong>
          <br />
          {t.privacy}
        </p>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {t.links.map((l) =>
            l.href.startsWith('/') ? (
              <Link key={l.href} href={l.href} className="underline underline-offset-4" style={link}>{l.label}</Link>
            ) : (
              <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4" style={link}>{l.label}</a>
            ),
          )}
        </p>
      </div>
    </article>
  );
}

const ROUTES: { name: string; where: string; code: string }[] = [
  {
    name: 'Claude Code',
    where: '터미널에서 한 줄을 실행합니다.',
    code: 'claude mcp add --scope user sanjae-apply -- npx -y sanjae-apply mcp',
  },
  {
    name: 'Claude Desktop',
    where: '설정 파일 claude_desktop_config.json 에 추가하고 앱을 다시 엽니다. Windows 에서 npx 를 찾지 못하면 command 를 "cmd", args 앞에 "/c" 를 넣어 감쌉니다.',
    code: `{
  "mcpServers": {
    "sanjae-apply": { "command": "npx", "args": ["-y", "sanjae-apply", "mcp"] }
  }
}`,
  },
  {
    name: 'claude.ai',
    where: '설정 → 커넥터 → 사용자 지정 커넥터 추가에 원격 주소를 넣습니다. 설치가 필요 없습니다.',
    code: 'https://sanjae-apply.vercel.app/api/mcp/mcp',
  },
];

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: 'AI 없이도 쓸 수 있나요?',
    a: (
      <>
        네. 같은 서식을 <Link href="/tools" className="underline underline-offset-4" style={link}>계산·점검 도구</Link> 화면에서 바로 만들 수 있습니다.
      </>
    ),
  },
  { q: '요금이 있나요?', a: '연결과 서식 만들기는 무료입니다. 팩스·문자는 이용자 본인의 팝빌 계정 요금이 듭니다.' },
  { q: '어떤 AI 에서 되나요?', a: 'MCP 를 지원하는 도구에서 씁니다. Claude Code, Claude Desktop, claude.ai 사용자 지정 커넥터 등입니다.' },
];

export default function AiToolsPage() {
  return (
    <div className="layout-tool">
      {/* 첫 화면 — 설명 + 대화 예시 */}
      <section className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-12">
        <div>
          <h1 className="t-h2" style={ink}>AI 연결 도구</h1>
          <p className="mt-4 text-[17px] leading-8" style={ink}>
            Claude 같은 AI 에 일의 무늬 도구를 붙여 두면, 대화하면서 필요한 서식을 찾고 채울 수 있습니다.
          </p>
          <p className="mt-3 text-sm leading-7" style={sub}>
            연결은 MCP(Model Context Protocol)라는 공개 표준으로 합니다. 도구는 정해진 일만 하고,
            주민등록번호 같은 값은 대화창을 거치지 않게 설계합니다.
          </p>
          <p className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <a href="#list" className="font-semibold underline underline-offset-4" style={link}>도구 보기</a>
            <a href="#how" className="font-semibold underline underline-offset-4" style={link}>연결하는 법</a>
          </p>
        </div>
        <ChatExample />
      </section>

      {/* 도구 */}
      <section className="mt-16" aria-labelledby="list">
        <h2 id="list" className="t-h3 scroll-mt-24" style={ink}>도구</h2>
        <p className="mt-2 text-sm leading-7" style={sub}>
          4대보험·근로계약서·계산기·점검·취업규칙 묶음은 노동 업무 도구(k-labor) 한 패키지입니다. 카드의 명령은 그 묶음만 켜고, <code style={{ fontFamily: MONO }}>--groups</code> 를 빼면 전부 켭니다.
        </p>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {AI_TOOLS.map((t) => <ToolCard key={t.id} t={t} />)}
        </div>
      </section>

      {/* 연결하는 법 — 쓰는 AI 에 따라 한 가지만 고른다 */}
      <section className="mt-16" aria-labelledby="how">
        <h2 id="how" className="t-h3 scroll-mt-24" style={ink}>연결하는 법</h2>
        <p className="mt-2 text-sm leading-7" style={sub}>
          쓰는 AI 에 맞춰 하나만 고르면 됩니다. 설치형은 Node.js 20 이상이 필요합니다. 아래는 산재 신청 도우미 예시입니다.
        </p>
        <div className="mt-5 divide-y rounded-2xl border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-surface)' }}>
          {ROUTES.map((r) => (
            <div key={r.name} className="grid gap-3 p-5 md:grid-cols-[18rem_minmax(0,1fr)] md:gap-8 md:p-6" style={{ borderColor: 'var(--color-border)' }}>
              <div>
                <h3 className="text-base font-semibold" style={ink}>{r.name}</h3>
                <p className="mt-1 text-sm leading-6" style={sub}>{r.where}</p>
              </div>
              <Code>{r.code}</Code>
            </div>
          ))}
        </div>
      </section>

      {/* 원칙 두 가지 — 나란히 */}
      <section className="mt-16 grid gap-10 md:grid-cols-2">
        <div aria-labelledby="privacy">
          <h2 id="privacy" className="t-h3" style={ink}>개인정보 원칙</h2>
          <p className="mt-3 text-sm leading-7" style={sub}>
            AI 대화에 적은 내용은 그 AI 서비스의 대화 기록에 남습니다. 그래서 주민등록번호처럼 민감한 값은
            대화창에 적지 않는 것을 기본으로 설계합니다.
          </p>
          <ul className="mt-3 space-y-2 text-sm leading-6" style={sub}>
            <li className="flex gap-2"><span aria-hidden style={{ color: 'var(--color-accent)' }}>✓</span>명단은 PC 안의 파일로 넘기고, 도구가 그 파일을 직접 읽습니다.</li>
            <li className="flex gap-2"><span aria-hidden style={{ color: 'var(--color-accent)' }}>✓</span>도구 응답에는 주민등록번호를 싣지 않습니다.</li>
            <li className="flex gap-2"><span aria-hidden style={{ color: 'var(--color-accent)' }}>✓</span>팩스·문자를 보내는 도구는 확인을 거친 뒤에만 보냅니다.</li>
          </ul>
        </div>
        <div aria-labelledby="not">
          <h2 id="not" className="t-h3" style={ink}>하지 않는 일</h2>
          <ul className="mt-3 space-y-2 text-sm leading-6" style={sub}>
            <li className="flex gap-2"><span aria-hidden style={{ color: 'var(--color-text-tertiary)' }}>✕</span>신고와 제출은 사업주가 직접 합니다. 이 도구들은 서식을 찾고 채우는 일을 돕습니다.</li>
            <li className="flex gap-2"><span aria-hidden style={{ color: 'var(--color-text-tertiary)' }}>✕</span>공단의 승인이나 처리 결과를 미리 말하지 않습니다.</li>
            <li className="flex gap-2"><span aria-hidden style={{ color: 'var(--color-text-tertiary)' }}>✕</span>입력한 값을 저장하지 않습니다.</li>
          </ul>
        </div>
      </section>

      {/* 자주 묻는 질문 */}
      <section className="mt-16" aria-labelledby="faq">
        <h2 id="faq" className="t-h3" style={ink}>자주 묻는 질문</h2>
        <dl className="mt-5 grid gap-6 md:grid-cols-3">
          {FAQ.map((f) => (
            <div key={f.q} className="border-t pt-4" style={{ borderColor: 'var(--color-border)' }}>
              <dt className="text-[15px] font-semibold" style={ink}>{f.q}</dt>
              <dd className="mt-2 text-sm leading-7" style={sub}>{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
