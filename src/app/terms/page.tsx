import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '이용약관 | 노란봉투법 가이드',
  description: '노란봉투법 가이드 이용약관',
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 md:py-16">
      <h1 className="text-3xl font-bold tracking-tight">이용약관</h1>
      <p className="mt-4 text-sm text-gray-600">최종 업데이트: 2026-04-20</p>

      <section className="mt-8 space-y-4 text-sm leading-7 text-gray-800">
        <p>
          본 사이트는 노동법·판정례 관련 정보를 제공하기 위한 서비스입니다. 게시된 내용은 일반 정보 제공 목적이며,
          개별 사안에 대한 법률 자문을 대체하지 않습니다.
        </p>
        <p>
          사용자는 서비스를 법령 및 공서양속에 반하지 않는 범위에서 이용해야 하며,
          서비스 운영을 방해하는 행위를 해서는 안 됩니다.
        </p>
        <p>
          사이트 내 콘텐츠의 저작권은 별도 표기가 없는 한 운영자에게 있으며,
          사전 허가 없는 무단 복제·배포를 제한합니다.
        </p>
        <p>
          문의 및 상담은 <a className="underline" href="/contact">상담 문의 페이지</a>에서 접수할 수 있습니다.
        </p>
      </section>
    </main>
  );
}
