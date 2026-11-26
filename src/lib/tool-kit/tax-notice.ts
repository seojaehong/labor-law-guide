// 세금 계산 도구 결과 고지(261126 재홍님 결정 D4).
// 이 도구가 하는 일(참고용 계산)과 원천징수·신고를 하는 사람(원천징수의무자 = 회사)만 밝힌다. 「대신·대행·대리·세무대리」는 쓰지 않는다.
// 실수령·퇴직소득세·일용근로소득·중도퇴사 정산이 함께 쓰고, MCP(calc_take_home_pay·calc_daily_worker_tax·calc_midyear_settlement)는 copy 의 NOTICE 로 받는다.
// 3.3% 점검은 1년 소득을 다시 계산하는 사람이 본인이라 문장이 다르다(contractor-check/copy.ts NOTICE).
export const WITHHOLDING_NOTICE = '참고용 계산이며, 원천징수와 신고는 회사(원천징수의무자)가 합니다.';
