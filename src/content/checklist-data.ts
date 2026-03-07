// 자가진단 체크리스트 & 데이터 베리에이션
// 해석지침/매뉴얼 정보를 다양한 형태로 변환

// ─── 1. 사용자성 자가진단 체크리스트 ───

export interface ChecklistItem {
  id: string;
  question: string;
  helpText: string;
  weight: 'high' | 'medium' | 'low';
  category: string;
}

export interface ChecklistResult {
  minScore: number;
  maxScore: number;
  level: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  recommendation: string;
}

export const employerChecklistTitle = '원청 사용자성 자가진단';
export const employerChecklistDescription = '아래 항목을 체크하여 원청의 노동조합법상 사용자 해당 가능성을 자가진단해 보세요. (법적 판단은 아니며 참고용입니다)';

export const employerChecklist: ChecklistItem[] = [
  // 인사 관여
  {
    id: 'hr-1',
    question: '원청이 하청 근로자의 채용·선발에 실질적으로 관여하고 있다',
    helpText: '면접 참여, 채용 기준 결정, 채용 승인 등',
    weight: 'high',
    category: '인사 관여',
  },
  {
    id: 'hr-2',
    question: '원청이 하청 근로자의 해고·교체를 요구할 수 있다',
    helpText: '특정 근로자의 교체 요구, 인원 감축 지시 등',
    weight: 'high',
    category: '인사 관여',
  },
  {
    id: 'hr-3',
    question: '원청이 하청 근로자의 배치·전환을 결정한다',
    helpText: '작업 위치, 부서 배치, 업무 변경 등',
    weight: 'medium',
    category: '인사 관여',
  },
  // 업무 지시·감독
  {
    id: 'work-1',
    question: '원청 관리자가 하청 근로자에게 직접 업무 지시를 한다',
    helpText: '작업 내용, 방법, 순서 등에 대한 구체적 지시',
    weight: 'high',
    category: '업무 지시·감독',
  },
  {
    id: 'work-2',
    question: '하청 근로자가 원청의 출퇴근 시간·근무 일정을 따른다',
    helpText: '원청 근로자와 동일한 근무시간, 교대제 적용 등',
    weight: 'medium',
    category: '업무 지시·감독',
  },
  {
    id: 'work-3',
    question: '원청이 하청 근로자의 업무 성과를 직접 평가한다',
    helpText: '인사평가, 근무평정, 실적 관리 등',
    weight: 'medium',
    category: '업무 지시·감독',
  },
  // 근로조건 결정
  {
    id: 'cond-1',
    question: '원청이 하청 근로자의 임금 수준을 실질적으로 결정한다',
    helpText: '도급 단가로 임금 상한 결정, 임금 인상률 제한 등',
    weight: 'high',
    category: '근로조건 결정',
  },
  {
    id: 'cond-2',
    question: '원청이 하청 근로자의 근로시간·휴일을 결정한다',
    helpText: '잔업 지시, 휴일근무 결정, 교대제 편성 등',
    weight: 'high',
    category: '근로조건 결정',
  },
  {
    id: 'cond-3',
    question: '원청이 하청 근로자에게 안전·보건 관련 의무를 직접 이행한다',
    helpText: '안전교육, 보호장구 지급, 안전점검 등',
    weight: 'low',
    category: '근로조건 결정',
  },
  // 구조적 종속
  {
    id: 'struct-1',
    question: '하청 업체의 매출 대부분이 원청에 의존하고 있다',
    helpText: '전속 하청, 단일 원청 의존도 80% 이상 등',
    weight: 'medium',
    category: '구조적 종속',
  },
  {
    id: 'struct-2',
    question: '하청 근로자가 원청의 시설·장비를 사용하여 업무를 수행한다',
    helpText: '원청 사업장 내 근무, 원청 장비·재료 사용 등',
    weight: 'medium',
    category: '구조적 종속',
  },
  {
    id: 'struct-3',
    question: '원청과 하청 간 계약이 장기·지속적으로 유지되고 있다',
    helpText: '3년 이상 지속, 자동 갱신 등',
    weight: 'low',
    category: '구조적 종속',
  },
];

