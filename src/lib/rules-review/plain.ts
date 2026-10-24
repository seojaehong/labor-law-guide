// 알기 쉬운 표현 — 법제처 「알기 쉬운 법령 정비기준」에서 문맥과 관계없이 바꿀 수 있는 말만 골랐다.
// 문맥을 타는 말(예: 「하기」→「아래」는 「하기 위하여」와 겹친다, 「전항」은 항 번호가 필요하다)은 넣지 않는다.
// from 은 정규식 원문, to 는 바꿀 말($1 등 사용 가능). 앞뒤 경계는 엔진이 붙이지 않으므로 여기서 정한다.

export interface PlainRule {
  id: string;
  from: string;
  to: string;
  /** 화면에 보일 「무엇을 무엇으로」 */
  label: string;
}

export const PLAIN_RULES: PlainRule[] = [
  { id: 'danghae', from: '당해(?=\\s)', to: '해당', label: '당해 → 해당' },
  { id: 'iksil', from: '익일', to: '다음 날', label: '익일 → 다음 날' },
  { id: 'ikwol', from: '익월', to: '다음 달', label: '익월 → 다음 달' },
  { id: 'iknyeon', from: '익년', to: '다음 해', label: '익년 → 다음 해' },
  { id: 'geumil', from: '금일', to: '오늘', label: '금일 → 오늘' },
  { id: 'gita-deung', from: '및\\s*기타(?:의)?\\s*', to: '및 그 밖의 ', label: '및 기타 → 및 그 밖의' },
  { id: 'gita-ui', from: '기타의\\s*', to: '그 밖의 ', label: '기타의 → 그 밖의' },
  { id: 'gita', from: '기타\\s*(?=(?:필요한|사항|부득이|사유|다른|이에|이와|관계|관련|위원|비용|경비))', to: '그 밖의 ', label: '기타 → 그 밖의' },
  { id: 'euigeo', from: '에\\s*의거하여', to: '에 따라', label: '에 의거하여 → 에 따라' },
  { id: 'euigeo2', from: '에\\s*의거(?=[\\s,])', to: '에 따라', label: '에 의거 → 에 따라' },
  { id: 'euihayeo', from: '에\\s*의하여', to: '에 따라', label: '에 의하여 → 에 따라' },
  { id: 'deuk', from: '을\\s*득하여야', to: '을 받아야', label: '을 득하여야 → 을 받아야' },
  { id: 'deuk2', from: '을\\s*득한', to: '을 받은', label: '을 득한 → 을 받은' },
  { id: 'sojeong', from: '소정의', to: '정해진', label: '소정의 → 정해진' },
  { id: 'jidk', from: '지득한', to: '알게 된', label: '지득한 → 알게 된' },
  { id: 'gakho', from: '각호', to: '각 호', label: '각호 → 각 호' },
  { id: 'gakhang', from: '각항', to: '각 항', label: '각항 → 각 항' },
  { id: 'chi-an', from: '([가-힣])치\\s+(?=않|아니)', to: '$1하지 ', label: '~치 않는다 → ~하지 않는다' },
  { id: 'haetae', from: '해태하', to: '게을리하', label: '해태하다 → 게을리하다' },
  { id: 'gonghi', from: '공히', to: '모두', label: '공히 → 모두' },
  { id: 'yakgan', from: '약간명', to: '몇 명', label: '약간명 → 몇 명' },
  { id: 'jinggu', from: '징구하', to: '제출받', label: '징구하다 → 제출받다' },
  { id: 'hoesi', from: '회시하', to: '회신하', label: '회시하다 → 회신하다' },
  { id: 'garyo', from: '가료', to: '치료', label: '가료 → 치료' },
  { id: 'sanggi', from: '상기(?=\\s*(?:의|와|사항|규정|조|항|내용))', to: '위', label: '상기 → 위' },
];
