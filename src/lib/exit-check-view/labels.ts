// 퇴사 자료 대조 — 화면 라벨 표(초안, 사장님 승인 B3 는 조각 3 PR 에서 받는다).
// 엔진 사본이 내는 코드(상태·사유·제도·자료 묶음·칸 이름·대조 항목)를 화면 한국어로 바꾸는 표다.
// 문장 틀과 꼴(요약·0건 문장·근거 위치)은 copy.ts 에 있다. 두 파일만 읽으면 화면에 나올 글자를 다 볼 수 있다.
//
// 쓰는 말: 점검·대조·확인·정리·기준·알림. 쓰지 않는 말: exit-check-wording.test.ts 의 금지 목록과 금지 꼴(결론형·넓은 보증·기한·자격 표시·의뢰 유도·시정 지시 등).
// 낱말 구분: 「열」은 머리글 아래 세로 한 줄 전체, 「칸」은 한 행의 값 하나. 「자료 기준 시각」은 자료에 적힌 시각, 「대조 기준 시각」은 이 대조의 기준 시각.
// 자리표시자: {field} 칸 이름(자료 이름 포함) · {column} 칸 이름만 · {group} 자료 이름 · {scheme} 제도 이름 · {fields} 칸 이름 여럿.
// 자료 이름은 넷 다 「자료」로 끝나므로 문장 틀이 「자료에·자료를·자료가」로 조사를 고정한다.

/** 자료 묶음. */
export const FILE_GROUP_LABEL: Readonly<Record<string, string>> = {
  personnel_exit: '인사·퇴사 자료',
  final_payroll_settlement: '급여 정산 자료',
  insurance_loss: '4대보험 상실 자료',
  annual_leave_ledger: '연차 대장 자료',
};

/** 제도. */
export const SCHEME_LABEL: Readonly<Record<string, string>> = {
  NPS: '국민연금',
  NHIS: '건강보험',
  EI: '고용보험',
  IACI: '산재보험',
};

/** 칸 이름(엔진 표준 칸 + 칸 꼬리). */
export const FIELD_LABEL: Readonly<Record<string, string>> = {
  company_key: '사업장 구분값',
  worker_token: '근로자 구분값',
  employment_sequence: '고용 차수',
  employment_end_date: '고용 종료일',
  last_worked_date: '마지막 근무일',
  employment_status: '재직 상태',
  source_as_of: '자료 기준 시각',
  employment_start_date: '입사일',
  record_revision: '정정 순번',
  source_system: '자료를 뽑은 시스템',
  pay_period_start: '귀속 시작일',
  pay_period_end: '귀속 종료일',
  payment_date: '지급일',
  payment_round: '지급 회차',
  settlement_status: '정산 상태',
  settlement_reference: '정산 참조 번호',
  settlement_completed_at: '정산 완료 시각',
  scheme: '보험 구분',
  insurance_loss_date: '상실일',
  submission_at: '상실 신고 제출 시각',
  receipt_or_processing_status: '처리 상태',
  receipt_at: '접수 시각',
  processed_at: '처리 시각',
  observed_at: '조회 시각',
  leave_period: '연차 사용 기간',
  leave_period_start: '연차 사용 기간 시작일',
  leave_period_end: '연차 사용 기간 종료일',
  granted_days: '발생 일수',
  used_days: '사용 일수',
  remaining_days: '잔여 일수',
  carried_over_days: '이월 일수',
  adjustment_days: '조정 일수',
  ledger_as_of: '대장 기준 시각',
  // 칸 꼬리
  row: '행',
  evidence: '파일·행 위치 기록',
  supersedes: '정정 대상',
  source_type: '자료 종류',
};

/** 항목 상태. 「맞음·통과」 상태는 없다 — 차이가 없으면 항목이 생기지 않는다. */
export const STATUS_LABEL: Readonly<Record<string, string>> = {
  DISCREPANCY: '값이 서로 다름',
  INCOMPLETE: '자료 확인',
  STALE: '기준 시점 확인',
  REVIEW_REQUIRED: '추가 확인',
  ON_HOLD: '대조 보류',
  MISSING_INPUT: '대조하지 못함',
  NOT_APPLICABLE: '대조에서 뺌',
  SCHEMA_BLOCKED: '대조에 쓰지 못한 자료',
};

/** 대조하지 못한 항목(날짜 관계를 셈하지 못한 표시)의 상태 이름. B4 전에는 화면 모델이 날짜 관계를 싣지 않아 쓰이지 않는다(조각 4). */
export const NOT_COMPARED_LABEL = '대조하지 않음';

