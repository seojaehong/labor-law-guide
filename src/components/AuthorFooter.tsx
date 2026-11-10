import { CONTACT_EMAIL } from '@/lib/site-contact';

// 261110 — 글 끝에 「누가 쓰고 확인했는가」를 둔다.
// 필자명이 「뉴스룸」·「위너스 에디터」 같은 데스크명이라 글이 매체처럼만 읽혔다.
// 사진은 넣지 않는다(재홍님 261110). 상담 유도 문구도 넣지 않는다 —
// 이 사이트는 개별 사안 접수 창구가 아니다(contact/page.tsx 주석 참조).
export default function AuthorFooter() {
  return (
    <section
      className="mt-12 pt-8"
      style={{ borderTop: '1px solid var(--color-border)' }}
      aria-labelledby="author-footer-heading"
    >
      <div
        className="rounded-xl border p-5"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}
      >
        <p
          id="author-footer-heading"
          className="text-[length:var(--text-xs)] font-bold tracking-wide"
          style={{ color: 'var(--color-accent)' }}
        >
          이 글을 쓰고 확인한 사람
        </p>
        <p
          className="mt-2 text-[16px] font-bold"
          style={{ color: 'var(--color-text-primary)' }}
        >
          공인노무사 서재홍
          <span
            className="ml-2 text-[13px] font-medium"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            노무법인 위너스
          </span>
        </p>
        <p
          className="mt-1.5 text-[13px] leading-relaxed"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          집단노동법·산업안전 자문과 노동위원회 사건 대리를 맡는다.
        </p>
        <p
          className="mt-3 text-[12px] leading-relaxed"
          style={{ color: 'var(--grey-700)' }}
        >
          본문의 조문 번호와 사실관계는 발행 전에 원문으로 확인한다.
          틀린 곳을 찾으면{' '}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="underline"
            style={{ color: 'var(--color-accent)' }}
          >
            {CONTACT_EMAIL}
          </a>
          로 알려 주면 고친다.
        </p>
      </div>
    </section>
  );
}
