/**
 * 첫 유입 경로를 세션에 한 번만 잡아 둔다 (2026-10-04 신설).
 *
 * 왜 폼 제출 시점의 document.referrer 를 쓰지 않나.
 * 사람은 보통 홈 → 글 → 구독 순으로 움직인다. 그 시점의 referrer 는 **우리 페이지**다.
 * 그걸 저장하면 「어디서 들어왔나」가 아니라 「우리 사이트 어느 페이지에서 눌렀나」가 되고,
 * 그건 이미 source 컬럼(home-bottom·article-footer)이 하고 있다.
 *
 * 그래서 **세션의 첫 페이지 로드에서** referrer 와 utm 을 잡아 sessionStorage 에 넣고,
 * 구독 폼은 그것을 보낸다. 외부에서 들어온 그 한 번만 기록된다.
 *
 * sessionStorage 는 탭 단위다. 사생활 보호 모드나 차단 설정에서 던질 수 있으므로
 * 읽기·쓰기를 모두 try/catch 로 감싼다. 실패하면 null 을 보낸다 — 수집보다 동작이 우선이다.
 */
const KEY = 'ye_first_touch_v1';

export type FirstTouch = {
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
};

const EMPTY: FirstTouch = { referrer: null, utm_source: null, utm_medium: null, utm_campaign: null };

/** 세션 첫 로드에서 호출한다. 이미 있으면 덮어쓰지 않는다. */
export function captureFirstTouch(): void {
  if (typeof window === 'undefined') return;
  try {
    if (sessionStorage.getItem(KEY)) return;
    const p = new URLSearchParams(window.location.search);
    const ref = document.referrer || '';
    // 우리 도메인에서 온 것은 유입이 아니다 — 내부 이동이다.
    const external = ref && !ref.includes(window.location.host) ? ref.slice(0, 500) : null;
    const v: FirstTouch = {
      referrer: external,
      utm_source: p.get('utm_source')?.slice(0, 120) || null,
      utm_medium: p.get('utm_medium')?.slice(0, 120) || null,
      utm_campaign: p.get('utm_campaign')?.slice(0, 120) || null,
    };
    sessionStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* 저장 못 하면 그냥 둔다 */
  }
}

export function readFirstTouch(): FirstTouch {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<FirstTouch>) };
  } catch {
    return EMPTY;
  }
}