/** 항목 사유 → 문장. 사실만 적는다(결론·고치는 법·금액 없음). */
export const REASON_TEXT: Readonly<Record<string, string>> = {
  // 값
  EMPTY: '{field} 칸이 비어 있습니다.',
  FORMAT: '{field} 칸의 값이 정해진 형식과 다릅니다.',
  PARSE: '{field} 칸의 값을 해석하지 못했습니다.',
  COLUMN_NOT_PROVIDED: '{group}에 {column} 열이 없습니다.',
  KEY_COLUMN_NOT_PROVIDED: '{group}에 {column} 열이 없어 다른 자료와 맞춰 보지 못했습니다.',
  // 자료·행
  FILE_GROUP_NOT_PROVIDED: '{group}가 없어 그 자료가 필요한 대조는 하지 않았습니다.',
  FILE_BLOCKED: '{group}를 대조에 쓰지 못해 그 자료가 필요한 대조는 하지 않았습니다.',
  ROW_NOT_FOUND: '{group}에서 같은 근로자·고용 차수의 행을 찾지 못했습니다.',
  NO_PERSONNEL_ROW_FOR_KEY: '인사·퇴사 자료에서 같은 근로자·고용 차수의 행을 찾지 못했습니다.',
  APPROVED_EXCLUSION_RECORD: '{field} 항목은 대조에서 빼기로 한 기록이 있어 대조하지 않았습니다.',
  // 4대보험
  // 행이 대조 기준 시각 뒤라 대조에서 빠진 경우에도 같은 사유가 나오므로 「없습니다」가 아니라 「찾지 못했습니다」로 적는다.
  SCHEME_ROW_NOT_FOUND: '4대보험 상실 자료에서 {scheme} 행을 찾지 못했습니다.',
  SCHEME_NOT_COVERED_BY_ANY_FILE: '{scheme} 상실 내역이 담긴 자료가 없어 대조하지 않았습니다.',
  SCHEME_VALUE_NOT_INTERPRETED: '{column} 칸의 값이 어느 보험인지 알 수 없습니다.',
  EMPTY_WITH_SUBMITTED_STATUS: '처리 상태가 제출 이후 단계로 적혀 있는데 {field} 칸이 비어 있습니다.',
  SAME_OBSERVATION_TIME_STATUS_DIFFERS: '같은 조회 시각에 {field} 값이 서로 다른 행이 있습니다.',
  // 날짜·상태 — 「두 자료의」는 근거가 정확히 두 파일일 때만(한 파일·세 파일 이상은 아래 두 표).
  SAME_CONCEPT_VALUES_DIFFER: '두 자료의 {field} 값이 다릅니다.',
  // 기준이 서로 다를 때뿐 아니라 기준이 적혀 있지 않을 때도 이 사유가 나온다(r002_dates.ts:36-40).
  END_DATE_BASIS_NOT_COMPARABLE: '자료마다 {field} 칸을 적은 기준(마지막 근무일인지 그다음 날인지)이 다르거나 적혀 있지 않아 값을 바로 맞춰 보지 않았습니다.',
  // 같은 인사·퇴사 자료의 고용 종료일만 있어도 이 사유가 나온다(r002_dates.ts:79-84) — 「다른 자료에」라고 쓰지 않는다.
  STATUS_ACTIVE_WITH_EXIT_RECORDS: '재직 상태는 재직으로 적혀 있는데 고용 종료일 값이나 퇴사 관련 행(급여 정산·4대보험 상실)이 있습니다.',
  LEAVE_OF_ABSENCE: '재직 상태가 휴직으로 적혀 있어 대조를 보류했습니다.',
  RETURNED: '재직 상태가 복직으로 적혀 있어 대조를 보류했습니다.',
  STATUS_UNKNOWN: '재직 상태 칸의 값이 어떤 상태인지 알 수 없어 대조를 보류했습니다.',
  // 기준 시각
  RECORD_AFTER_CUTOFF: '{field} 값이 대조 기준 시각보다 늦은 행이 있습니다.',
  SNAPSHOT_BEFORE_EVENT: '{field} 값이 고용 종료일보다 앞섭니다.',
  // 내용이 같은 자료가 아니라, 다른 자료의 기준 시각이 인사·퇴사 자료의 정정 시각보다 앞선다는 뜻이다(r004_freshness.ts:88-97).
  LATER_CORRECTION_NOT_REFLECTED: '{field} 값보다 늦은 시각에 적힌 인사·퇴사 자료 행이 따로 있습니다.',
  OLDER_THAN_APPROVED_MAX_AGE: '{field} 값과 대조 기준 시각의 간격이 정해 둔 기간보다 깁니다.',
  // 급여 정산
  MULTIPLE_PAYMENTS_ROUND_COLUMN_ABSENT: '지급일이 여러 개인데 지급 회차 열이 없습니다.',
  MULTIPLE_PAYMENTS_ROUND_EMPTY: '지급일이 여러 개인데 지급 회차 칸이 비어 있습니다.',
  MULTIPLE_PAYMENTS_ROUND_NOT_DISTINCT: '지급일이 여러 개인데 지급 회차 값이 서로 같습니다.',
  SETTLEMENT_REFERENCE_ON_SEVERAL_SEQUENCES: '같은 정산 참조 번호가 여러 고용 차수에 붙어 있습니다.',
  // 정정 관계
  SAME_SOURCE_SAME_ORDER_VALUES_DIFFER: '정정 순서가 같은 행끼리 {field} 값이 다릅니다.',
  SUPERSEDES_SELF: '{group}의 정정 대상이 자기 자신으로 적혀 있습니다.',
  SUPERSEDES_OTHER_FILE_GROUP: '{group}의 정정 대상이 다른 종류의 자료로 적혀 있습니다.',
  SUPERSEDES_CYCLE: '{group}의 정정 대상이 서로를 가리킵니다.',
  SUPERSEDED_FILE_NOT_IN_RUN: '{group}의 정정 대상 자료가 이번 대조에 없습니다.',
  SUPERSEDED_FILE_BLOCKED: '{group}의 정정 대상 자료를 대조에 쓰지 못했습니다.',
  // 근거
  SOURCE_TYPE_UNDECLARED: '{group}의 자료 종류(시스템에서 뽑은 자료인지, 승인된 기록인지 등)가 적혀 있지 않습니다.',
  NO_FILE_HASH_OR_LOCATOR: '{group}의 일부 값에 파일·행 위치 기록이 없습니다.',
};

