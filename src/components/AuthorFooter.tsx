import { CONTACT_EMAIL } from '@/lib/site-contact';

// 261110 — 글 끝에 「누가 쓰고 확인했는가」를 둔다.
// 필자명이 「뉴스룸」·「위너스 에디터」 같은 데스크명이라 글이 매체처럼만 읽혔다.
// 한 줄 소개는 경력 나열이 아니라 인사말이다(재홍님 261110). 마지막 문장이 글과 사람을
// 묶는다 — 「나는 이런 사람이다」가 아니라 「이 글이 왜 여기 있는가」를 말한다.
// 상담 유도는 아니다. 글의 출처를 밝히는 문장이라 contact 방침과 부딪히지 않는다.
// 이 블록만 습니다체다(재홍님 261110) — 본문은 평어 단정체지만 여기는 읽는 사람에게
// 직접 말을 거는 자리다. 사실 서술은 거리를 두고, 안내는 상대를 부른다.
// 사진은 넣지 않는다(재홍님 261110). 법인명도 넣지 않는다 — 사이트에서 「위너스」
// 표기를 전부 뺐다(0bbaf7b). 상담 유도 문구도 넣지 않는다 —
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
          ✍️ 이 글을 쓰고 확인한 사람
        </p>
        <p
          className="mt-2 text-[16px] font-bold"
          style={{ color: 'var(--color-text-primary)' }}
        >
          공인노무사 서재홍
        </p>
        <p
          className="mt-1.5 text-[13px] leading-relaxed"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          노동법을 다루는 일을 합니다. 근로기준법 자문부터 노사관계와 산업안전,
          노동위원회 사건 대리까지요. 이 글도 그 일을 하다 생긴 질문에서 나왔습니다.
        </p>
        <p
          className="mt-3 text-[12px] leading-relaxed"
          style={{ color: 'var(--grey-700)' }}
        >
          본문의 조문 번호와 사실관계는 발행 전에 원문으로 확인합니다.
          틀린 곳을 찾으시면{' '}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="underline"
            style={{ color: 'var(--color-accent)' }}
          >
            {CONTACT_EMAIL}
          </a>
          로 알려 주시면 고치겠습니다.
        </p>
      </div>
    </section>
  );
}
