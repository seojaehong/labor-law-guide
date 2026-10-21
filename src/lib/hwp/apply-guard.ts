// 「내 파일에 반영」을 켤 수 있는지 — 점검한 글자가 파일에서 뽑은 글자 그대로일 때만.
// 본문 칸을 손대면 점검 결과가 파일과 어긋나므로 반영을 끈다. rhwp 를 부르지 않아 첫 화면 묶음에 넣어도 가볍다.
export interface ApplySource {
  text: string;
}

export function canApplyText(src: ApplySource | null, text: string): boolean {
  return !!src && src.text === text;
}
