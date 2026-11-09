// 브라우저에서 파일 받기 — 만든 바이트를 잠깐 주소로 만들어 내려받게 한다. 서버를 거치지 않는다.
// 근로계약서 작성(엑셀·한글·PDF)과 사업장 카드 파일이 함께 쓴다.

export function download(bytes: Uint8Array, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
