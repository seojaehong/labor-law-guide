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

// 서버와 hydration 첫 렌더는 숨긴 상태로 맞춘다. 닫은 사람에게 잠깐 보이지 않게 하는 쪽을 택했다.
export function getServerSnapshot(): boolean {
  return true;
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
