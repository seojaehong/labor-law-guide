export type DecisionBucket = 'worker_win' | 'employer_win' | 'other';

/**
 * decision_result → 누가 이겼나.
 *
 * ★ 2026-09-19 수정. 전에는 재심 결과(upheld/overturned)와 각하(rejected)까지
 * 승패로 단정했다. 셋 다 승패 정보가 아니다.
 *
 * - upheld(재심유지, 10,257건) — 재심이 초심을 "유지"했다는 뜻이다. 초심이 근로자 승이었으면
 *   근로자 승이다. 실측: id_26765 「징계사유 일부 인정되나 양정이 과하여 해고와 정직은 부당」이
 *   upheld 라서 사용자 승 카드에 들어가고 있었다.
 * - overturned(재심취소, 2,030건) — 거울상으로 같다. 실측: id_56185 「해고가 정당하다고 판정한 사례」가
 *   근로자 승 카드에 들어가고 있었다.
 * - rejected(각하, 4,356건) — 본안을 안 봤다. 신청기간 3개월 도과, 상시 5명 미만, 연락 두절,
 *   보정요구 불응 등. 사용자가 이긴 게 아니라 판단을 하지 않은 것이다.
 *
 * 셋을 합치면 종전 「사용자 승」 41,365건 중 14,613건(35.3%)이 오분류였다.
 *
 * **초심 결과를 연결하기 전까지 재심 사건은 승패를 말하지 않는다.** other 로 두면
 * 비교 카드에 쓰이지 않는다 — 틀린 인용보다 빈칸이 낫다.
 * (초심-재심 연결은 별건. 지노위 사건번호가 위원회별 독립 채번이라 번호만으로는 사건을 특정하지 못한다.)
 */
export function bucketDecisionResult(result: string): DecisionBucket {
  if (['granted', 'partial', '전부인정', '일부인정'].includes(result)) return 'worker_win';
  if (['dismissed', '기각'].includes(result)) return 'employer_win';
  return 'other';
}
