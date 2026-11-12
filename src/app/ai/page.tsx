import SourceFinder from './SourceFinder';

// 261112 — 종전 「AI 질의응답 & 참고자료」(채팅·FAQ DB·노란봉투법 용어사전 세 탭)를 「근거 자료 찾기」 한 화면으로 줄였다.
// FAQ 는 /faq, 용어는 /guide 등 주제 페이지에 그대로 있다.
export default function AIPage() {
  return <SourceFinder />;
}