export const employerChecklistResults: ChecklistResult[] = [
  {
    minScore: 0,
    maxScore: 30,
    level: 'low',
    title: '사용자성 인정 가능성 낮음',
    description: '현재 확인된 요소만으로는 원청의 사용자성이 인정되기 어려울 수 있습니다.',
    recommendation: '다만 실제 판단은 개별 사안의 구체적 사정에 따르므로, 변경 사항이 있으면 재진단하세요.',
  },
  {
    minScore: 31,
    maxScore: 60,
    level: 'medium',
    title: '사용자성 인정 가능성 있음',
    description: '일부 근로조건에 대해 원청의 실질적 지배력이 인정될 가능성이 있습니다.',
    recommendation: '전문가 상담을 통해 구체적인 사용자성 인정 범위를 확인하시기 바랍니다.',
  },
  {
    minScore: 61,
    maxScore: 100,
    level: 'high',
    title: '사용자성 인정 가능성 높음',
    description: '여러 근로조건에 대해 원청의 실질적·구체적 지배력이 인정될 가능성이 높습니다.',
    recommendation: '교섭 요구에 대비한 준비가 필요합니다. 전문가 상담을 권장합니다.',
  },
];

// ─── 2. 불법하도급(위장도급) 판단 — 교섭요구권 자가진단 ───

export const subcontractChecklistTitle = '우리도 교섭에 응해야 하나요?';
export const subcontractChecklistDescription =
  '하청 노동조합이 교섭을 요구해 왔습니다. 아래 항목을 체크하여 귀사가 개정 노동조합법상 사용자로서 교섭에 응할 의무가 있는지 자가진단하세요.';

export const subcontractChecklist: ChecklistItem[] = [
  // A. 지휘·명령 (근로자파견 핵심 징표)
  {
    id: 'sub-cmd-1',
    question: '원청 관리자가 하청 근로자에게 작업 내용·방법·순서를 직접 지시한다',
    helpText: '하청 현장소장을 거치지 않고 원청이 직접 지시하는 경우',
    weight: 'high',
    category: '지휘·명령 관계',
  },
  {
    id: 'sub-cmd-2',
    question: '하청 근로자가 원청의 조·반·팀에 편입되어 원청 근로자와 혼재 근무한다',
    helpText: '동일 라인·공정에서 원청·하청 구분 없이 작업',
    weight: 'high',
    category: '지휘·명령 관계',
  },
  {
    id: 'sub-cmd-3',
    question: '출퇴근 시간, 근무 일정, 연장·휴일근로를 원청이 결정한다',
    helpText: '하청업체가 아닌 원청이 근태 관리를 직접 수행',
    weight: 'high',
    category: '지휘·명령 관계',
  },
  // B. 인사 관여
  {
    id: 'sub-hr-1',
    question: '원청이 하청 근로자의 채용·배치·교체에 관여한다',
    helpText: '면접 참여, 인원 승인, 특정인 교체 요구 등',
    weight: 'high',
    category: '인사 관여',
  },
  {
    id: 'sub-hr-2',
    question: '원청이 하청 근로자의 인사평가·징계에 실질적 영향력을 행사한다',
    helpText: '근무평정, 상벌 결정 참여 등',
    weight: 'medium',
    category: '인사 관여',
  },
  // C. 임금·근로조건 결정
  {
    id: 'sub-wage-1',
    question: '도급 단가가 하청 근로자 임금 수준을 사실상 결정한다',
    helpText: '도급비 구조상 인건비 상한이 정해져 있는 경우',
    weight: 'high',
    category: '임금·근로조건 결정',
  },
  {
    id: 'sub-wage-2',
    question: '원청이 하청 근로자의 임금 인상률·상여금·수당을 실질적으로 결정한다',
    helpText: '도급계약 갱신 시 인건비 인상률 결정, 특별수당 지급 지시 등',
    weight: 'high',
    category: '임금·근로조건 결정',
  },
  // D. 업무 독립성 부재
  {
    id: 'sub-indep-1',
    question: '하청 업체가 고유한 기술·장비 없이 원청 시설·설비만으로 업무를 수행한다',
    helpText: '원청 공장, 원청 장비, 원청 재료 100% 사용',
    weight: 'medium',
    category: '업무 독립성',
  },
  {
    id: 'sub-indep-2',
    question: '하청 업무가 원청 핵심 생산공정의 일부이다 (부수 업무가 아님)',
    helpText: '청소·경비 등 부수 업무가 아닌 제조·조립 등 핵심 공정',
    weight: 'medium',
    category: '업무 독립성',
  },
  {
    id: 'sub-indep-3',
    question: '하청 업체 변경 시에도 동일 근로자가 계속 근무한다',
    helpText: '하청업체만 바뀌고 근로자는 그대로 (고용승계)',
    weight: 'medium',
    category: '업무 독립성',
  },
  // E. 계약 형식 vs 실질
  {
    id: 'sub-form-1',
    question: '도급계약서에 "업무 완성"이 아닌 "인력 제공" 중심으로 기재되어 있다',
    helpText: '업무 완성·결과물 인도가 아닌, 몇 명을 투입하라는 계약 형태',
    weight: 'medium',
    category: '계약 형식 vs 실질',
  },
  {
    id: 'sub-form-2',
    question: '하청 업체가 원청 외 다른 거래처가 거의 없다 (전속성)',
    helpText: '매출의 80% 이상을 원청에 의존',
    weight: 'low',
    category: '계약 형식 vs 실질',
  },
  {
    id: 'sub-form-3',
    question: '하청 업체의 사업자 등록, 4대보험 관리 등 형식만 갖추었을 뿐 실질적 경영 능력이 없다',
    helpText: '전문 인력·자본·장비 부재, 원청이 사실상 운영',
    weight: 'high',
    category: '계약 형식 vs 실질',
  },
];

