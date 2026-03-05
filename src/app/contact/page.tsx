import ContactForm from '@/components/ContactForm';
import { Mail, MapPin, ExternalLink } from 'lucide-react';

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-[900px] px-5 py-10">
      <h1 className="mb-2 font-bold" style={{ fontSize: 'var(--text-2xl)', color: 'var(--grey-900)' }}>
        전문가 상담 문의
      </h1>
      <p className="mb-10 text-sm" style={{ color: 'var(--grey-500)' }}>
        사용자성 판단, 교섭 대응, 노동쟁의 등 전문가의 자문이 필요하시면 문의해 주세요.
      </p>

      <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
        <ContactForm />

        <div className="space-y-6">
          <div className="rounded-2xl border p-6" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
            <h3 className="mb-4 font-bold" style={{ color: 'var(--grey-900)' }}>노무법인 위너스</h3>
            <div className="space-y-4">
              <div className="flex gap-3">
                <Mail size={18} style={{ color: 'var(--color-accent)' }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--grey-800)' }}>이메일</p>
                  <a href="mailto:abc@winhr.co.kr" className="text-sm hover:underline" style={{ color: 'var(--color-accent)' }}>abc@winhr.co.kr</a>
                </div>
              </div>
              <div className="flex gap-3">
                <MapPin size={18} style={{ color: 'var(--color-accent)' }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--grey-800)' }}>주소</p>
                  <p className="text-sm" style={{ color: 'var(--grey-500)' }}>서울시 서초구 나루터로 61, 402호(태승빌딩)</p>
                </div>
              </div>
              <div className="flex gap-3">
                <ExternalLink size={18} style={{ color: 'var(--color-accent)' }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--grey-800)' }}>홈페이지</p>
                  <a href="https://winhr.co.kr" target="_blank" rel="noopener noreferrer" className="text-sm hover:underline" style={{ color: 'var(--color-accent)' }}>winhr.co.kr</a>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl p-6" style={{ backgroundColor: 'var(--blue-50)' }}>
            <h3 className="mb-2 font-bold text-sm" style={{ color: 'var(--blue-700)' }}>상담 분야</h3>
            <ul className="space-y-1.5 text-sm" style={{ color: 'var(--blue-600)' }}>
              <li>• 사용자성 판단 자문</li>
              <li>• 교섭절차 대응 전략</li>
              <li>• 단체교섭 대행</li>
              <li>• 노동쟁의 대응</li>
              <li>• 부당노동행위 구제</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
