// 사이트 상단 띠 배너의 닫힘 상태. 메모리 값이 기준이고 localStorage 는 다음 방문을 위한 보관이다.
// 저장소가 막힌 브라우저에서도 닫기를 누르면 그 화면에서는 사라져야 한다.
const KEY = 'connector-banner-dismissed';

let dismissed = false;
const listeners = new Set<() => void>();

export function getSnapshot(): boolean {
  if (dismissed) return true;
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

// 서버와 hydration 첫 렌더는 「보이는」 상태로 맞춘다(261112).
// 종전에는 숨긴 상태로 맞춰, 닫지 않은 방문자에게는 hydration 뒤 띠가 끼어들며 페이지 전체를 35px 밀었다
// (운영 실측 CLS 데스크톱 0.022 · 모바일 0.036). 닫은 사람은 layout.tsx <head> 의 선반영 스크립트가
// <html> 에 DISMISSED_CLASS 를 붙여 첫 페인트 전에 CSS 로 숨기고, hydration 직후 getSnapshot 이 띠를 걷는다.
export const STORAGE_KEY = KEY;
export const DISMISSED_CLASS = 'connector-banner-dismissed';
export function getServerSnapshot(): boolean {
  return false;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function dismissBanner(): void {
  dismissed = true;
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // 저장 실패는 다음 방문에 다시 보일 뿐이다.
  }
  listeners.forEach((l) => l());
}

export function shouldShowBanner(pathname: string, isDismissed: boolean): boolean {
  if (isDismissed) return false;
  return pathname !== '/ai-tools' && !pathname.startsWith('/ai-tools/');
}
