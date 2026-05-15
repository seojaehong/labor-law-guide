export type DecisionBucket = 'worker_win' | 'employer_win' | 'other';

export function bucketDecisionResult(result: string): DecisionBucket {
  if (['granted', 'partial', 'overturned', '전부인정', '일부인정'].includes(result)) return 'worker_win';
  if (['dismissed', 'rejected', 'upheld', '기각', '각하', '초심유지'].includes(result)) return 'employer_win';
  return 'other';
}
