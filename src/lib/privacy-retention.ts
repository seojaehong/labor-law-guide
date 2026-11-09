// 처리방침 2절 보유기간. 삭제 작업(api/cron/retention)이 같은 값을 쓴다 — 한쪽만 바꾸지 말 것.
// days: 기준 시각부터 지울 때까지의 일수. table 이 없는 항목은 DB 밖(메일함)이라 손으로 지운다.
export const RETENTION = [
  { item: 'AI 질문 기록(질문 앞부분 500자, 세션 ID, IP 해시)', period: '90일', table: 'chat_logs', days: 90 },
  { item: '대화 중 정리된 상황 정보(사업장 규모·근속·월급 등)', period: '마지막 대화 후 7일', table: 'user_situation', days: 7 },
  { item: '하루 이용 한도 기록(IP 해시)', period: '7일', table: 'chat_rate_limit', days: 7 },
  { item: '취업규칙 점검 기록(동의한 경우 본문 포함)', period: '1년', table: 'work_rules_precise_runs', days: 365 },
  { item: '소식지 구독 정보(이메일, 동의 문구, 유입 경로)', period: '구독 해지 후 30일(인증하지 않은 신청은 신청 후 30일)', table: 'subscribers', days: 30 },
  { item: '소식지 발송·수신 기록', period: '1년', table: 'subscriber_sends·email_events', days: 365 },
  { item: '문의 메일', period: '처리 후 1년', table: null, days: 365 },
] as const;
