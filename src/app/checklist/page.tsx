import ChecklistPageClient from '@/components/ChecklistPageClient';

export default function ChecklistPage() {
  return (
    <div className="mx-auto max-w-[800px] px-5 py-10">
      <h1 className="mb-2 font-bold" style={{ fontSize: 'var(--text-2xl)', color: 'var(--grey-900)' }}>
        자가진단 체크리스트
      </h1>
      <p className="mb-6 text-sm" style={{ color: 'var(--grey-500)' }}>
        개정 노동조합법에 따른 귀사의 교섭 의무와 사용자성을 자가진단해 보세요. (법적 판단이 아닌 참고용입니다)
      </p>
      <ChecklistPageClient />
    </div>
  );
}
