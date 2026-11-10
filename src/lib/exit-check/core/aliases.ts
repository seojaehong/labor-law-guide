// 원본: ~/dev/exit-check @cab1cce
// Alias registry and enum source-value tables (docs/03 sections 2-3).
// This file holds SOURCE VALUES and header spellings as they appear in customer files.
// It is data, not product wording, and is excluded from the expression scan (docs/02 section 2).

import type { FileGroup, Scheme, SourceType } from "./types";
import { normalizeToken } from "./values";

export const ALIAS_REGISTRY_VERSION = "alias-0.2.0";

export interface ColumnSpec {
  name: string;
  type: "key" | "date" | "instant" | "enum" | "string" | "decimal" | "integer" | "period";
  required: boolean;
  /** Auto aliases: mapped by header text alone. */
  auto: string[];
  /** Fixture-proposed optional column, not yet a PRD 6.3 standard column. */
  provisional?: boolean;
}

const KEY_COLUMNS: ColumnSpec[] = [
  { name: "company_key", type: "key", required: true, auto: ["사업장키", "사업장토큰"] },
  { name: "worker_token", type: "key", required: true, auto: ["근로자토큰", "직원토큰"] },
  { name: "employment_sequence", type: "integer", required: true, auto: ["고용차수", "입사차수", "재입사차수"] },
];

export const COLUMN_SPECS: Record<FileGroup, ColumnSpec[]> = {
  personnel_exit: [
    ...KEY_COLUMNS,
    { name: "employment_end_date", type: "date", required: true, auto: ["고용종료일", "근로관계종료일", "사용관계종료일", "고용관계종료일", "이직일"] },
    { name: "last_worked_date", type: "date", required: true, auto: ["최종근무일", "마지막근무일", "최종출근일", "최종근로일", "실근무종료일"] },
    { name: "employment_status", type: "enum", required: true, auto: ["재직상태", "고용상태", "재직구분"] },
    { name: "source_as_of", type: "instant", required: true, auto: ["기준일시", "기준일", "자료기준일", "추출기준일"] },
    { name: "employment_start_date", type: "date", required: false, auto: ["입사일", "입사일자", "고용개시일", "근로개시일"] },
    { name: "record_revision", type: "integer", required: false, auto: [], provisional: true },
    { name: "source_system", type: "string", required: false, auto: [], provisional: true },
  ],
  final_payroll_settlement: [
    ...KEY_COLUMNS,
    { name: "pay_period_start", type: "date", required: true, auto: ["귀속시작일", "급여기간시작일", "산정기간시작일"] },
    { name: "pay_period_end", type: "date", required: true, auto: ["귀속종료일", "급여기간종료일", "산정기간종료일"] },
    { name: "payment_date", type: "date", required: true, auto: ["지급일", "지급일자", "실지급일"] },
    { name: "payment_round", type: "string", required: false, auto: ["지급회차", "지급차수", "회차"], provisional: true },
    { name: "settlement_status", type: "enum", required: true, auto: ["정산상태", "정산구분"] },
    { name: "settlement_reference", type: "string", required: true, auto: ["정산참조", "정산서번호", "대장번호", "문서번호"] },
    { name: "settlement_completed_at", type: "instant", required: false, auto: ["정산완료일시", "정산완료일"] },
    { name: "source_as_of", type: "instant", required: true, auto: ["기준일시", "기준일", "자료기준일"] },
  ],
  insurance_loss: [
    ...KEY_COLUMNS,
    { name: "scheme", type: "enum", required: true, auto: ["제도", "보험구분", "보험종류"] },
    { name: "insurance_loss_date", type: "date", required: true, auto: ["상실일", "상실일자", "자격상실일", "상실연월일", "상실년월일"] },
    { name: "submission_at", type: "instant", required: true, auto: ["제출일시", "전송일시", "제출일"] },
    { name: "receipt_or_processing_status", type: "enum", required: true, auto: ["처리상태", "접수상태", "진행상태"] },
    { name: "receipt_at", type: "instant", required: false, auto: ["접수일시", "접수일"] },
    { name: "processed_at", type: "instant", required: false, auto: ["처리일시", "처리일"] },
    { name: "observed_at", type: "instant", required: true, auto: ["조회일시", "확인일시", "관측일시", "조회일"] },
    { name: "source_as_of", type: "instant", required: true, auto: ["기준일시", "기준일", "자료기준일"] },
    { name: "employment_end_date", type: "date", required: false, auto: ["이직일", "이직연월일"] },
  ],
  annual_leave_ledger: [
    ...KEY_COLUMNS,
    { name: "leave_period", type: "period", required: false, auto: [] },
    { name: "leave_period_start", type: "date", required: false, auto: ["사용기간시작일", "연차사용기간시작일"] },
    { name: "leave_period_end", type: "date", required: false, auto: ["사용기간종료일", "연차사용기간종료일"] },
    { name: "granted_days", type: "decimal", required: true, auto: ["발생일수", "부여일수", "발생연차"] },
    { name: "used_days", type: "decimal", required: true, auto: ["사용일수", "사용연차"] },
    { name: "remaining_days", type: "decimal", required: true, auto: ["잔여일수", "잔여연차", "미사용일수"] },
    { name: "carried_over_days", type: "decimal", required: false, auto: ["이월일수"] },
    { name: "adjustment_days", type: "decimal", required: false, auto: ["조정일수"] },
    { name: "ledger_as_of", type: "instant", required: true, auto: ["대장기준일", "작성기준일", "기준일"] },
  ],
};