export const subcontractChecklistResults: ChecklistResult[] = [
  {
    minScore: 0,
    maxScore: 30,
    level: 'low',
    title: '교섭 의무 가능성 낮음 — 적법 도급',
    description:
      '현재 확인된 요소로는 귀사의 사용자성이 인정되기 어려울 수 있습니다. 하청 업체가 독립적으로 업무를 수행하는 적법 도급으로 판단될 가능성이 있습니다.',
    recommendation:
      '다만 교섭 요구를 무조건 거부하기보다, 전문가 검토를 통해 리스크를 확인하세요.',
  },
  {
    minScore: 31,
    maxScore: 60,
    level: 'medium',
    title: '교섭 의무 가능성 있음 — 위장도급 의심 요소',
    description:
      '일부 근로조건에 대해 귀사의 실질적 지배력이 인정될 가능성이 있습니다. 교섭을 거부할 경우 부당노동행위로 판단될 수 있는 리스크가 존재합니다.',
    recommendation:
      '교섭 범위를 파악하고, 응할 부분과 거부할 부분을 전문가와 함께 전략적으로 준비하세요.',
  },
  {
    minScore: 61,
    maxScore: 100,
    level: 'high',
    title: '교섭 의무 가능성 높음 — 즉각 대응 필요',
    description:
      '귀사가 근로조건 전반에 실질적·구체적 지배력을 행사하고 있어, 개정법상 사용자로서 교섭에 응할 의무가 인정될 가능성이 매우 높습니다.',
    recommendation:
      '교섭 거부 시 부당노동행위(형사처벌 대상)에 해당할 수 있습니다. 즉시 전문가 상담을 받으시기 바랍니다.',
  },
];

// ─── 2-1. 심층진단 체크리스트 (코트라 점검표 18개 항목) ───

export interface DeepChecklistItem {
  id: string;
  question: string;
  helpText: string;
  category: string;
}

export interface DeepChecklistResult {
  minCount: number;
  maxCount: number;
  level: string;
  title: string;
  description: string;
  tag: string;
}

export const deepChecklistTitle = '심층 사용자성 진단 (18항목)';
export const deepChecklistDescription =
  '코트라 점검표 기반 18개 항목을 4단계로 평가합니다. 점수 합산 후 리스크 등급을 산출합니다.';

