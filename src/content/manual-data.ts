// 원·하청 상생 교섭절차 매뉴얼 — 구조화 콘텐츠

export interface Step {
  id: string;
  number: number;
  title: string;
  shortTitle: string;
  actor: '하청노조' | '원청사용자' | '노동위원회' | '노사';
  description: string;
  details: string[];
  article?: string;
  caution?: string;
}

export const negotiationSteps: Step[] = [
  {
    id: 'request',
    number: 1,
    title: '하청노동조합의 교섭요구',
    shortTitle: '교섭요구',
    actor: '하청노조',
    description: '하청노동조합이 원청사용자에게 단체교섭을 서면으로 요구합니다.',
    details: [
      '원청사용자가 소속 조합원의 근로조건을 실질적·구체적으로 지배·결정하는 지위에 있어야 함',
      '노동조합의 명칭, 교섭 요구일 현재 종사근로자인 조합원 수 등을 적은 서면으로 요구',
      '기존 단체협약이 있는 경우 유효기간 만료일 3개월 전부터 요구 가능',
      '2026.3.10. 법 시행 이후 최초 교섭요구는 바로 가능',
    ],
    article: '시행령 제14조의2',
  },
  {
    id: 'announce',
    number: 2,
    title: '원청사용자의 교섭요구 사실 공고',
    shortTitle: '공고',
    actor: '원청사용자',
    description: '원청사용자가 교섭요구 사실을 7일간 공고하여 다른 노동조합과 노동자가 알 수 있도록 합니다.',
    details: [
      '교섭요구를 받은 날부터 7일간 게시판 등에 공고',
      '사용자성이 인정되거나 인정될 가능성 있는 모든 하청노동조합·노동자가 알 수 있도록',
      '하청노동자 작업 공간, 휴게장소, 출입구, 식당 등 여러 곳에 충분히 공고',
      '전산시스템, 하청사용자의 게시판에도 공고 협조',
    ],
    article: '시행령 제14조의3',
    caution: '공고를 하지 않거나 좁은 범위에서만 공고하면 노동위원회 시정신청 대상이 되며, 교섭창구 단일화 절차를 다시 진행해야 할 수 있습니다.',
  },
  {
    id: 'participate',
    number: 3,
    title: '다른 하청노동조합의 교섭 참여',
    shortTitle: '참여신청',
    actor: '하청노조',
    description: '공고기간 내에 다른 하청노동조합이 교섭에 참여할 수 있습니다.',
    details: [
      '교섭요구 사실 공고기간(7일) 내에 원청사용자에게 서면으로 교섭 요구',
      '해당 노동조합 소속 조합원의 근로조건에 대해서도 원청의 사용자성이 인정되어야 함',
      '참여 신청 시에도 노동조합 명칭, 조합원 수 등 기재',
    ],
    article: '시행령 제14조의4',
  },
  {
    id: 'confirm',
    number: 4,
    title: '교섭요구 노동조합 확정 공고',
    shortTitle: '확정공고',
    actor: '원청사용자',
    description: '공고기간이 끝난 다음 날, 교섭을 요구한 노동조합을 확정하여 5일간 공고합니다.',
    details: [
      '교섭 요구한 모든 하청노동조합 명칭, 조합원 수 등을 확정 공고',
      '노동조합은 공고 내용이 다르면 이의 신청 가능',
      '이의 신청 불응 시 노동위원회에 시정 요청 가능',
      '교섭요구 노동조합이 1개뿐이면 단일화 절차 없이 바로 교섭 가능',
    ],
    article: '시행령 제14조의5',
  },
  {
    id: 'representative',
    number: 5,
    title: '교섭대표노동조합 결정',
    shortTitle: '대표결정',
    actor: '노사',
    description: '확정된 노동조합 간 교섭대표노동조합을 결정합니다.',
    details: [
      '확정일부터 14일 이내 자율적 교섭대표노동조합 결정 (또는 사용자의 개별교섭 동의)',
      '자율 결정 불가 시 → 과반수 노동조합이 교섭대표',
      '2개 이상 노조가 위임·연합하여 과반수 되는 경우도 인정',
      '과반수 미결정 시 → 공동교섭대표단 구성',
    ],
    article: '법 제29조의2, 시행령 제14조의6',
    caution: '소수노조의 이해관계도 반영될 수 있도록 하는 것이 바람직하며, 지방고용노동관서의 교섭 컨설팅 지원을 받을 수 있습니다.',
  },
  {
    id: 'negotiate',
    number: 6,
    title: '단체교섭 진행',
    shortTitle: '단체교섭',
    actor: '노사',
    description: '교섭대표노동조합과 원청사용자 간 단체교섭을 진행합니다.',
    details: [
      '사용자성이 인정된 근로조건에 대해 교섭 진행',
      '노동위원회가 인정한 의제 외 추가 의제는 노사 합의로 결정',
      '교섭 의제 불일치 시 "단체교섭 판단지원 위원회" 활용 가능',
      '정당한 이유 없는 교섭 거부·해태는 부당노동행위',
    ],
    caution: '사용자성이 인정되지 않는 의제에 대한 교섭 거부는 부당노동행위가 아닙니다.',
  },
];

export interface UnitSeparation {
  id: string;
  title: string;
  description: string;
  considerations: string[];
  examples: { title: string; description: string }[];
}

export const unitSeparation: UnitSeparation = {
  id: 'unit-separation',
  title: '교섭단위 분리',
  description: '전체 하청노동자 집단에서 직무, 이해관계 등이 유사한 집단끼리 교섭단위를 분리할 수 있습니다. 노동위원회가 신청을 받아 결정합니다.',
  considerations: [
    '업무의 성질·내용, 작업환경, 책임비중',
    '임금체계·구성항목·지급방법',
    '근무시간, 휴일·휴가, 복리후생',
    '노동조합 간 이해관계의 공통성 또는 유사성 (우선 고려)',
    '다른 노동조합에 의한 이익 대표의 적절성 (우선 고려)',
    '교섭단위 유지 시 노조 간 갈등·노사관계 왜곡 가능성 (우선 고려)',
  ],
  examples: [
    { title: 'A·B·C 직무별 분리', description: '전체 하청노동자 집단에서 직무별로 교섭단위를 분리' },
    { title: 'A·B 상급단체별 분리', description: '노동조합 간 이해관계 유사성을 고려하여 상급단체별 분리' },
    { title: '하청기업 특성별 분리', description: '근로조건·고용형태가 유사한 하청기업을 묶어 분리' },
  ],
};
