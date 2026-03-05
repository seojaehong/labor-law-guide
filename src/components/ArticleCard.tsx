import { Scale } from 'lucide-react';

interface Props {
  label: string;
  text: string;
}

export default function ArticleCard({ label, text }: Props) {
  return (
    <div className="my-6 rounded-xl border p-5" style={{ backgroundColor: 'var(--blue-50)', borderColor: 'var(--blue-100)' }}>
      <div className="mb-3 flex items-center gap-2">
        <Scale size={16} style={{ color: 'var(--blue-500)' }} />
        <span className="text-sm font-bold" style={{ color: 'var(--blue-700)' }}>{label}</span>
      </div>
      <p className="text-[15px] leading-relaxed" style={{ color: 'var(--grey-800)' }}>{text}</p>
    </div>
  );
}
