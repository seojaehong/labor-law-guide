import { AlertTriangle, Info, Lightbulb } from 'lucide-react';

// 슬롯 4개(bg / 좌측선 / 아이콘 / 라벨)를 의미색 4역할에 그대로 매핑한다. DESIGN.md §9 P3-2.
// info는 -border가 없으므로(§6.6 — 참고 배너는 좌측선만 두고 테두리를 두지 않는다) 좌측선만 램프 --blue-200으로 남는다.
const variants = {
  info: { icon: Info, bg: 'var(--color-info-bg)', border: 'var(--blue-200)', iconColor: 'var(--color-info)', label: '참고', labelColor: 'var(--color-info-ink)' },
  warning: { icon: AlertTriangle, bg: 'var(--color-warn-bg)', border: 'var(--color-warn-border)', iconColor: 'var(--color-warn)', label: '주의', labelColor: 'var(--color-warn-ink)' },
  tip: { icon: Lightbulb, bg: 'var(--color-success-bg)', border: 'var(--color-success-border)', iconColor: 'var(--color-success)', label: '팁', labelColor: 'var(--color-success-ink)' },
};

interface Props {
  variant: 'info' | 'warning' | 'tip';
  text: string;
}

export default function CalloutBox({ variant, text }: Props) {
  const v = variants[variant];
  const Icon = v.icon;

  return (
    <div className="my-6 rounded-xl border-l-4 p-5" style={{ backgroundColor: v.bg, borderLeftColor: v.border }}>
      <div className="mb-2 flex items-center gap-2">
        <Icon size={16} style={{ color: v.iconColor }} />
        <span className="text-sm font-bold" style={{ color: v.labelColor }}>{v.label}</span>
      </div>
      <p className="text-[15px] leading-relaxed" style={{ color: 'var(--grey-700)' }}>{text}</p>
    </div>
  );
}