export const deepChecklist: DeepChecklistItem[] = [
  // I. 구조적 통제
  { id: 'deep-1', question: '채용 시 사전승인 및 이력서 검토 여부', helpText: '수행사의 고유 권한인 인사권(채용·배치)에 대한 원청의 지배력 행사 여부', category: 'I. 구조적 통제' },
  { id: 'deep-2', question: '근로시간·일정에 대한 직접 결정 여부', helpText: '원청이 개별 근로자의 출퇴근 및 근무 시간대를 실질적으로 결정하거나 승인하는지', category: 'I. 구조적 통제' },
  { id: 'deep-3', question: '업무지시 방식 (직접지시/결과확인)', helpText: '원청이 업무수행 과정에 직접 개입하는지, 결과물 확인에 그치는지', category: 'I. 구조적 통제' },
  { id: 'deep-4', question: '복무규율 설정 여부', helpText: '원청이 친절·청결·복장 등 복무기준을 직접 설정·강제하는지', category: 'I. 구조적 통제' },
  { id: 'deep-5', question: '보고체계 (직접보고/PM경유)', helpText: '원청과 개별 근로자 간 직접적 보고 구조 존재 여부', category: 'I. 구조적 통제' },
  // II. 설비·장소 통제
  { id: 'deep-6', question: '원청 사업장 상주 여부', helpText: '하청 인력이 원청 사옥 내에서 상시 근무하는지', category: 'II. 설비·장소 통제' },
  { id: 'deep-7', question: '원청 장비·시스템 운용 여부', helpText: '원청 소유 IT인프라·설비를 직접 운용하는지', category: 'II. 설비·장소 통제' },
  { id: 'deep-8', question: '보안규정 직접 적용 여부', helpText: '원청 보안규정이 하청 근로자에게 직접 적용되는지', category: 'II. 설비·장소 통제' },
  // III. 간접적 결정력
  { id: 'deep-9', question: '인력교체 요구권 보유 여부', helpText: '원청이 "부적당한 인력" 등 포괄적 기준으로 교체를 요구할 수 있는지', category: 'III. 간접적 결정력' },
  { id: 'deep-10', question: '인력변경 사전승인 여부', helpText: '하청의 인력 배치·변경에 원청의 사전 승인이 필요한지', category: 'III. 간접적 결정력' },
  { id: 'deep-11', question: '평가 연동 해지권 보유 여부', helpText: '서비스 평가 결과에 따른 즉시 해지권이 인력 퇴출 압박으로 기능하는지', category: 'III. 간접적 결정력' },
  { id: 'deep-12', question: '고용사항 제출 요구 여부', helpText: '원청이 하청 근로자의 인사정보(이력서, 고용사항 등)를 요구하는지', category: 'III. 간접적 결정력' },
  // IV. 조직 편입
  { id: 'deep-13', question: '핵심업무(복리후생·IT·보안) 수행 여부', helpText: '하청의 업무가 원청 사업 수행에 상시적·필수적인 업무인지', category: 'IV. 조직 편입' },
  { id: 'deep-14', question: '보안서약서 원청 직접 징구 여부', helpText: '원청이 하청 근로자에게 직접적인 법적 의무를 부과하는 행위인지', category: 'IV. 조직 편입' },
  { id: 'deep-15', question: '장기·반복 계약 여부', helpText: '일시적 프로젝트가 아닌 상시적·계속적 편입을 의미하는지', category: 'IV. 조직 편입' },
  // V. 경제적 종속성
  { id: 'deep-16', question: '인건비 연동 대금구조 여부', helpText: '대금이 투입 인력 수에 비례하여 산정되는지 (파견의 징표)', category: 'V. 경제적 종속성' },
  { id: 'deep-17', question: '단일거래처 의존 여부', helpText: '원청 외 다른 사업 기회를 탐색할 수 있는 독립적 사업자인지', category: 'V. 경제적 종속성' },
  { id: 'deep-18', question: '전속적 관계 여부', helpText: '매출의 대부분이 원청에 의존하여 계약 해지 시 기업 존속이 불투명한지', category: 'V. 경제적 종속성' },
];

