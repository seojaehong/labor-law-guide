/**
 * 실제 직원 파일 입력 게이트 — 법률·개인정보 검토 전까지 닫는다(합성 시연만).
 * 261124 도구 전수 검수(오푸스·페이블·아스트라 합의)에서 운영에 열려 있던 경로:
 * /tools/leave 엑셀 열기·명부 기억하기, 계약서 점검 파일 업로드(→ 외부 AI).
 * 열려면 NEXT_PUBLIC_REAL_FILE_INPUT=1 로 다시 배포한다 — 빌드 시점에 박히는 값이다.
 */
export const REAL_FILE_INPUT = process.env.NEXT_PUBLIC_REAL_FILE_INPUT === '1';
