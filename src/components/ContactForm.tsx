'use client';

import { useState, type FormEvent } from 'react';
import { Send, CheckCircle } from 'lucide-react';

export default function ContactForm() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('https://formspree.io/f/mzdjpvzy', {
        method: 'POST',
        body: new FormData(e.currentTarget),
        headers: { Accept: 'application/json' },
      });

      if (res.ok) {
        setSubmitted(true);
      } else {
        setError('전송에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <CheckCircle size={48} style={{ color: 'var(--color-accent)' }} />
        <h2 className="text-xl font-bold">문의가 접수되었습니다</h2>
        <p style={{ color: 'var(--color-text-secondary)' }}>빠른 시일 내에 연락드리겠습니다.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Formspree에서 회신할 이메일 지정 */}
      <input type="hidden" name="_subject" value="[노란봉투법 가이드] 새 문의" />

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--grey-700)' }}>이름 *</label>
          <input name="name" required className="w-full rounded-lg border px-4 py-2.5 text-[15px] outline-none transition-colors focus:border-[var(--color-accent)]" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--grey-700)' }}>연락처 *</label>
          <input name="phone" required className="w-full rounded-lg border px-4 py-2.5 text-[15px] outline-none transition-colors focus:border-[var(--color-accent)]" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }} />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--grey-700)' }}>이메일</label>
        <input name="email" type="email" className="w-full rounded-lg border px-4 py-2.5 text-[15px] outline-none transition-colors focus:border-[var(--color-accent)]" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--grey-700)' }}>문의 유형</label>
        <select name="type" className="w-full rounded-lg border px-4 py-2.5 text-[15px] outline-none" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
          <option>사용자성 판단 상담</option>
          <option>교섭절차 자문</option>
          <option>단체교섭 대행</option>
          <option>노동쟁의 대응</option>
          <option>기타</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--grey-700)' }}>문의 내용 *</label>
        <textarea name="message" required rows={5} className="w-full rounded-lg border px-4 py-2.5 text-[15px] outline-none transition-colors focus:border-[var(--color-accent)]" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }} placeholder="문의하실 내용을 자세히 적어주세요." />
      </div>

      {error && <p className="text-sm" style={{ color: '#dc2626' }}>{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="flex items-center gap-2 rounded-lg px-6 py-3 font-medium text-white transition-colors"
        style={{ backgroundColor: loading ? 'var(--grey-400)' : 'var(--color-accent)' }}
      >
        <Send size={16} />
        {loading ? '전송 중...' : '문의하기'}
      </button>
    </form>
  );
}