/** Headers that look like names/contacts: never read; the report says so. */
export const NAME_CONTACT_HEADERS = [
  "성명", "이름", "사원명", "연락처", "휴대폰", "이메일", "주소",
  "name", "workername", "employeename", "email", "phone",
];

/** Name headers beyond the closed list (RV-PRIV3-SCOPE), matched on the normalized header token
 *  (docs/03 5.1). 「성명·성함」 anywhere, 「이름」 alone, a person noun + 「명」 or 「이름」,
 *  or a person word + "name". 「파일이름·시트이름」 are not names of people.
 *  「사업장명·파일명·부서명」 and "filename·companyname" are not names of people. */
const NAME_TOKEN_PATTERN =
  /성명|성함|^(직원|근로자|사원|피보험자|가입자|대상자|퇴직자|퇴사자|입사자|재직자|예금주|수급자|본인|한글|영문|국문|한자)(명|이름)$|^이름$|^(worker|employee|emp|staff|member|person|full|first|last|given|family|korean|english)?name$/u;
const CONTACT_TOKEN_PATTERN = /^(연락처|전화|휴대폰|휴대전화|핸드폰|이메일|메일|전자우편|주소|email|phone|mobile|tel|address)(번호|주소|no|number)?$/u;

/** True for a header that names or contacts a person: such a column is never read (docs/03 3.6). */
export function isNameContactHeader(header: string): boolean {
  const t = normalizeToken(header);
  if (NAME_CONTACT_HEADERS.some((h) => normalizeToken(h) === t)) return true;
  return NAME_TOKEN_PATTERN.test(t) || CONTACT_TOKEN_PATTERN.test(t);
}

/** Resident registration number header pattern (docs/03 4.3). "주민세" does not match. */
export const RRN_HEADER_PATTERN = /주민(등록)?번호|주민등록|외국인등록번호|resident\s*(registration)?\s*(no|number)/iu;

/** The same headers after header normalization (docs/03 5.1: spaces, ()[]·_-. removed, lower case), so
 *  「주민 번호」, 「주민-번호」, 「RRN」, 「SSN」 and 「resident id」 are caught (PRIV-2). */
export const RRN_HEADER_TOKEN_PATTERN =
  /주민(등록)?번호|주민등록|외국인(등록)?번호|^(rrn|ssn)(no|number)?$|resident(registration)?(no|number|id)|socialsecurity(no|number)?/u;

export const EMPLOYMENT_STATUS_VALUES: Record<string, string> = {
  employed: "EMPLOYED", active: "EMPLOYED", 재직: "EMPLOYED",
  ended: "ENDED", exited: "ENDED", 퇴사: "ENDED", 퇴직: "ENDED", 종료: "ENDED", 퇴직처리: "ENDED",
  leaveofabsence: "LEAVE_OF_ABSENCE", onleave: "LEAVE_OF_ABSENCE", 휴직: "LEAVE_OF_ABSENCE",
  returned: "RETURNED", 복직: "RETURNED",
  unknown: "UNKNOWN",
};

export const SETTLEMENT_STATUS_VALUES: Record<string, string> = {
  draft: "DRAFT", scheduled: "DRAFT", 작성중: "DRAFT", 미정산: "DRAFT", 대기: "DRAFT",
  reportedcomplete: "REPORTED_COMPLETE", 정산완료: "REPORTED_COMPLETE", 완료: "REPORTED_COMPLETE",
  reportedpaid: "REPORTED_PAID", paid: "REPORTED_PAID", 지급완료: "REPORTED_PAID", 지급: "REPORTED_PAID",
  unknown: "UNKNOWN",
};

export const RECEIPT_STATUS_VALUES: Record<string, string> = {
  prepared: "PREPARED", 작성: "PREPARED", 저장: "PREPARED", 임시저장: "PREPARED",
  submitted: "SUBMITTED", 제출: "SUBMITTED", 전송: "SUBMITTED", 신고: "SUBMITTED",
  received: "RECEIVED", 접수: "RECEIVED", 접수완료: "RECEIVED",
  processed: "PROCESSED", 처리완료: "PROCESSED", 승인: "PROCESSED", 완료: "PROCESSED",
  returned: "RETURNED", 반려: "RETURNED", 보완: "RETURNED", 오류: "RETURNED",
  unknown: "UNKNOWN",
};

export const SCHEME_VALUES: Record<string, Scheme> = {
  nps: "NPS", 국민연금: "NPS", 연금: "NPS",
  nhis: "NHIS", 건강보험: "NHIS", 건강: "NHIS", 건보: "NHIS",
  ei: "EI", 고용보험: "EI", 고용: "EI",
  iaci: "IACI", 산재보험: "IACI", 산재: "IACI", 산업재해보상보험: "IACI",
};

export const SOURCE_TYPE_VALUES: Record<string, SourceType> = {
  approvedrecord: "APPROVED_RECORD", approvedresult: "APPROVED_RECORD",
  systemexport: "SYSTEM_EXPORT", systemextract: "SYSTEM_EXPORT",
  draft: "DRAFT",
  usernote: "USER_NOTE", userdescription: "USER_NOTE",
};
