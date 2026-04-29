import HolidayPayCalculator from '@/components/HolidayPayCalculator';
import Link from 'next/link';

export default function HolidayPayPage() {
  return (
    <div className="mx-auto max-w-[820px] px-5 py-10">
      <div className="mb-6">
        <Link
          href="/blog"
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← 블로그
        </Link>
      </div>
      <h1 className="mb-2 font-bold" style={{ fontSize: 'var(--text-2xl)', color: 'var(--grey-900)' }}>
        공휴일 수당 계산기
      </h1>
      <p className="mb-6 text-sm leading-relaxed" style={{ color: 'var(--grey-500)' }}>
        근로자의 날(5/1)·관공서 공휴일에 일하면 얼마를 더 받을 수 있는지 계산합니다.
        사업장 규모(5인 이상/미만), 근로 유형(월급제·일용직·시급제)에 따라 정확하게 산정합니다.
        <br />
        <span className="text-xs">
          ※ 산식 정확성: 근로기준법 제56조, 시행령 제30조, 행정해석 임금근로시간과-956(2026.4.) 등 반영
        </span>
      </p>

      <HolidayPayCalculator />

      <div className="mt-10 rounded-xl bg-slate-50 p-5 text-sm leading-relaxed">
        <div className="mb-2 font-semibold" style={{ color: '#334155' }}>
          📚 더 자세히 알아보기
        </div>
        <ul className="space-y-1.5" style={{ color: '#475569' }}>
          <li>
            <Link href="/blog/guide-20260428-04" className="text-yellow-700 hover:underline">
              [실무가이드] 노동절 수당 — 정규직·파트·일용직 사례별 완전 정복
            </Link>
          </li>
          <li>
            <Link href="/blog" className="text-yellow-700 hover:underline">
              노란봉투법 가이드 블로그
            </Link>
          </li>
        </ul>
      </div>

      <p className="mt-6 text-xs" style={{ color: '#94a3b8' }}>
        본 계산기는 참고용입니다. 정기상여·복지수당 등 통상임금 항목 분류는 사업장별 임금구성에 따라 달라질 수 있으며,
        분쟁 발생 시 노무사 상담을 권장합니다.
      </p>
    </div>
  );
}
