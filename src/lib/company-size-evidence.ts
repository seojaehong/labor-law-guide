/** Preserve explicitly stated headcount bounds; never turn an inequality into an exact count. */
export function companySizeEvidence(message: string): {
  company_size?: number;
  company_size_evidence?: { original: string; operator: 'eq' | 'lt' | 'lte' | 'gt' | 'gte' | 'range'; value: number; upper?: number };
} {
  const range = message.match(/(\d+)\s*[-~～]\s*(\d+)\s*(?:인|명)/);
  if (range) return { company_size_evidence: { original: range[0], operator: 'range', value: Number(range[1]), upper: Number(range[2]) } };
  const match = message.match(/(\d+)\s*(?:인|명)\s*(미만|이하|초과|이상)?/);
  if (!match) return {};
  const value = Number(match[1]);
  const operators: Record<string, 'lt' | 'lte' | 'gt' | 'gte'> = { 미만: 'lt', 이하: 'lte', 초과: 'gt', 이상: 'gte' };
  const operator = match[2] ? operators[match[2]] : 'eq';
  if (operator === 'eq' && !/(?:상시|근로자|직원|인원|회사|사업장|사업체).{0,20}$/.test(message.slice(0, match.index))) return {};
  return { ...(operator === 'eq' ? { company_size: value } : {}), company_size_evidence: { original: match[0].trim(), operator, value } };
}
