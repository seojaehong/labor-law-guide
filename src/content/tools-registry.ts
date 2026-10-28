// 계산·점검 도구 등록부. /tools 목록과 사이트맵이 여기서 읽는다.
// 메타데이터만 둔다 — 페이지·컴포넌트를 import 하지 않는다(사이트맵 라우트가 가볍게 읽도록).
// 새 도구는 여기 한 줄을 더한다. 빠뜨리면 tests/unit/tools-registry.test.ts 가 막는다.

export type ToolIcon = 'calculator' | 'coins' | 'file-check';

export interface ToolEntry {
  href: string;
  title: string;
  desc: string;
  badge: string;
  icon: ToolIcon;
  /** public/ 의 정적 HTML — Link 대신 a 로 연다 */
  external?: boolean;
  /** 사이트맵에 싣는 값. 없으면 싣지 않는다(목록에만 보인다) */
  sitemap?: { lastModified: string; changeFrequency: 'daily' | 'weekly' | 'monthly'; priority: number };
}

export const TOOLS: ToolEntry[] = [
  { href: '/duties', title: '사업장 규모별 사업주 의무', desc: '상시 근로자 수(5인 미만~50인 이상)를 고르면 지켜야 할 노동법 의무와 법정 의무교육, 위반 시 제재를 조문 기준으로 보여줍니다. 규모가 커질 때 새로 생기는 의무도 함께 봅니다.', badge: '기준 정리', icon: 'file-check',
    sitemap: { lastModified: '2026-10-21', changeFrequency: 'monthly', priority: 0.9 } },
  { href: '/tools/headcount', title: '상시 근로자 수 계산기', desc: '지금 직원 수와 더 쓸 사람의 기간을 넣으면 언제부터 언제까지 5인 이상 사업장인지, 연차가 생기는지 바로 보여줍니다. 계산은 시행령 제7조의2 방식(전 1개월 연인원 ÷ 가동 일수)입니다.', badge: '브라우저 계산', icon: 'calculator',
    sitemap: { lastModified: '2026-10-28', changeFrequency: 'monthly', priority: 0.9 } },
  { href: '/tools/leave', title: '연차휴가 계산기', desc: '입사일 기준 발생일수를 계산하고 대장과 대조합니다. 엑셀·붙여넣기 입력과 결과 내려받기를 지원합니다.', badge: '브라우저 계산', icon: 'calculator',
    sitemap: { lastModified: '2026-09-01', changeFrequency: 'monthly', priority: 0.85 } },
  // 연차 도구의 하위 둘은 제목과 쓰임이 따로다 — 묶어서 /tools/leave 하나로만 올리면 그 말로 찾는 사람이 못 온다.
  { href: '/tools/leave/advanced', title: '연차 사용촉진', desc: '1년 이상·미만 연차의 촉구·통보 기간을 구분해 확인합니다. 실제 기록과 날짜만 대조하며 적법성을 판정하지 않습니다.', badge: '일정 대조', icon: 'file-check',
    sitemap: { lastModified: '2026-09-01', changeFrequency: 'monthly', priority: 0.8 } },
  { href: '/tools/leave/settlement', title: '퇴직 연차 정산', desc: '회계연도 실제 부여 누계와 입사일 기준 누계를 비교합니다. 발생일수·사용분·수당 지급분을 구분해 입력합니다.', badge: '참고 계산', icon: 'calculator',
    sitemap: { lastModified: '2026-09-01', changeFrequency: 'monthly', priority: 0.8 } },
  { href: '/tools/pay-check', title: '월급 대조', desc: '중도입사·중도퇴사·결근 공제·시급제 주휴 중 예외 하나를 골라, 확인한 값과 회사 문서의 계산 기준으로 명세서 금액을 대조합니다. 기준이 없으면 회사에 물어볼 문장을 정리합니다.', badge: '브라우저 대조', icon: 'calculator',
    sitemap: { lastModified: '2026-09-01', changeFrequency: 'monthly', priority: 0.85 } },
  { href: '/tools/hwp', title: '한글 문서 열기·고치기', desc: '한글 프로그램 없이 hwp·hwpx 파일을 브라우저에서 열어 쪽 모양으로 보고, 글자를 찾아 바꾼 뒤 hwp 또는 hwpx 로 내려받습니다.', badge: '브라우저 처리', icon: 'file-check',
    sitemap: { lastModified: '2026-10-21', changeFrequency: 'monthly', priority: 0.8 } },
  { href: '/hwp-editor', title: '한글 문서 편집기', desc: 'hwp·hwpx 문서를 브라우저에서 열어 쪽 모양 그대로 글자를 고치고 hwpx 또는 hwp 로 내려받습니다. 원본 파일은 바뀌지 않습니다.', badge: '브라우저 편집', icon: 'file-check',
    sitemap: { lastModified: '2026-10-21', changeFrequency: 'monthly', priority: 0.8 } },
  { href: '/tools/work-rules', title: '취업규칙 점검', desc: '취업규칙 텍스트를 입력해 법령 개정 관련 항목을 확인합니다. 법령 검수 전 참고 자료입니다.', badge: '참고 점검', icon: 'file-check',
    sitemap: { lastModified: '2026-10-21', changeFrequency: 'weekly', priority: 0.9 } },
  { href: '/tools/rules-review', title: '규정 정비 점검', desc: '기관 규정 묶음(zip)을 올리면 규정끼리 인용·위임·별표·조문 번호·용어를 맞춰 보고, 담당자가 확인한 항목으로 신·구조문대비표와 반영본을 만듭니다.', badge: '브라우저 대조', icon: 'file-check',
    sitemap: { lastModified: '2026-10-25', changeFrequency: 'monthly', priority: 0.8 } },
  { href: '/tools/contract-check', title: '근로계약서 점검', desc: '계약서 내용을 폼에 입력하면 필수 명시사항·최저임금·위약금 등 25개 항목을 즉시 점검. 위반·리스크별 수정 방향 제시. 입력한 내용은 저장되지 않습니다.', badge: '참고 도구', icon: 'file-check',
    sitemap: { lastModified: '2026-07-31', changeFrequency: 'monthly', priority: 0.9 } },
  { href: '/tools/holiday-pay', title: '공휴일 수당 계산기', desc: '노동절(5/1)·관공서 공휴일 근무 시 추가 지급액 계산. 5인 이상/미만 × 월급·일용·시급 6분기. 시급 주휴포함 케이스 자동 분리.', badge: '참고 도구', icon: 'calculator',
    sitemap: { lastModified: '2026-04-29', changeFrequency: 'monthly', priority: 0.9 } },
  { href: '/tools/severance.html', title: '퇴직금 계산기', desc: '평균임금·통상임금 자동 비교 + 윤년 고려 정밀 재직기간 + 퇴직소득세 산정. 산정서 PDF 출력 가능.', badge: '참고 계산', icon: 'coins', external: true,
    sitemap: { lastModified: '2026-03-15', changeFrequency: 'monthly', priority: 0.85 } },
];
