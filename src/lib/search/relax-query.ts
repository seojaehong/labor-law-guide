/**
 * 검색어 완화 (Query Relaxation)
 *
 * 문제: "부당전보"처럼 수식어가 붙은 복합어는 tsvector 토큰("부당전보")으로도,
 * 정규화된 AND 토큰("부당" & "전보")으로도 매칭되지 않아 zero-result가 난다.
 * DB에는 "전보처분", "전보명령"처럼 핵심어가 다른 복합어에 붙어 저장돼 있기 때문.
 *
 * 해결: 1차 검색이 0건이면 수식어를 떼어낸 핵심어("전보")로 한 번 더 검색한다.
 * 완화 검색은 0건일 때만 돌기 때문에 정상 질의의 정밀도/응답시간에는 영향이 없다.
 */

// 핵심어 앞에 자주 붙는 수식어 (긴 것부터 매칭)
const MODIFIER_PREFIXES = [
  '직장내',
  '부당한',
  '경영상',
  '업무상',
  '부당',
  '불법',
  '위법',
];

/**
 * 수식어를 떼어낸 핵심 검색어를 돌려준다.
 * 완화할 것이 없으면 null.
 *
 * "부당전보" → "전보", "부당 전보" → "전보", "직장내괴롭힘" → "괴롭힘"
 */
export function relaxLaborQuery(raw: string): string | null {
  const q = raw.trim().replace(/\s+/g, ' ');
  if (!q) return null;

  for (const prefix of MODIFIER_PREFIXES) {
    // 붙여쓰기("부당전보")와 띄어쓰기("부당 전보") 모두 처리
    for (const candidate of [prefix, `${prefix} `]) {
      if (!q.startsWith(candidate)) continue;
      const core = q.slice(candidate.length).trim();
      // 핵심어가 2자 미만이면 검색 의미가 없음 (API 최소 길이와 동일 기준)
      if (core.length >= 2 && core !== q) return core;
    }
  }

  return null;
}
