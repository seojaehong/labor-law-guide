'use client';

import { useState } from 'react';
import { REMOTE_CONNECTORS } from '@/content/ai-tools';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const ink = { color: 'var(--color-text-primary)' } as const;
const sub = { color: 'var(--color-text-secondary)' } as const;

const STEPS = [
  'Claude 앱에서 설정 → 커넥터를 엽니다.',
  '커스텀 커넥터 추가를 누르고 위 주소를 붙여 넣습니다.',
  'OAuth 칸은 비워 둔 채 추가합니다.',
];

function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState('done');
    } catch {
      setState('failed');
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`${label} 주소 복사`}
      className="min-h-[44px] shrink-0 rounded-lg px-4 text-sm font-semibold"
      style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent-ink, #fff)' }}
    >
      <span aria-live="polite">{state === 'done' ? '복사됨' : state === 'failed' ? '직접 복사' : '복사'}</span>
    </button>
  );
}

export default function ConnectGuide() {
  return (
    <section className="mt-6" aria-labelledby="connect">
      <h2 id="connect" className="t-h3 scroll-mt-24" style={ink}>Claude 앱에 연결하기</h2>
      <p className="mt-2 text-sm leading-7" style={sub}>설치와 토큰 없이 아래 주소만 붙여 넣으면 됩니다.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {REMOTE_CONNECTORS.map((c) => (
          <div
            key={c.id}
            className="min-w-0 rounded-2xl border p-4"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-surface)' }}
          >
            <p className="text-[15px] font-semibold" style={ink}>
              {c.title} <span className="text-sm font-normal" style={sub}>도구 {c.remoteTools}개</span>
            </p>
            <div className="mt-3 flex items-center gap-2">
              <code
                className="min-w-0 flex-1 select-all rounded-lg border px-3 py-2.5 text-[13px] leading-5 [overflow-wrap:anywhere]"
                style={{ fontFamily: MONO, borderColor: 'var(--color-border)', background: 'var(--color-bg-primary)', ...ink }}
              >
                {c.remote}
              </code>
              <CopyButton value={c.remote!} label={c.title} />
            </div>
          </div>
        ))}
      </div>
      <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm leading-7" style={ink}>
        {STEPS.map((s) => <li key={s}>{s}</li>)}
      </ol>
      <p className="mt-3 text-sm leading-7" style={sub}>
        입력은 서버로 전송되지만 저장하지 않습니다. 4대보험 신고서와 취업규칙 묶음은 원격 주소에 없어 아래 명령으로 PC에 연결합니다.
      </p>
    </section>
  );
}
