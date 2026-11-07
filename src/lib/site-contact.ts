// 사이트 연락 창구 하나(261105). 화면·메타·메일이 모두 이 값을 쓴다.
// public/ 정적 파일(llms.txt·.well-known 등)은 import 할 수 없어 같은 주소를 글자로 적는다.
// 이 파일은 다른 모듈을 import 하지 않는다 — tests/leave-source 가 별칭 없이 상대경로로 읽는다.
export const CONTACT_EMAIL = 'hello@yellowenvelope.kr';
