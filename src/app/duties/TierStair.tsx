'use client';

// 규모가 커질 때 의무가 어떻게 쌓이는지 한눈에 보여 주는 계단 도식.
//
// 왜 그림이 필요한가 — 숫자만 보면 「22 → 30 → 32 → 34 → 36」이고, **5인을 넘는 순간 8개가
// 한꺼번에 생긴다**는 것이 안 보인다. 규모별 버튼의 작은 글씨로는 그 벽이 드러나지 않는다.
//
// 색은 CSS 변수로 받는다(duties.css). 테마가 바뀌어도 다시 그리지 않는다.
// 라이브러리를 더 쓰지 않는다 — 막대 다섯 개와 글자뿐이라 SVG 로 충분하다.
import { DUTIES, TIERS, type TierMin } from '@/content/duties-data';

const W = 680;
const H = 190;
const PAD = { top: 18, right: 14, bottom: 42, left: 14 };
const GAP = 10;

export default function TierStair({ tier, onPick }: { tier: TierMin; onPick: (t: TierMin) => void }) {
  const bars = TIERS.map((t, i) => {
    const total = DUTIES.filter(d => d.min <= t.min).length;
    const prev = i === 0 ? 0 : DUTIES.filter(d => d.min <= TIERS[i - 1].min).length;
    return { ...t, total, added: total - prev };
  });
  const max = Math.max(...bars.map(b => b.total));
  const plotH = H - PAD.top - PAD.bottom;
  const bw = (W - PAD.left - PAD.right - GAP * (bars.length - 1)) / bars.length;

  return (
    <figure className="ed-stair">
      <figcaption className="ed-eyebrow">규모가 커질 때 쌓이는 의무</figcaption>
      <div className="ed-stair-chart"><svg viewBox={`0 0 ${W} ${H}`} role="img" width="100%"
        aria-label={bars.map(b => `${b.label} ${b.total}개`).join(', ')}>
        {bars.map((b, i) => {
          const x = PAD.left + i * (bw + GAP);
          const h = Math.round((b.total / max) * plotH);
          const y = PAD.top + (plotH - h);
          const on = tier === b.min;
          const addedH = Math.round((b.added / max) * plotH);
          return (
            <g key={b.min} className={on ? 'on' : undefined} onClick={() => onPick(b.min)} style={{ cursor: 'pointer' }}>
              <rect className="base" x={x} y={y} width={bw} height={h} rx="4" />
              {/* 이 구간에서 **새로 생기는** 몫만 진하게 — 5인 벽이 여기서 드러난다 */}
              {b.added > 0 && <rect className="add" x={x} y={y} width={bw} height={addedH} rx="4" />}
              <text className="total" x={x + bw / 2} y={y - 6} textAnchor="middle">{b.total}</text>
              {b.added > 0 && i > 0 && (
                <text className="add-n" x={x + bw / 2} y={H - 5} textAnchor="middle">+{b.added}</text>
              )}
              <text className="label" x={x + bw / 2} y={H - PAD.bottom + 18} textAnchor="middle">{b.label}</text>
            </g>
          );
        })}
      </svg></div>
      <p className="ed-note" style={{ marginTop: 2 }}>
        막대를 누르면 그 규모로 바뀝니다. 진한 칸이 그 구간에서 <strong>새로 생기는</strong> 의무입니다.
      </p>
    </figure>
  );
}
