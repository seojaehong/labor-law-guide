// LLM 도구 스키마 (OpenAI tools format)
import { HOURS_CHANGED_MESSAGE } from '@/lib/calc/severance';

export const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'calc_severance',
      description:
        '퇴직금 계산 (1일 평균임금 × 30 × 재직일수 ÷ 365, 고용노동부 퇴직금 계산기와 같은 끝수). 사용자가 입사일·퇴사일·직전 3개월 임금을 알려준 경우 호출. 추측 X. include_tax=true로 호출하면 퇴직소득세까지 동시 산출. ' +
        'eligible(지급 대상)은 계속근로 1년 이상(one_year) 그리고 4주 평균 1주 소정근로시간 15시간 이상일 때만 true 다(근로자퇴직급여 보장법 제4조제1항). ' +
        'weekly_hours 를 넣지 않으면 status=hours-unknown·eligible=false 로 돌려주므로, 지급 대상을 말하기 전에 사용자에게 1주 소정근로시간을 묻는다. ' +
        '1주 소정근로시간이 15시간 이상과 미만 사이에서 바뀐 적이 있으면 hours_changed=true — 계산하지 않고 4주 단위로 세야 하는 이유를 error 로 돌려준다.',
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
          annual_leave_pay: {
            type: 'integer',
            description: '퇴직 전 1년 동안 지급받은 연차수당 총액(원). 퇴직하면서 정산받는 미사용 연차수당은 넣지 않는다',
          },
          include_tax: { type: 'boolean', description: '퇴직소득세까지 함께 계산 (기본 false). 마지막 근무일이 2022-12-31 이전이면 종전 공제표·세율 대상이라 tax 없이 legal_basis 에 이유만 적는다' },
          weekly_hours: {
            type: 'number',
            description: '4주 평균 1주 소정근로시간(시간). 사용자가 말한 경우에만 넣는다. 15시간 미만이면 지급 대상이 아니다(status=under-15h). 넣지 않으면 지급 대상인지 따지지 않는다(status=hours-unknown). 답 끝 계산기 링크에도 실린다',
          },
          excluded_days: {
            type: 'integer',
            description: '직전 3개월 중 평균임금 산정기간에서 빼는 기간의 일수 — 수습을 시작한 날부터 3개월 이내·사용자 귀책 휴업·출산전후휴가·업무상 요양·육아휴직·쟁의행위·병역 등(임금을 받았으면 빼지 않음)·승인 휴업(근로기준법 시행령 제2조제1항), 육아기 근로시간 단축 기간(남녀고용평등법 제19조의3제4항), 가족돌봄 등을 위한 근로시간 단축 기간(남녀고용평등법 제22조의4제4항)',
          },
          excluded_wage: {
            type: 'integer',
            description: '그 빼는 기간에 받은 임금(원) — wages_3months 에 들어 있는 금액. excluded_days 를 넣으면 반드시 넣는다(받지 않았으면 0)',
          },
          hours_changed: {
            type: 'boolean',
            // 멈출 때 돌려주는 글과 같은 엔진 상수(261127 G4 R16 — 4주는 퇴직일부터 거슬러 나눈다)
            description: `재직 중 1주 소정근로시간이 15시간 이상과 미만 사이에서 바뀐 적이 있으면 true. 그러면 계산하지 않고 이 글을 error 로 돌려준다: ${HOURS_CHANGED_MESSAGE}`,
          },
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
      description: '연장·야간·휴일근로 가산수당 계산. 통상시급(끝수 그대로) 또는 월 통상임금 중 하나를 준다. 원 미만은 수당마다 올린다.',
      parameters: {
        type: 'object',
        properties: {
          ordinary_hourly: { type: 'number', description: '통상시급 (원, 끝수 그대로 — calc_ordinary_wage 의 ordinary_hourly 를 반올림하지 말고 넘긴다)' },
          monthly_fixed_pay: { type: 'integer', description: '월 통상임금 (원). 주면 통상시급 대신 이것으로 계산한다' },
          monthly_hours: { type: 'integer', description: '월 소정근로시간 (기본 209). monthly_fixed_pay 와 함께 쓴다' },
          overtime_hours: { type: 'number', description: '연장근로 시간' },
          night_hours: { type: 'number', description: '야간근로 시간 (22:00~06:00)' },
          holiday_hours_within_8: { type: 'number', description: '휴일 8h 이내' },
          holiday_hours_over_8: { type: 'number', description: '휴일 8h 초과' },
        },
        required: [],
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
          year: { type: 'integer', description: '연도 (기본 올해). 최저임금 고시가 없는 해는 오류' },
          weekly_hours: { type: 'number', description: '1주 소정근로시간 (기본 40). 주휴·월 환산은 시행령 제5조 제1항대로 센다' },
        },
        required: ['base_pay'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'lookup_law_article',
      description:
        '법조항 원문 조회 (법제처 조문 93종). 조문 제목과 본문을 돌려준다. ' +
        '금액·기간·일수·벌칙 수위처럼 조문에 적힌 수치를 말해야 할 때 반드시 호출한다. ' +
        '기억에 의존해 숫자를 쓰지 말 것. 삭제된 조문이면 삭제 사실을 알려준다.',
      parameters: {
        type: 'object',
        properties: {
          law: {
            type: 'string',
            description:
              '법령명 전체. 예: 근로기준법, 근로기준법 시행령, 노동조합 및 노동관계조정법, ' +
              '남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률',
          },
          article: { type: 'integer', description: '조 번호. 예: 76' },
          sub: {
            type: 'integer',
            description:
              '가지번호. 「제76조의2」면 2. 직장 내 괴롭힘(제76조의2·제76조의3)처럼 ' +
              '핵심 조항이 가지번호에 있으므로 빠뜨리지 말 것',
          },
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
