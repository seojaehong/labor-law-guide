// 절차 흐름 — **한 벌의 글**로 적고 화면이 그림으로 그린다(2026-10-21).
// 숫자·기한은 전부 법제처 현행 원문 대조(2026-10-21 조회). 조문을 바꾸면 CHECKED 도 바꾼다.
//
// 그림 라이브러리를 쓰지 않는다. 단계와 갈래만 적으면 FlowDiagram 이 SVG 로 그리고
// 색은 CSS 변수로 받는다 — 테마가 바뀌어도 다시 그리지 않는다.

export const FLOW_CHECKED = '2026.10.25.';

export interface FlowStep {
  id: string;
  /** 단계 이름 — 짧게 */
  title: string;
  /** 이 단계에서 무엇을 하는가 */
  detail?: string;
  /** 기한 — 지나면 길이 닫히는 것만 적는다 */
  deadline?: string;
  /** 근거 조문 */
  basis?: string;
  /** 갈래 — 여기서 다른 길로 빠질 수 있으면 적는다 */
  branch?: { label: string; detail: string };
}

export interface Flow {
  id: string;
  title: string;
  lead: string;
  steps: FlowStep[];
  notes: string[];
}

export const REMEDY_FLOW: Flow = {
  id: 'remedy',
  title: '부당해고 구제신청은 이렇게 갑니다',
  lead: '상시근로자 5인 이상 사업장의 근로기준법상 부당해고등 구제절차입니다. 최초 신청기한과 판정 후 불복기한을 나누어 확인하세요.',
  steps: [
    {
      id: 'fire',
      title: '부당해고등이 있었던 날',
      detail: '해고·휴직·정직·전직·감봉 그 밖의 징벌이 있었던 날부터 기한이 흐릅니다.',
      basis: '근로기준법 제28조제1항',
    },
    {
      id: 'file',
      title: '지방노동위원회에 구제신청',
      deadline: '3개월 이내',
      detail: '부당해고등이 있었던 날부터 3개월 안에 신청해야 합니다.',
      basis: '근로기준법 제28조제2항',
      branch: { label: '안 하면', detail: '구제신청을 할 수 없게 됩니다. 민사소송은 별개로 남습니다.' },
    },
    {
      id: 'first',
      title: '초심 판정 — 구제명령 또는 기각결정',
      detail: '지방노동위원회가 조사·심문을 거쳐 판정합니다.',
      basis: '근로기준법 제31조제1항',
    },
    {
      id: 'review',
      title: '중앙노동위원회에 재심 신청',
      deadline: '10일 이내',
      detail: '구제명령서나 기각결정서를 통지받은 날부터 10일 안에 신청합니다.',
      basis: '근로기준법 제31조제1항',
      branch: { label: '안 하면', detail: '초심 판정이 그대로 확정됩니다.' },
    },
    {
      id: 'second',
      title: '재심 판정',
      detail: '중앙노동위원회가 초심을 다시 봅니다.',
      basis: '근로기준법 제31조제2항',
    },
    {
      id: 'court',
      title: '행정소송 제기',
      deadline: '15일 이내',
      detail: '재심판정서를 송달받은 날부터 15일 안에 소를 제기합니다.',
      basis: '근로기준법 제31조제2항',
      branch: { label: '안 하면', detail: '재심판정이 확정됩니다.' },
    },
  ],
  notes: [
    '상시근로자 5인 미만 사업장에는 이 부당해고등 구제절차가 적용되지 않습니다. 다른 법률에 따른 구제와 민사상 청구는 별도로 확인하세요(근로기준법 제11조, 고용노동부 「부당해고 구제절차」 안내).',
    '재심 신청이나 행정소송을 내도 구제명령의 효력은 멈추지 않습니다(근로기준법 제32조).',
    '기간 안에 재심을 신청하지 않거나 소를 제기하지 않으면 구제명령·기각결정·재심판정이 확정됩니다(근로기준법 제31조제3항).',
    '일반 기준입니다. 사안에 따라 달라질 수 있으니 구체적인 것은 원문과 함께 확인하세요.',
  ],
};
