// LLM 도구 스키마 (OpenAI tools format)
export const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'calc_severance',
      description:
        '퇴직금 계산 (윤년 고려 정밀 재직 fraction). 사용자가 입사일·퇴사일·직전 3개월 임금을 알려준 경우 호출. 추측 X. include_tax=true로 호출하면 퇴직소득세까지 동시 산출.',
      parameters: {
        type: 'object',
        properties: {
          hire_date: { type: 'string', description: 'YYYY-MM-DD 입사일' },
          last_work_date: { type: 'string', description: 'YYYY-MM-DD 마지막 근무일' },
          wages_3months: {
            type: 'array',
            items: { type: 'integer' },
            description: '[전3개월급, 전2개월급, 전1개월급] 세전 원',
          },
          annual_bonus: { type: 'integer', description: '연간 상여금 총액 (원)' },
          unused_annual_leave_days: { type: 'integer' },
          annual_leave_daily_wage: { type: 'integer' },
          include_tax: { type: 'boolean', description: '퇴직소득세까지 함께 계산 (기본 false)' },
        },
        required: ['hire_date', 'last_work_date', 'wages_3months'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'calc_ordinary_wage',
      description: '통상임금(시급/일급) 산정. 정기·일률·고정 임금 월액을 받아 시급/일급 환산.',
      parameters: {
        type: 'object',
        properties: {
          monthly_fixed_pay: { type: 'integer', description: '매월 정기·일률 임금 합계 (원)' },
          monthly_hours: { type: 'integer', description: '월 소정근로시간 (기본 209)' },
        },
        required: ['monthly_fixed_pay'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'calc_overtime',
      description: '연장·야간·휴일근로 가산수당 계산.',
      parameters: {
        type: 'object',
        properties: {
          ordinary_hourly: { type: 'integer', description: '통상시급 (원)' },
          overtime_hours: { type: 'number', description: '연장근로 시간' },
          night_hours: { type: 'number', description: '야간근로 시간 (22:00~06:00)' },
          holiday_hours_within_8: { type: 'number', description: '휴일 8h 이내' },
          holiday_hours_over_8: { type: 'number', description: '휴일 8h 초과' },
        },
        required: ['ordinary_hourly'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'check_min_wage',
      description: '최저임금 위반 여부 검증. 기본급 + 고정수당 합계가 월 최저임금 이상인지.',
      parameters: {
        type: 'object',
        properties: {
          base_pay: { type: 'integer', description: '기본급 (원)' },
          fixed_allowances: { type: 'integer', description: '매월 고정 지급 수당 합계' },
          year: { type: 'integer', description: '연도 (기본 2026)' },
          monthly_hours: { type: 'integer', description: '월 소정근로시간 (기본 209)' },
        },
        required: ['base_pay'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'lookup_law_article',
      description: '법조항 존재 여부와 제목 조회 (법제처 캐시).',
      parameters: {
        type: 'object',
        properties: {
          law: { type: 'string', description: '예: 근로기준법, 노동조합 및 노동관계조정법' },
          article: { type: 'integer', description: '조항 번호' },
        },
        required: ['law', 'article'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_blog',
      description:
        '관련 블로그 글 추천 (340건+ 노동법 콘텐츠). 사용자 질문 주제에 맞는 최신 글 3건. 답변에 깊이 있는 자료를 함께 안내할 때 호출. 카테고리: 노동법/판례분석/뉴스해설/실무가이드/뉴스브리핑/종합',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '검색 키워드 (예: 부당해고, 통상임금, 직장내괴롭힘)' },
          category: {
            type: 'string',
            description: '카테고리 한정 (선택). 노동법/판례분석/뉴스해설/실무가이드',
          },
          limit: { type: 'integer', description: '결과 개수 (기본 3)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'suggest_case_analyzer',
      description:
        '사용자가 구체적인 분쟁 케이스(부당해고/징계/괴롭힘 등)를 설명한 경우 AI 비교분석기 페이지로 안내. 비슷한 판정례를 자동 비교해주는 기능. 답변 끝에 "더 자세한 비교분석은 여기서:" 형식으로 링크 제공.',
      parameters: {
        type: 'object',
        properties: {
          dispute_summary: {
            type: 'string',
            description: '사용자 분쟁의 한 줄 요약 (예: "직원 횡령으로 징계해고")',
          },
        },
        required: ['dispute_summary'],
      },
    },
  },
];
