// 퇴사 자료 대조 — 화면 문장 틀(초안, 사장님 승인 B3 는 조각 3 PR 에서 받는다).
// labels.ts 가 코드 → 낱말 표라면, 이 파일은 그 낱말을 넣어 만드는 문장과 꼴이다. 화면 모델(view.ts)은 한국어 글자를 갖지 않는다.
// 법률검증 2차 C-운영자표시 권고 7 의 틀(「대조한 ○개 항목에서 …. 대조하지 않은 항목: …」), 「확인이 필요한 항목」,
// 「두 자료의 ○○이 다릅니다」 꼴을 따른다. 결론·고치는 법·예상 금액·자격 표시·기한은 적지 않는다.

/** 요약 한 줄 조각. 가운뎃점으로 잇는다. 확인이 필요한 항목과 대조하지 못한 항목은 따로 센다(합치지 않는다). */
export const SUMMARY_CONFIRM = '확인이 필요한 항목 {n}건';
export const SUMMARY_NOT_COMPARED = '대조하지 못한 항목 {n}건';
export const SUMMARY_COMPARED = '대조한 항목 {n}개';
export const SUMMARY_UNUSABLE = '대조에 쓰지 못한 자료 {n}개';
export const SUMMARY_EXCLUDED = '대조에서 뺀 항목 {n}건';
export const SUMMARY_JOIN = ' · ';

/**
 * 대조 범위 — 이 대조가 보지 않는 것. 「대조한 항목」 목록에 없는 것을 모두 적는다.
 * 고용 종료일과 다른 날짜의 관계(R-009)는 사장님 결정 B4 전에는 싣지 않으므로 여기 적는다(조각 4 에서 다시 본다).
 */
export const SCOPE_NOTE =
  '대조하지 않은 항목: 금액(임금·퇴직금·연차수당), 고용 종료일과 상실일·지급일·상실 신고 제출 시각의 날짜 관계, 연차 일수 계산, ' +
  '급여 귀속 기간이 퇴사 시점과 맞는지, 신고 처리 결과(접수·반려), 퇴직 사유, 세금 신고, 이직확인서. 대조한 항목 목록에 없는 것은 대조하지 않았습니다.';

/**
 * 0건 문장 — 네 자료를 다 썼고, 퇴사로 적힌 근로자 모두를 네 자료에서 맞춰 봤고, 확인이 필요한 항목·대조하지 못한 항목·
 * 대조에 쓰지 못한 자료가 모두 0일 때만. 범위 문장을 꼭 붙인다. (다른 안: 「점검한 {n}개 항목에서 확인이 필요한 항목이 나오지 않았습니다.」 — B3)
 */
export const ZERO_NOTE = '대조한 {n}개 항목에서 차이를 찾지 못했습니다.';
/** 대조에서 뺀 항목이 있을 때 0건 문장 뒤에 붙인다. */
export const ZERO_EXCLUDED_NOTE = '대조에서 뺀 항목은 이 문장에 넣지 않았습니다.';
/** 퇴사로 적힌 근로자가 없어 네 자료를 맞춰 볼 대상이 없을 때 0건 문장 대신. */
export const NO_EXITED_NOTE = '인사·퇴사 자료에 퇴사로 적힌 근로자가 없어 네 자료를 맞춰 보지 않았습니다.';

/** 대조 기준 시각. */
export const CUTOFF_NOTE = '이 예시는 {cutoff}(한국 시간) 기준으로 대조했습니다.';

/** 묶음 제목(조각 3 화면에서 쓴다). */
export const HEADING_CHECK = '확인이 필요한 항목';
export const HEADING_NOT_COMPARED = '대조하지 못한 항목';
export const HEADING_UNUSABLE = '대조에 쓰지 못한 자료';
export const HEADING_EXCLUDED = '대조에서 뺀 항목';
export const HEADING_COMPARED = '대조한 항목';
export const HEADING_UNUSED_COLUMNS = '대조에 쓰지 않은 열';
/** 대조하지 못한 항목 묶음이 있을 때만 그 묶음 아래 붙인다(조각 3). */
export const NOTE_NOT_COMPARED = '대조하지 못한 항목은 차이가 없는 것으로 세지 않고 따로 적었습니다.';

/** 근거 위치. 파일 이름·시트 이름은 쓰지 않는다. 값은 날짜·시각 칸일 때만 괄호에 붙인다. */
export const PLACE_GROUP = '{group}';
export const PLACE_INLINE = '{group}(직접 입력)';
export const PLACE_ROW = '{group} {row}행';
export const PLACE_CELL = '{group} {row}행 {col}열';
export const PLACE_WITH_VALUE = '{place}({value})';
/** 값을 본 자리가 아니라 대조의 기준이 된 행일 때(행이 없다는 항목 등) 역할을 글자로 붙인다. */
export const PLACE_ANCHOR = '대조 기준 행: {place}';

/** 날짜·시각 꼴(한국 시간). */
export const DATE_FORMAT = '{y}.{m}.{d}.';
export const INSTANT_FORMAT = '{y}.{m}.{d}. {hh}:{mm}';
export const CUTOFF_FORMAT = '{y}.{m}.{d}. {hh}:{mm}:{ss}';

/** 대조에 쓰지 않은 열. 머리글 글자와 칸 값은 싣지 않는다. */
export const UNUSED_COLUMNS = '{group}에서 대조에 쓰지 않은 열: {columns}. 이 열의 값은 대조에 쓰지 않았고 화면에도 싣지 않았습니다.';
export const UNUSED_COLUMN_ITEM = '{col}열({kind})';

/** 직접 입력한 내용을 대조에 쓰지 못했을 때. */
export const INLINE_BLOCKED = '직접 입력한 {group} 내용을 대조에 쓰지 못했습니다.';

/** 칸 이름 꼴. */
export const FIELD_OF_GROUP = '{group}의 {column}';
export const FIELD_WITH_SCHEME = '{scheme} {column}';
export const TARGET_WITH_SCHEME = '{group} 중 {scheme}';

/** 목록 잇기. 자료 이름처럼 가운뎃점이 든 이름은 쉼표로, 보험 이름은 가운뎃점으로 잇는다. */
export const LIST_JOIN = ', ';
export const NAME_JOIN = '·';

/** 모르는 값이 들어왔을 때(코드 글자를 그대로 내지 않는다). */
export const STATUS_FALLBACK = '확인 필요';
export const REASON_FALLBACK = '확인이 필요한 항목: {field}';
export const GATE_REASON_FALLBACK = '{group}를 대조에 쓰지 못했습니다.';
export const NOT_COMPUTED_FALLBACK = '날짜 관계 일부를 대조하지 않았습니다.';
export const FIELD_FALLBACK = '자료의 한 항목';
export const GROUP_FALLBACK = '자료';
export const SCHEME_FALLBACK = '그 밖의 보험';
export const COMPARED_FALLBACK = '그 밖의 대조 항목';
export const KIND_FALLBACK = '대조에 쓰지 않은 열';
