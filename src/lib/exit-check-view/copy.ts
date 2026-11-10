// 퇴사 자료 대조 — 화면 문장 틀(초안, 사장님 승인 B3 는 조각 3 PR 에서 받는다).
// labels.ts 가 코드 → 낱말 표라면, 이 파일은 그 낱말을 넣어 만드는 문장과 꼴이다. 화면 모델(view.ts)은 한국어 글자를 갖지 않는다.
// 법률검증 2차 C-운영자표시: 「대조한 ○개 항목에서 차이가 발견되지 않았습니다. 대조하지 않은 항목: …」, 「확인이 필요한 항목」,
// 「두 자료의 ○○이 다릅니다」 꼴만 쓴다. 결론·고치는 법·예상 금액·자격 표시·기한은 적지 않는다.

/** 요약 한 줄 조각. 가운뎃점으로 잇는다. */
export const SUMMARY_CONFIRM = '확인할 항목 {n}건';
export const SUMMARY_COMPARED = '대조한 항목 {n}개';
export const SUMMARY_UNUSABLE = '대조에 쓰지 못한 자료 {n}개';
export const SUMMARY_EXCLUDED = '대조에서 뺀 항목 {n}건';
export const SUMMARY_JOIN = ' · ';

/** 대조 범위. 이 대조가 보지 않는 것. 날짜는 대조하므로 여기 넣지 않는다. */
export const SCOPE_NOTE = '대조하지 않은 항목: 금액(임금·퇴직금·연차수당), 퇴직 사유, 세금 신고, 이직확인서.';

/** 확인할 항목도, 대조에 쓰지 못한 자료도 없을 때만. 범위 문장을 꼭 붙인다. */
export const ZERO_NOTE = '대조한 {n}개 항목에서 차이가 발견되지 않았습니다.';

/** 대조 기준 시각. */
export const CUTOFF_NOTE = '이 예시는 {cutoff}(한국 시간) 기준으로 대조했습니다.';

/** 묶음 제목(조각 3 화면에서 쓴다). */
export const HEADING_CHECK = '확인이 필요한 항목';
export const HEADING_NOT_COMPARED = '자료가 없거나 보류되어 대조하지 못한 항목';
export const HEADING_UNUSABLE = '대조에 쓰지 못한 자료';
export const HEADING_EXCLUDED = '대조에서 뺀 항목';
export const HEADING_COMPARED = '대조한 항목';
export const HEADING_UNUSED_COLUMNS = '대조에 쓰지 않은 열';
export const NOTE_NOT_COMPARED = '대조하지 못한 항목은 차이가 없는 것으로 세지 않고 따로 적었습니다.';

/** 근거 위치. 파일 이름·시트 이름은 쓰지 않는다. 값은 날짜·시각 칸일 때만 괄호에 붙인다. */
export const PLACE_GROUP = '{group}';
export const PLACE_INLINE = '{group}(직접 입력)';
export const PLACE_ROW = '{group} {row}행';
export const PLACE_CELL = '{group} {row}행 {col}열';
export const PLACE_WITH_VALUE = '{place}({value})';

/** 날짜·시각 꼴(한국 시간). */
export const DATE_FORMAT = '{y}.{m}.{d}.';
export const INSTANT_FORMAT = '{y}.{m}.{d}. {hh}:{mm}';
export const CUTOFF_FORMAT = '{y}.{m}.{d}. {hh}:{mm}:{ss}';

/** 대조에 쓰지 않은 열. 머리글 글자와 칸 값은 싣지 않는다. */
export const UNUSED_COLUMNS = '{group} — 대조에 쓰지 않은 열: {columns}. 이 열의 값은 대조에 쓰지 않았고 화면에도 싣지 않았습니다.';
export const UNUSED_COLUMN_ITEM = '{col}열({kind})';

/** 직접 입력한 내용을 대조에 쓰지 못했을 때. */
export const INLINE_BLOCKED = '직접 입력한 {group} 내용을 대조에 쓰지 못했습니다.';

/** 칸 이름 꼴. */
export const FIELD_OF_GROUP = '{group}의 {column}';
export const FIELD_WITH_SCHEME = '{scheme} {column}';
export const TARGET_WITH_SCHEME = '{group} 중 {scheme}';

/** 목록 잇기. */
export const LIST_JOIN = ', ';
export const NAME_JOIN = '·';

/** 모르는 값이 들어왔을 때(코드 글자를 그대로 내지 않는다). */
export const STATUS_FALLBACK = '확인 필요';
export const REASON_FALLBACK = '{field} — 확인이 필요한 항목입니다.';
export const GATE_REASON_FALLBACK = '{group}를 대조에 쓰지 못했습니다.';
export const NOT_COMPUTED_FALLBACK = '날짜 관계 일부를 대조하지 않았습니다.';
export const FIELD_FALLBACK = '자료의 한 항목';
export const GROUP_FALLBACK = '자료';
export const SCHEME_FALLBACK = '그 밖의 보험';
export const COMPARED_FALLBACK = '그 밖의 대조 항목';
export const KIND_FALLBACK = '대조에 쓰지 않은 열';