/** 근거가 한 파일 안에만 있을 때 바꿔 쓰는 문장(「두 자료의」가 사실이 아닐 때). */
export const REASON_TEXT_ONE_FILE: Readonly<Record<string, string>> = {
  SAME_CONCEPT_VALUES_DIFFER: '{group} 안에서 {column} 값이 행마다 다릅니다.',
};

/** 근거가 세 파일 이상에 걸칠 때 바꿔 쓰는 문장(「두 자료의」가 사실이 아닐 때). */
export const REASON_TEXT_MANY_FILES: Readonly<Record<string, string>> = {
  SAME_CONCEPT_VALUES_DIFFER: '여러 자료의 {field} 값이 서로 다릅니다.',
};

/** 자료를 대조에 쓰지 못한 사유 → 문장. */
export const GATE_REASON_TEXT: Readonly<Record<string, string>> = {
  MISSING_KEY_COLUMN: '{group}에 맞춰 보는 데 꼭 필요한 열({fields})이 없어 이 자료를 대조에 쓰지 못했습니다.',
  RRN_PATTERN: '{group}에 주민등록번호 형태의 값이 있어 이 자료를 대조에 쓰지 않았습니다.',
  NAME_COLUMN_ALIAS: '{group}에서 이름·연락처 열이 대조 칸으로 지정되어 이 자료를 대조에 쓰지 않았습니다.',
  FORMAT_NOT_ACCEPTED: '{group}의 파일 형식은 대조에 쓰는 형식이 아닙니다.',
  SHEET_NOT_SPECIFIED: '{group}에서 어느 시트를 쓸지 정해지지 않았습니다.',
  SHEET_NOT_FOUND: '{group}에서 정해 둔 시트를 찾지 못했습니다.',
  ROW_LIMIT: '{group}의 행 수가 한도를 넘었습니다.',
  MERGED_HEADER: '{group}의 머리글 줄에 병합된 칸이 있습니다.',
  HEADER_ROW_EMPTY: '{group}의 머리글 줄이 비어 있습니다.',
  ALIAS_TARGET_UNKNOWN: '{group}의 열 대응 설정에 없는 칸 이름이 있습니다.',
  DUPLICATE_MAPPING: '{group}에서 한 칸에 여러 열이 대응되어 있습니다.',
  CSV_NOT_UTF8: '{group} 파일의 글자 인코딩이 맞지 않습니다.',
  CSV_SYNTAX: '{group} 파일의 쉼표 구분 형식이 맞지 않습니다.',
  FILE_SIZE_LIMIT: '{group} 파일의 크기가 한도를 넘었습니다.',
  UNCOMPRESSED_SIZE_LIMIT: '{group} 파일을 풀었을 때 크기가 한도를 넘었습니다.',
  ENCRYPTED_OR_LEGACY_CONTAINER: '{group} 파일에 암호가 걸려 있거나 예전 엑셀 형식입니다.',
  MACRO_PRESENT: '{group} 파일에 매크로가 있습니다.',
  EXTERNAL_LINK_PRESENT: '{group} 파일에 외부 연결이 있습니다.',
  XLSX_NOT_READABLE: '{group} 엑셀 파일을 열지 못했습니다.',
  NOT_A_ZIP_CONTAINER: '{group} 엑셀 파일의 내부 구조가 맞지 않습니다.',
  ZIP_DIRECTORY_CORRUPT: '{group} 엑셀 파일의 내부 구조가 맞지 않습니다.',
  ZIP_DIRECTORY_NOT_FOUND: '{group} 엑셀 파일의 내부 구조가 맞지 않습니다.',
  ZIP_LAYOUT_NOT_SUPPORTED: '{group} 엑셀 파일의 내부 구조가 맞지 않습니다.',
  WORKBOOK_PART_NOT_FOUND: '{group} 엑셀 파일의 내부 구조가 맞지 않습니다.',
  BLOCKED: '{group}를 대조에 쓰지 못했습니다.',
};

