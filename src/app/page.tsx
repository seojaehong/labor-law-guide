'use client';

import Link from 'next/link';
import { ArrowRight, Scale, Users, FileText, MessageSquare, Shield, ClipboardCheck } from 'lucide-react';
import { motion } from 'framer-motion';

const features = [
  {
    icon: Users,
    title: '사용자 범위 확대',
    description: '근로계약 당사자가 아니더라도 근로조건을 실질적·구체적으로 지배·결정하는 자는 사용자로 인정',
    href: '/guide#employer-scope',
    color: 'var(--blue-500)',
    bg: 'var(--blue-50)',
  },
  {
    icon: Scale,
    title: '노동쟁의 범위 확대',
    description: '계약외사용자와의 분쟁도 노동쟁의에 포함. 원청에 대한 쟁의행위 정당성 근거 마련',
    href: '/guide#labor-dispute',
    color: '#8b5cf6',
    bg: '#f5f3ff',
  },
  {
    icon: ClipboardCheck,
    title: '교섭 의무 자가진단',
    description: '하청이 교섭을 요구했을 때, 우리가 응해야 하는지 체크리스트로 자가진단',
    href: '/checklist',
    color: '#dc2626',
    bg: '#fef2f2',
  },
  {
    icon: FileText,
    title: '교섭절차 가이드',
    description: '교섭요구부터 단체교섭까지 6단계 절차를 스텝 다이어그램으로 한눈에 파악',
    href: '/manual',
    color: '#059669',
    bg: '#ecfdf5',
  },
];

export default function Home() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden px-5 py-20 text-center md:py-32">
        <motion.div
          className="mx-auto max-w-3xl"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <div
            className="mb-4 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm"
            style={{ borderColor: 'var(--blue-200)', backgroundColor: 'var(--blue-50)', color: 'var(--blue-600)' }}
          >
            <Shield size={14} />
            2026.3.10. 시행
          </div>
          <h1 className="mb-6 font-bold tracking-tight" style={{ fontSize: 'var(--text-hero)', lineHeight: 1.1, color: 'var(--grey-900)' }}>
            노란봉투법,<br />
            <span style={{ color: 'var(--color-accent)' }}>무엇이 달라졌나?</span>
          </h1>
          <p className="mx-auto mb-10 max-w-xl" style={{ fontSize: 'var(--text-lg)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            개정 노동조합법의 핵심 변화를 해석지침과 교섭절차 매뉴얼 기반으로 정리했습니다. AI 상담으로 궁금한 점을 바로 해결하세요.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/guide"
              className="flex items-center gap-2 rounded-lg px-6 py-3 font-medium text-white transition-transform hover:scale-105"
              style={{ backgroundColor: 'var(--color-accent)' }}
            >
              해석지침 보기 <ArrowRight size={16} />
            </Link>
            <Link
              href="/ai"
              className="flex items-center gap-2 rounded-lg border px-6 py-3 font-medium transition-transform hover:scale-105"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            >
              <MessageSquare size={16} />
              AI에게 질문하기
            </Link>
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section className="px-5 pb-20">
        <motion.div
          className="mx-auto grid max-w-[1100px] gap-6 md:grid-cols-3"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }}
        >
          {features.map((f) => (
            <motion.div
              key={f.title}
              variants={{ hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } } }}
            >
            <Link href={f.href} className="feature-card block rounded-2xl border bg-white p-7" style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl" style={{ backgroundColor: f.bg }}>
                <f.icon size={22} style={{ color: f.color }} />
              </div>
              <h3 className="mb-2 text-lg font-bold" style={{ color: 'var(--grey-900)' }}>{f.title}</h3>
              <p className="text-[15px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{f.description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium" style={{ color: 'var(--color-accent)' }}>
                자세히 보기 <ArrowRight size={14} />
              </span>
            </Link>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* AI Preview */}
      <section className="px-5 pb-20">
        <div className="mx-auto max-w-[700px] rounded-2xl border p-8 text-center" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)', boxShadow: 'var(--shadow-md)' }}>
          <MessageSquare size={32} className="mx-auto mb-4" style={{ color: 'var(--color-accent)' }} />
          <h2 className="mb-2 text-xl font-bold" style={{ color: 'var(--grey-900)' }}>AI에게 노동법 질문하기</h2>
          <p className="mb-6 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            개정 노동조합법에 대한 궁금증을 AI가 즉시 답변해 드립니다
          </p>
          <Link
            href="/ai"
            className="inline-flex items-center gap-2 rounded-lg px-6 py-3 font-medium text-white"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            AI 상담 시작하기 <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="px-5 pb-20">
        <div className="mx-auto max-w-[700px] rounded-2xl p-8 text-center" style={{ backgroundColor: 'var(--grey-900)' }}>
          <h2 className="mb-3 text-xl font-bold text-white">노무법인 위너스와 상담하세요</h2>
          <p className="mb-6 text-sm text-white/70">
            사용자성 판단, 교섭 대응, 노동쟁의 등 노사관계 전문가가 직접 자문합니다.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 rounded-lg px-6 py-3 font-medium"
            style={{ backgroundColor: 'white', color: 'var(--grey-900)' }}
          >
            상담 문의하기 <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  );
}