export const deepChecklistResults: DeepChecklistResult[] = [
  { minCount: 14, maxCount: 18, level: 'critical', title: '사용자 가능성 매우 높음', tag: '긴급', description: '사실상의 직접 고용 관계로 확정될 확률이 높습니다. 계약서의 전면 개정과 지휘 체계의 단절이 필요합니다.' },
  { minCount: 10, maxCount: 13, level: 'high', title: '사용자 가능성 높음', tag: '심각', description: '노조법상 실질적 사용자로 인정될 가능성이 농후합니다. \'승인\' 권한 삭제 및 \'지휘 체계\' 단일화가 필요합니다.' },
  { minCount: 6, maxCount: 9, level: 'medium', title: '사용자 가능성 있음', tag: '경고', description: '일부 독소 조항이 지배력의 근거가 됩니다. \'결과 중심 정산\'으로의 전환이 필요합니다.' },
  { minCount: 3, maxCount: 5, level: 'caution', title: '사용자 가능성 의심', tag: '주의', description: '관리 편의상 도입한 조항들이 문제가 될 수 있습니다. 모호한 표현을 삭제하여 독립성을 보완해야 합니다.' },
  { minCount: 1, maxCount: 2, level: 'low', title: '사용자 가능성 낮음', tag: '안전', description: '진성 도급의 외관을 잘 갖추고 있습니다. 정기적인 현장 실태 점검을 통해 관행적 개입이 발생하지 않도록 관리가 필요합니다.' },
  { minCount: 0, maxCount: 0, level: 'safe', title: '사용자 가능성 매우 낮음', tag: '완벽', description: '수행사의 독립적 경영이 상당히 보장된 상태입니다. 현재의 계약 구조와 관리 모델을 표준으로 유지하셔도 좋습니다.' },
];

// ─── 3. 교섭절차 준비 체크리스트 (노조용) ───

export const unionPrepChecklist = {
  title: '교섭요구 전 준비 체크리스트 (노동조합용)',
  description: '원청사용자에게 교섭을 요구하기 전 아래 사항을 점검하세요.',
  items: [
    { id: 'u-1', text: '원청의 사용자성을 뒷받침할 구체적 증거 자료를 확보했는가?', category: '사전 준비' },
    { id: 'u-2', text: '원청이 실질적으로 지배·결정하는 근로조건을 구체적으로 특정했는가?', category: '사전 준비' },
    { id: 'u-3', text: '교섭요구서(시행규칙 서식)를 작성했는가?', category: '서류 준비' },
    { id: 'u-4', text: '교섭요구일 현재 종사근로자인 조합원 수를 정확히 파악했는가?', category: '서류 준비' },
    { id: 'u-5', text: '기존 단체협약의 유효기간을 확인했는가? (만료 3개월 전부터 요구 가능)', category: '시기 확인' },
    { id: 'u-6', text: '교섭 의제(요구 사항)를 구체적으로 정리했는가?', category: '교섭 의제' },
    { id: 'u-7', text: '같은 원청 소속 다른 하청노동조합의 존재를 파악했는가?', category: '연대' },
    { id: 'u-8', text: '교섭창구 단일화 절차에 대해 이해하고 있는가?', category: '절차 이해' },
  ],
};

// ─── 3. 교섭절차 준비 체크리스트 (사용자용) ───

export const employerPrepChecklist = {
  title: '교섭요구 대응 체크리스트 (사용자용)',
  description: '하청노동조합의 교섭요구를 받았을 때 아래 사항을 점검하세요.',
  items: [
    { id: 'e-1', text: '교섭요구서의 형식적 요건(서면, 필수 기재사항)을 확인했는가?', category: '요구서 확인' },
    { id: 'e-2', text: '해당 노동조합 소속 조합원에 대한 사용자성 해당 여부를 검토했는가?', category: '사용자성 검토' },
    { id: 'e-3', text: '사용자성이 인정될 수 있는 근로조건의 범위를 파악했는가?', category: '사용자성 검토' },
    { id: 'e-4', text: '7일 이내 교섭요구 사실 공고 계획을 수립했는가?', category: '공고 준비' },
    { id: 'e-5', text: '모든 하청노동조합·노동자가 알 수 있는 공고 장소를 파악했는가?', category: '공고 준비' },
    { id: 'e-6', text: '하청사용자에게도 공고 협조를 요청했는가?', category: '공고 준비' },
    { id: 'e-7', text: '"단체교섭 판단지원 위원회" 활용 여부를 검토했는가?', category: '지원 활용' },
    { id: 'e-8', text: '교섭 담당 인력 및 권한을 확인했는가?', category: '교섭 대비' },
  ],
};

// ─── 4. FAQ 데이터 (AI 챗봇 보충용) ───