/**
 * 대조한 항목 이름 — 엔진이 실제로 한 일 그대로 적는다(값끼리 견준 것인지, 칸에 값이 있는지만 본 것인지).
 * {groups}·{schemes}·{target} 은 콜론 뒤 값을 바꾼 이름이다.
 */
export const COMPARED_ITEM_LABEL: Readonly<Record<string, string>> = {
  identifier_triplet_present_in_4_families: '네 자료에 같은 사업장·근로자·고용 차수가 있는지',
  identifier_triplet_present_in: '{groups}에 같은 사업장·근로자·고용 차수가 있는지',
  employment_end_date_single_source: '인사·퇴사 자료에 고용 종료일 값이 있는지',
  employment_end_date_sources_equal: '인사·퇴사 자료의 고용 종료일 값이 서로 같은지',
  employment_status_not_ended: '재직으로 적힌 근로자에게 고용 종료일 값이나 퇴사 관련 행이 없는지',
  scheme_rows_present: '4대보험 상실 자료에 {schemes} 행이 있는지',
  snapshot_after_event: '자료 기준 시각이 고용 종료일과 같거나 그 뒤인지',
  settlement_reference_and_period_linked: '급여 정산 자료의 귀속 기간·지급일·정산 상태·정산 참조 번호 칸에 값이 있는지',
  ledger_as_of_and_period_linked: '연차 대장 자료의 대장 기준 시각·사용 기간·일수 칸에 값이 있는지',
  correction_chain_preserved: '{target}의 정정 순서',
  duplicate_rows_identical: '{target}의 같은 내용 중복 행',
  // 엔진 내부 점검이라 화면 모델이 세지도 싣지도 않는다(view.ts). 라벨 전수 시험 때문에 이름만 둔다.
  file_sha256_and_locator_present: '값마다 파일·행 위치 기록',
  // R-009 날짜 관계 — 사장님 결정 B4 전에는 화면 모델이 세지도 싣지도 않는다(view.ts). 조각 4 에서 싣는 초안이다.
  // 상실 신고 제출 시각은 고용 종료일이 아니라 그 제도의 상실일에서 센 날짜와 견준다(deadline-rules.json anchor_field=insurance_loss_date).
  loss_date_equals_derived_candidate: '{schemes} 상실일과 고용 종료일의 날짜 관계',
  payment_date_outside_boundary_window: '지급일과 고용 종료일의 날짜 관계',
  submission_not_later_than_earliest_candidate: '{schemes} 상실 신고 제출 시각과 상실일의 날짜 관계',
};

/** 날짜 관계를 셈하지 못한 까닭 → 대조하지 못한 항목 문장. R-009 이므로 B4 전에는 화면 모델이 싣지 않는다(조각 4 초안). */
export const NOT_COMPUTED_TEXT: Readonly<Record<string, string>> = {
  employment_end_date_values_differ:
    '고용 종료일 값이 하나로 정해지지 않아, 고용 종료일을 기준으로 보는 날짜(상실일·지급일·상실 신고 제출 시각)는 대조하지 않았습니다.',
  employment_end_date_missing: '고용 종료일 값이 없어, 고용 종료일을 기준으로 보는 날짜(상실일·지급일·상실 신고 제출 시각)는 대조하지 않았습니다.',
};

/** 대조에 쓰지 않은 열의 종류. */
export const IGNORED_KIND_LABEL: Readonly<Record<string, string>> = {
  name_contact: '이름·연락처 열',
  unmapped: '이 대조에서 쓰는 칸이 아닌 열',
};
