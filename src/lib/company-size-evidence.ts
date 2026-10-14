export type CompanySizeEvidence = {
  original: string;
  operator: 'eq' | 'lt' | 'lte' | 'gt' | 'gte' | 'range' | 'approx';
  value: number;
  upper?: number;
  kind: 'regular_workers' | 'employees' | 'business_threshold';
  scope: 'employer';
};
/** Accept explicit employer-wide headcounts only. Ambiguous actors, corrections and subgroups abstain. */
export function companySizeEvidence(message: string): {
  company_size?: number;
  company_size_evidence?: CompanySizeEvidence;
} {
  // Multiple quantities or a negated quantity need interpretation; do not select the first number.
  if (/아니|않|제외|말고|정정/.test(message)) return {};
  const counts = [...message.matchAll(/\d+(?:\s*[-~～]\s*\d+)?\s*(?:인|명)/g)];
  if (counts.length !== 1) return {};
  const clause = message.split(/[.!?\n,]/).find(text => /\d+\s*(?:인|명)/.test(text))?.trim();
  if (!clause || /징계\s*대상|피해|가해|팀원|팀\s*인원|부서|조합원|해고\s*대상|참석|신고자/.test(clause)) return {};
  const count = clause.match(/(\d+)(?:\s*[-~～]\s*(\d+))?\s*(인|명)\s*(미만|이하|초과|이상)?\s*(정도|가량|쯤|내외)?/);
  if (!count || count.index === undefined) return {};
  const before = clause.slice(0, count.index);
  const after = clause.slice(count.index + count[0].length).trim();
  const scope = /회사|사업장|사업체|기업/.test(before) || /^(?:인\s*)?(?:사업장|사업체|회사)/.test(after);
  if (!scope) return {};
  // A counted employee who did something is an actor count, not a workforce statement.
  if (after && !/^(?:입니다|이다|이에요|예요|이어요|이고|이며|인\s*(?:사업장|회사)|사업장|사업체|회사|으로|이다$)/.test(after)) return {};
  const kind: CompanySizeEvidence['kind'] = /상시\s*(?:근로자|직원|인원)/.test(before)
    ? 'regular_workers' : /직원|근로자/.test(before) ? 'employees' : /사업장|사업체|회사/.test(after) ? 'business_threshold' : 'employees';
  // A company mention alone does not establish what the quantity counts.
  if (kind === 'employees' && !/직원|근로자/.test(before)) return {};
  const value = Number(count[1]);
  const upper = count[2] ? Number(count[2]) : undefined;
  if (upper !== undefined && upper < value) return {};
  const approximate = !!count[5] || /(?:약|대략|한)\s*$/.test(before);
  const operators: Record<string, 'lt' | 'lte' | 'gt' | 'gte'> = { 미만:'lt', 이하:'lte', 초과:'gt', 이상:'gte' };
  const operator = approximate ? 'approx' : upper !== undefined ? 'range' : count[4] ? operators[count[4]] : 'eq';
  // Approximate ranges are not collapsed to a guessed midpoint; preserve both supplied endpoints.
  return {
    ...(operator === 'eq' && kind === 'regular_workers' ? { company_size:value } : {}),
    company_size_evidence: { original:clause, operator, value, ...(upper !== undefined ? {upper} : {}), kind, scope:'employer' },
  };
}

export type CompanySizeUnresolved = { original: string; reason: string };
/** A correction to the employer workforce topic invalidates an earlier value even when no new exact count is known. */
export function companySizeDelta(message: string): ReturnType<typeof companySizeEvidence> & { company_size_unresolved?: CompanySizeUnresolved } {
  const evidence = companySizeEvidence(message);
  if (evidence.company_size_evidence) return evidence;
  const workforceTopic = /(?:상시\s*근로자|직원\s*(?:은|수)|근로자\s*(?:는|수)|(?:회사|사업장|사업체).{0,15}(?:직원|근로자|인원))/.test(message);
  const correction = /아니|말고|정정|잘못|수정/.test(message) && /\d+\s*(?:인|명)/.test(message);
  const subgroup = /징계\s*대상|피해|가해|팀원|팀\s*인원|부서|조합원|해고\s*대상|참석|신고자/.test(message);
  if (workforceTopic && correction && !subgroup) {
    return { company_size_unresolved: { original: message, reason: '이전 인원 정보의 정정이 명시됐으나 회사 전체 상시근로자수와 정확한 범위는 확인되지 않음' } };
  }
  return {};
}