export const faqData = [
  {
    question: '노란봉투법이 뭔가요?',
    answer: '개정 노동조합법(2026.3.10. 시행)의 별칭으로, 사용자 범위를 확대하고 노동쟁의 범위를 넓힌 법률입니다. 근로계약 당사자가 아니더라도 근로조건을 실질적·구체적으로 지배·결정하는 자도 사용자로 보게 됩니다.',
  },
  {
    question: '우리 원청도 사용자에 해당하나요?',
    answer: '원청이 하청 근로자의 채용·해고, 임금, 근로시간, 업무지시 등 근로조건을 실질적·구체적으로 지배·결정하는 경우 사용자에 해당할 수 있습니다. 위의 자가진단 체크리스트로 대략적인 판단이 가능하며, 정확한 판단은 전문가 상담이 필요합니다.',
  },
  {
    question: '사용자성은 전부 인정되나요, 일부만 인정되나요?',
    answer: '일부 근로조건에 대해서만 사용자성이 인정될 수 있습니다. 원청은 실질적 지배력이 미치는 범위 내에서만 사용자로서의 의무를 부담합니다.',
  },
  {
    question: '교섭요구를 받으면 반드시 응해야 하나요?',
    answer: '사용자성이 인정되는 범위 내에서는 교섭에 응해야 합니다. 정당한 이유 없이 교섭을 거부하면 부당노동행위에 해당할 수 있습니다.',
  },
  {
    question: '교섭단위 분리는 어떻게 하나요?',
    answer: '노동위원회에 교섭단위 분리 신청을 할 수 있습니다. 직무별, 상급단체별, 하청기업 특성별 등 다양한 형태로 분리가 가능하며, 노동위원회가 여러 요소를 종합 고려하여 결정합니다.',
  },
  {
    question: '교섭요구 사실 공고를 안 하면 어떻게 되나요?',
    answer: '하청노동조합이 노동위원회에 시정신청을 할 수 있고, 노동위원회가 공고를 명할 수 있습니다. 시정명령에도 불응하면 교섭 거부·해태의 부당노동행위로 처벌될 수 있습니다.',
  },
  {
    question: '사외하청에도 적용되나요?',
    answer: '네, 사내하청뿐 아니라 사외하청, 용역, 위탁 등 다양한 형태에서 원청의 실질적·구체적 지배력이 인정되면 사용자성이 인정될 수 있습니다.',
  },
  {
    question: '시행일은 언제인가요?',
    answer: '2026년 3월 10일부터 시행됩니다.',
  },
];

// ─── 5. 핵심 용어 사전 ───

export const glossary = [
  { term: '계약사용자', definition: '근로계약의 직접 당사자인 사용자 (하청사용자)' },
  { term: '계약외사용자', definition: '근로계약 당사자가 아니지만 근로조건을 실질적·구체적으로 지배·결정하는 자 (원청사용자)' },
  { term: '교섭창구 단일화', definition: '하나의 사업장에 복수 노조가 있을 때, 교섭대표노동조합을 정하여 교섭하는 절차' },
  { term: '교섭단위', definition: '교섭대표노동조합을 결정하는 단위. 원칙적으로 하나의 사업장이며, 분리 가능' },
  { term: '교섭단위 분리', definition: '전체 하청노동자 집단 내에서 직무·이해관계 등이 유사한 집단으로 나누는 것' },
  { term: '공동교섭대표단', definition: '과반수 노동조합이 결정되지 않을 때 복수 노조가 공동으로 구성하는 교섭 주체' },
  { term: '부당노동행위', definition: '사용자가 정당한 이유 없이 교섭을 거부·해태하는 등의 행위. 형사처벌 대상' },
  { term: '단체교섭 판단지원 위원회', definition: '고용노동부 내 설치된 위원회로, 사용자성 인정 여부 등에 대해 지원' },
  { term: '노동쟁의', definition: '노동조합과 사용자 간 근로조건에 관한 주장 불일치로 발생한 분쟁상태' },
  { term: '실질적·구체적 지배·결정', definition: '근로조건에 대해 직접적이고 현실적인 결정 권한을 행사하는 것' },
];

// ─── 6. 타임라인 (법 시행 전후) ───

export const timeline = [
  { date: '2024.09', event: '노란봉투법 국회 본회의 통과' },
  { date: '2024.10', event: '대통령 재의요구(거부권 행사)' },
  { date: '2025.06', event: '국회 재의결, 법률 확정' },
  { date: '2025.09', event: '시행령 입법예고' },
  { date: '2026.01', event: '시행령·시행규칙 확정' },
  { date: '2026.02', event: '고용노동부 해석지침·교섭절차 매뉴얼 발표' },
  { date: '2026.03.10', event: '개정 노동조합법 시행', highlight: true },
];
