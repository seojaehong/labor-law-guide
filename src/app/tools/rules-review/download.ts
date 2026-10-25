// 브라우저에서 파일 받기 — 만든 Blob 을 잠깐 주소로 만들어 내려받게 한다
import { kstToday } from '@/lib/rules-review/workspace';
export function download(name: string, data: Blob | Uint8Array, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** 파일 이름에 쓸 수 없는 글자를 뺀다 */
export const safeName = (s: string) => s.replace(/[\\/:*?"<>|]/g, '_').trim() || '기관';

export const today = () => kstToday().replace(/-/g, '');
