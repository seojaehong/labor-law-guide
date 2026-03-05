import { AlertTriangle, Info, Lightbulb } from 'lucide-react';

const variants = {
  info: { icon: Info, bg: 'var(--blue-50)', border: 'var(--blue-200)', iconColor: 'var(--blue-500)', label: '참고', labelColor: 'var(--blue-700)' },
  warning: { icon: AlertTriangle, bg: '#fef3c7', border: '#fde68a', iconColor: '#d97706', label: '주의', labelColor: '#92400e' },
  tip: { icon: Lightbulb, bg: '#f0fdf4', border: '#bbf7d0', iconColor: '#16a34a', label: '팁', labelColor: '#166534' },
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
