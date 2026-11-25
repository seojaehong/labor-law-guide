import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { publicMetadata } from '@/lib/public-metadata';
import { SITE_URL } from '@/lib/constants';
import { AI_TOOLS, type AiTool } from '@/content/ai-tools';
import ConnectGuide from './ConnectGuide';

// 261124 — 이름을 「AI 연결」 하나로 맞췄다(종전 AI 연결 도구·AI 도구·연결 도구·AI에 연결해서 쓰기).
export const metadata: Metadata = publicMetadata({
  title: 'AI 연결(MCP) | Claude에 붙여 쓰는 노동 업무 도구 | 일의 무늬',
  description:
    'Claude 같은 AI 에 MCP 로 연결해 쓰는 일의 무늬 도구 모음입니다. 산재 신청 서식 채우기, 4대보험 신고서, 근로계약서, 임금·연차·세금 계산, 취업규칙 점검을 대화로 씁니다.',
  keywords: ['MCP', 'Claude 연결 도구', '산재 신청 MCP', '4대보험 신고서 MCP', 'Claude Code MCP', 'k-labor', '노동 계산기 MCP', '취업규칙 MCP'],
  alternates: { canonical: `${SITE_URL}/ai-tools` },
  openGraph: {
    title: 'AI 연결(MCP) | 일의 무늬',
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
const box = { borderColor: 'var(--color-border)', background: 'var(--color-bg-surface)' } as const;
// <summary> 기본 삼각형을 지우고 오른쪽 꺾쇠로 바꾼다. 터치 영역은 44px 이상.
const SUMMARY = 'flex min-h-[44px] cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden';

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

function Chevron() {
  return <ChevronDown size={20} aria-hidden="true" className="mt-0.5 shrink-0 transition-transform group-open:rotate-180" style={sub} />;
}

/** 연결한 뒤의 모습 — 실제 산재 신청 도우미 응답(요양급여·출퇴근·제3자 없음·치료 중)을 줄여 옮겼다 */
function ChatExample() {
  return (
    <figure className="max-w-2xl rounded-2xl border p-5 sm:p-6" style={box} aria-label="대화 예시">
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
        산재 신청 도우미가 필요한 서식을 찾았습니다
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

/** 도구별 안내 — 닫힌 채 시작한다. 설치 명령은 맨 아래 「개발자용」에 모았다(261124). */
function ToolCard({ t }: { t: AiTool }) {
  const ready = t.status === 'public';
  // 261112 — 홈에서 카드로 바로 보낼 수 있게 id 앵커를 붙였다(`/ai-tools#calc`). 닫힌 카드의 제목 줄로 떨어진다.
  return (
    <details className="group rounded-2xl border scroll-mt-24" style={box} data-ai-tool={t.id} id={t.id}>
      <summary className={`${SUMMARY} p-5`}>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
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
          </span>
          <span className="mt-2 block text-[15px] leading-7" style={ink}>{t.summary}</span>
        </span>
        <Chevron />
      </summary>

      <div className="border-t px-5 pb-5 pt-4 text-sm leading-6" style={{ borderColor: 'var(--color-border)', ...sub }}>
        <ul className="space-y-1.5">
          {t.does.map((d) => (
            <li key={d} className="flex gap-2">
              <span aria-hidden style={{ color: 'var(--color-accent)' }}>✓</span>
              <span>{d}</span>
            </li>
          ))}
        </ul>

        {t.download && (
          <div className="mt-5 space-y-3">
            <a
              href={t.download.href}
              className="inline-flex min-h-[44px] items-center rounded-lg px-4 font-semibold"
              style={{ background: 'var(--color-accent)', color: 'var(--color-bg-surface)' }}
              rel="noopener"
            >
              {t.download.label}
            </a>
            <p>
              <strong style={ink}>필요한 것</strong> {t.download.requires}
            </p>
            {t.download.note && <p>{t.download.note}</p>}
          </div>
        )}
        {!t.install && !t.download && (
          <p className="mt-5 rounded-lg px-4 py-3" style={{ background: 'var(--color-bg-primary)' }}>
            설치판은 시험을 마친 뒤 공개합니다. 그 전에도 같은 서식을 웹 화면에서 바로 만들 수 있습니다.
          </p>
        )}

        <p className="mt-5">
          <strong style={ink}>개인정보</strong>
          <br />
          {t.privacy}
        </p>
        <p className="mt-3 flex flex-wrap gap-x-4">
          {t.links.map((l) =>
            // /howto/* 는 public 정적 HTML 을 rewrite 로 여는 곳이다. Next 링크로 걸면 RSC 프리페치가 404 를 낸다(261124).
            l.href.startsWith('/') && !l.href.startsWith('/howto/') ? (
              <Link key={l.href} href={l.href} className="inline-flex min-h-[44px] items-center underline underline-offset-4" style={link}>{l.label}</Link>
            ) : l.href.startsWith('/howto/') ? (
              <a key={l.href} href={l.href} className="inline-flex min-h-[44px] items-center underline underline-offset-4" style={link}>{l.label}</a>
            ) : (
              <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center underline underline-offset-4" style={link}>{l.label}</a>
            ),
          )}
        </p>
      </div>
    </details>
  );
}

const ROUTES: { name: string; where: string; code: string }[] = [
  {
    name: 'Claude Code',
    where: '터미널에서 한 줄을 실행합니다.',
    code: 'claude mcp add --scope user sanjae-apply "--" npx -y sanjae-apply mcp',
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
    where: '설정 → 커넥터 → 커스텀 커넥터 추가에 원격 주소를 넣습니다. 설치가 필요 없습니다.',
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
  { q: '어떤 AI 에서 되나요?', a: 'MCP 를 지원하는 도구에서 씁니다. Claude Code, Claude Desktop, claude.ai 커스텀 커넥터 등입니다.' },
];

/** 개발자용 — 명령줄·패키지 이름·설정 파일. 닫힌 채 시작한다(261124, 첫 사용자는 실무자). */
function DeveloperGuide() {
  const installable = AI_TOOLS.filter((t) => t.install);
  return (
    <details id="how" className="group mt-16 rounded-2xl border scroll-mt-24" style={box}>
      <summary className={`${SUMMARY} p-5`}>
        <span>
          <h2 className="t-h3" style={{ ...ink, margin: 0 }}>개발자용 — 설치 명령과 설정</h2>
          <span className="mt-1 block text-sm leading-6" style={sub}>터미널·설정 파일로 연결하거나 PC 설치판이 필요할 때 엽니다.</span>
        </span>
        <Chevron />
      </summary>
      <div className="space-y-8 border-t px-5 pb-6 pt-5" style={{ borderColor: 'var(--color-border)' }}>
        <div className="space-y-2 text-sm leading-7" style={sub}>
          <p>
            연결은 MCP(Model Context Protocol)라는 공개 표준으로 합니다. 설치형은 Node.js 20 이상이 필요합니다.
          </p>
          <p>
            4대보험·근로계약서·계산기·점검·취업규칙 묶음은 노동 업무 도구(k-labor) 한 패키지입니다. 아래 명령은 그 묶음만 켜고,{' '}
            <code style={{ fontFamily: MONO }}>--groups</code> 를 빼면 전부 켭니다. 4대보험 신고서와 취업규칙 묶음은 원격 주소에 없어 PC 설치판으로만 씁니다.
          </p>
        </div>

        <section aria-labelledby="dev-install">
          <h3 id="dev-install" className="text-base font-semibold" style={ink}>도구별 Claude Code 명령</h3>
          <div className="mt-3 divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {installable.map((t) => (
              <div key={t.id} className="grid gap-2 py-4 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-6" style={{ borderColor: 'var(--color-border)' }}>
                <p className="text-sm font-semibold" style={ink}>{t.name}</p>
                <div className="min-w-0 space-y-2">
                  <Code>{t.install!.claudeCode}</Code>
                  {t.install!.remote && (
                    <>
                      <p className="text-xs" style={sub}>설치 없이 원격 주소로 연결</p>
                      <Code>{t.install!.remote}</Code>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="dev-routes">
          <h3 id="dev-routes" className="text-base font-semibold" style={ink}>AI 별 연결 방법</h3>
          <p className="mt-1 text-sm leading-7" style={sub}>쓰는 AI 에 맞춰 하나만 고르면 됩니다. 아래는 산재 신청 도우미 예시입니다.</p>
          <div className="mt-3 divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {ROUTES.map((r) => (
              <div key={r.name} className="grid gap-2 py-4 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-6" style={{ borderColor: 'var(--color-border)' }}>
                <div>
                  <p className="text-sm font-semibold" style={ink}>{r.name}</p>
                  <p className="mt-1 text-sm leading-6" style={sub}>{r.where}</p>
                </div>
                <Code>{r.code}</Code>
              </div>
            ))}
          </div>
        </section>
      </div>
    </details>
  );
}

export default function AiToolsPage() {
  return (
    <div className="layout-tool">
      <h1 className="t-h2" style={ink}>AI 연결</h1>
      <p className="mt-3 max-w-[62ch] text-[15px] leading-7" style={sub}>
        쓰시는 Claude 에 주소를 붙여 두면, 대화하면서 계산·점검을 하고 필요한 서식을 찾아 채웁니다.
      </p>
      <ConnectGuide />

      {/* 연결한 뒤의 모습 */}
      <section className="mt-14" aria-label="연결한 뒤의 대화 예시">
        <ChatExample />
      </section>

      {/* 도구별 안내 — 카드는 닫혀 있다 */}
      <section className="mt-14" aria-labelledby="list">
        <h2 id="list" className="t-h3 scroll-mt-24" style={ink}>도구별 안내</h2>
        <p className="mt-2 text-sm leading-7" style={sub}>
          눌러서 하는 일, 개인정보 처리, 웹에서 쓰는 같은 도구를 봅니다.
        </p>
        <div className="mt-5 grid items-start gap-3 md:grid-cols-2">
          {AI_TOOLS.map((t) => <ToolCard key={t.id} t={t} />)}
        </div>
      </section>

      {/* 원칙 두 가지 — 나란히 */}
      <section className="mt-14 grid gap-10 md:grid-cols-2">
        <div aria-labelledby="privacy">
          <h2 id="privacy" className="t-h3" style={ink}>개인정보 원칙</h2>
          <p className="mt-3 text-sm leading-7" style={sub}>
            AI 대화에 적은 내용은 그 AI 서비스의 대화 기록에 남을 수 있습니다. 주민등록번호처럼 민감한 값은
            대화창에 적지 마세요. 도구별 안내의 개인정보 항목과 사용하는 AI 서비스의 설정을 함께 확인하세요.
          </p>
          <ul className="mt-3 space-y-2 text-sm leading-6" style={sub}>
            <li className="flex gap-2"><span aria-hidden style={{ color: 'var(--color-accent)' }}>✓</span>로컬 4대보험 서식 도구의 명단은 PC 안의 파일로 전달합니다. 파일을 AI 대화에 첨부하는 방식과는 다릅니다.</li>
            <li className="flex gap-2"><span aria-hidden style={{ color: 'var(--color-accent)' }}>✓</span>원격 MCP는 호출 입력을 해당 도구 서버로 전송합니다. 로컬 설치 방식과 전송 범위가 다릅니다.</li>
            <li className="flex gap-2"><span aria-hidden style={{ color: 'var(--color-accent)' }}>✓</span>공단 로그인 프로그램은 인증 정보를 해당 PC의 보안 저장소에 보관합니다.</li>
          </ul>
        </div>
        <div aria-labelledby="not">
          <h2 id="not" className="t-h3" style={ink}>하지 않는 일</h2>
          <ul className="mt-3 space-y-2 text-sm leading-6" style={sub}>
            <li className="flex gap-2"><span aria-hidden style={{ color: 'var(--color-text-tertiary)' }}>✕</span>신고와 제출은 사업주가 직접 합니다. 이 도구들은 서식을 찾고 채우는 일을 돕습니다.</li>
            <li className="flex gap-2"><span aria-hidden style={{ color: 'var(--color-text-tertiary)' }}>✕</span>공단의 승인이나 처리 결과를 미리 말하지 않습니다.</li>
            <li className="flex gap-2"><span aria-hidden style={{ color: 'var(--color-text-tertiary)' }}>✕</span>AI 응답만으로 법적 결론을 확정하지 않습니다. 제출·사용 전에 근거와 내용을 확인하세요.</li>
          </ul>
        </div>
      </section>

      {/* 자주 묻는 질문 */}
      <section className="mt-14" aria-labelledby="faq">
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

      <DeveloperGuide />
    </div>
  );
}
