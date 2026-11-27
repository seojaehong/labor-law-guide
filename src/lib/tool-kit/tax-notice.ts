// 세금 계산 도구 결과 고지(261126 재홍님 결정 D4).
// 이 도구가 하는 일(참고용 계산)과 원천징수·신고를 하는 사람(원천징수의무자 = 회사)만 밝힌다. 「대신·대행·대리·세무대리」는 쓰지 않는다.
// 실수령·일용근로소득·중도퇴사 정산이 함께 쓰고, MCP(calc_take_home_pay·calc_daily_worker_tax·calc_midyear_settlement)는 copy 의 NOTICE 로 받는다.
// 3.3% 점검은 1년 소득을 다시 계산하는 사람이 본인이라 문장이 다르다(contractor-check/copy.ts NOTICE).
export const WITHHOLDING_NOTICE = '참고용 계산이며, 원천징수와 신고는 회사(원천징수의무자)가 합니다.';
// 퇴직소득세(261127 재홍님 결정 F1) — IRP 로 옮기면 지급 때 떼지 않고(소득세법 제146조제2항) 나중에 연금계좌에서 찾을 때
// 연금계좌취급자(금융회사)가 뗀다. 그래서 「회사가 원천징수·신고」 공통 문구 대신 받는 방법별로 쓴다. 웹 결과 블록과 MCP calc_retirement_tax 가 함께 쓴다.
export const RETIREMENT_TAX_NOTICE = '참고용 계산이며, 퇴직금을 현금으로 받으면 회사가 원천징수합니다. IRP로 옮기면 나중에 연금계좌에서 찾을 때 금융회사가 뗍니다.';
