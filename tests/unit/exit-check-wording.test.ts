// 퇴사 자료 대조 — 화면 문구 시험(계획 조각 2 · 반박검수 · 법률검증 2차 C-운영자표시).
// 보는 글자: labels.ts·copy.ts 가 내보내는 문자열 전부 + 17개 fixture 와 모르는 값 결과의 화면 모델 글자 전부.
// 전역 src/lib/tool-kit/banned.ts 는 읽기만 한다(고치지 않는다). 여기 목록은 그보다 넓고 예외 구절이 없다.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { prepareFromManifest, type RunManifest } from '@/lib/exit-check/config';
import { COLUMN_SPECS } from '@/lib/exit-check/core/aliases';
import { runCore, type CoreReport } from '@/lib/exit-check/core/run';
import { FILE_GROUPS, SCHEMES, type DeadlineRulesFile } from '@/lib/exit-check/core/types';
import rulesJson from '@/lib/exit-check/deadline-rules.json';
import { RESULT_BANNED, SERVICE_BANNED } from '@/lib/tool-kit/banned';
import * as COPY from '@/lib/exit-check-view/copy';
import * as LABELS from '@/lib/exit-check-view/labels';
import { toExitCheckView } from '@/lib/exit-check-view/view';
import { EXIT_CHECK_SCENARIOS } from '../fixtures/exit-check/scenarios';
import { blankComments } from './exit-check-imports';

const ROOT = join(__dirname, '..', '..');
const ENGINE = 'src/lib/exit-check';
const rules = rulesJson as DeadlineRulesFile;
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

// ---- 금지 목록 ----

/** 사이트 화면 금지어 10개(작업 지시) — 부분 문자열, 예외 없음. */
const SERVICE_WORDS = ['노무사', '상담', '진단', '판정', '지도', '대리', '대행', '대신', '자문', '적법'];
/** 결론형 표현(법률검증 2차 C-운영자표시 권고 3 · 계획 조각 2). */
const CONCLUSION_WORDS = ['위반', '위법', '적법', '문제없음', '문제 없음', '이상 없음', '이상없음', '안전', '미지급', '누락', '도과', '체불'];
/** 기한 — L+12·L+13 을 기한으로 내보이지 않는다(법률검증 2차 A-14일기산 제품 함의). 날짜 계산 문장은 조각 4(B4 뒤). */
const DEADLINE_WORDS = ['기한', '마감', '법정'];
/** 자격·검수 표시, 맡기는 말(권고 4·7). */
const QUALIFICATION_WORDS = ['공인노무사', '검토', '감수', '의뢰', '신청', '맡기', '맡겨'];
/** 개선 방안·바로잡는 법·예상 금액(권고 8). */
const REMEDY_WORDS = ['개선', '시정', '방안', '예상', '추정', '고치', '바로잡'];
/** 반박검수: 「읽지 않은 열」 대신 「대조에 쓰지 않은 열」. 읽는 일 자체를 말하지 않는다. */
const READING_WORDS = ['읽지'];

const BANNED = [
  ...new Set([
    ...SERVICE_WORDS,
    ...CONCLUSION_WORDS,
    ...DEADLINE_WORDS,
    ...QUALIFICATION_WORDS,
    ...REMEDY_WORDS,
    ...READING_WORDS,
    ...SERVICE_BANNED,
    ...RESULT_BANNED,
  ]),
];

/**
 * 금지 꼴 — 낱말 목록은 적힌 글자 그대로만 막는다. 합니다체로 쓴 결론형·넓은 보증·기한 서술·자격 표시·의뢰 유도·시정 지시·
 * 「읽다」 활용형은 낱말 목록을 지나가므로 서술 꼴로 막는다(조각 2 검수 — 변형 24개 중 23개를 이 꼴이 잡는다. 남는 하나인
 * 머리글 원문은 아래 구조 시험이 본다). 운영자 표시를 개인 명의로 두므로 의뢰 유도·자격 표시 꼴은 빼지 않는다(법률검증 2차).
 */
const PATTERNS: Array<[string, RegExp]> = [
  ['문제…없', /문제\s*(가|는|도)?\s*없/],
  ['이상…없', /이상\s*(이|은|도)?\s*없/],
  ['정상', /정상/],
  ['넓은 보증', /모두|전부|모든|빠짐없이/],
  ['일치', /일치/],
  ['맞습니다', /맞습니다|맞았습니다/],
  ['어기다', /어긴|어겼|어기/],
  ['○일 이내', /\d+\s*일\s*(이내|안에|내에)/],
  ['…까지 …해야', /까지\s*[^.]{0,14}(해야|하셔야|내야|하세요|하십시오)/],
  ['늦었·지났·넘겼', /늦었|늦게\s|지났|넘겼|경과/],
  ['지급하지 않', /지급(하지|되지)\s*않/],
  ['빠뜨리다', /빠뜨|빠진|빠졌/],
  ['전문가·자격자', /전문가|자격자/],
  ['문의·연락 유도', /문의|연락(해|을|\s*주)/],
  ['명령형', /세요|십시오/],
  ['해야 합니다', /해야\s*(합니다|함)|하셔야|바랍니다/],
  ['읽다 활용형', /열어\s*보지|읽어|읽은|읽습|읽는/],
  ['제재', /과태료|벌금|벌칙|처벌|제재/],
];

/** 문자열 하나의 위반 목록. 라틴 글자는 셀 열 표기(「H열」「AB열」)만 허용한다 — 코드·식별자·파일 이름·시트 이름·키가 다 여기서 걸린다. */
function wordingHits(s: string): string[] {
  const hits: string[] = BANNED.filter((w) => s.includes(w)).map((w) => `금지어 ${w}`);
  for (const [name, re] of PATTERNS) if (re.test(s)) hits.push(`꼴 ${name}`);
  const latin = s.replace(/[A-Z]{1,3}열/g, '');
  if (/[A-Za-z]/.test(latin)) hits.push('라틴 글자');
  if (s.includes('_')) hits.push('밑줄');
  if (s.includes('|')) hits.push('세로줄');
  if (/sha256/i.test(s)) hits.push('해시');
  for (const h of hrefHits(s)) hits.push(`링크 ${h}`);
  for (const a of amountHits(s)) hits.push(`금액 ${a}`);
  return hits;
}

/** 링크: 물음표(쿼리)·표본 값이 붙은 링크는 금지(반박검수). 지금 문안에는 링크가 없고, 생기면 이 검사를 지나야 한다. */
const SAMPLE_VALUE = /\d{4}-\d{2}-\d{2}|[A-Z]-\d|[A-Z]-[A-Z]/;
function hrefHits(s: string): string[] {
  const links = s.match(/(?:https?:\/\/|(?<![\w.])\/)[^\s"'<>)」]*/g) ?? [];
  return links.filter((l) => l.includes('?') || SAMPLE_VALUE.test(l));
}

/**
 * 금액: 금액을 적는 문장은 「입력값 기준 계산액」을 함께 적는다. 법률검증 2차 권고 8 은 「입력값 기준 추정액」이라 했지만
 * 이 도구는 「추정」을 금지어로 막으므로 권고 7 의 표현 「입력값 기준 계산액」으로 하나로 정했다. 지금 화면 모델에는 금액이 없다.
 */
const AMOUNT_TAG = '입력값 기준 계산액';
function amountHits(s: string): string[] {
  const m = s.match(/\d[\d,]*\s*(원|만원|억원)/g) ?? [];
  return m.length > 0 && !s.includes(AMOUNT_TAG) ? m : [];
}

/** 조각 2 검수가 고치지 않은 문구 시험을 초록으로 지나간 변형 문장(머리글 원문 하나는 구조 시험이 본다). */
const VARIANTS = [
  '이 자료에는 문제가 없습니다.',
  '이상이 없습니다.',
  '문제없습니다.',
  '이상 없습니다.',
  '모두 확인했습니다.',
  '정상입니다.',
  '모든 항목이 맞습니다.',
  '법을 어긴 곳은 없습니다.',
  '지급일이 14일 이내입니다.',
  '다음 달 15일까지 신고해야 합니다.',
  '신고가 늦었습니다.',
  '지급하지 않은 금품이 있습니다.',
  '빠뜨린 신고가 있습니다.',
  '전문가가 확인한 결과입니다.',
  '전문가에게 문의하세요.',
  '도움이 필요하면 연락해 주세요.',
  '상실 신고를 다시 내세요.',
  '지급일을 수정하세요.',
  '정정 신고를 해야 합니다.',
  '이 열은 열어 보지 않았습니다.',
  '이 열의 값은 읽어 들이지 않습니다.',
  '과태료가 부과될 수 있습니다.',
  '네 자료가 모두 일치합니다.',
];

/** 모듈이 내보내는 문자열 전부(표의 값·키는 값만). 자리표시자 {이름} 은 빼고 본다. */
function exportedStrings(mod: Record<string, unknown>): Array<{ where: string; text: string }> {
  const out: Array<{ where: string; text: string }> = [];
  const visit = (v: unknown, where: string) => {
    if (typeof v === 'string') out.push({ where, text: v });
    else if (Array.isArray(v)) v.forEach((x, i) => visit(x, `${where}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) visit(x, `${where}.${k}`);
  };
  for (const [k, v] of Object.entries(mod)) visit(v, k);
  return out;
}
const stripPlaceholders = (s: string) => s.replace(/\{[a-z]+\}/g, '');

function viewStrings(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(viewStrings);
  if (v && typeof v === 'object') return Object.values(v).flatMap(viewStrings);
  return [];
}

async function runFixture(sc: (typeof EXIT_CHECK_SCENARIOS)[number]): Promise<CoreReport> {
  const map = new Map<string, Uint8Array>();
  for (const [p, lines] of Object.entries(sc.files)) map.set(p, new TextEncoder().encode(lines.join('\n')));
  const manifest = sc.manifest as unknown as RunManifest;
  const prepared = await prepareFromManifest({ manifest, cutoff_at: manifest.cutoff_at!, files: map, deadline_rules: rules });
  return runCore(prepared.core).core_report;
}

describe('검사기 자기시험 — 심어 둔 위반을 잡는다', () => {
  it.each(BANNED)('금지어 %s', (w) => {
    expect(wordingHits(`대조 결과 ${w} 항목`)).toContain(`금지어 ${w}`);
  });

  it('코드·키·파일 이름·시트 이름·해시·세로줄·밑줄을 잡고, 열 표기는 지나간다', () => {
    expect(wordingHits('상태 INCOMPLETE')).toContain('라틴 글자');
    expect(wordingHits('W-01 의 행')).toContain('라틴 글자');
    expect(wordingHits('personnel_exit.csv 2행')).toEqual(expect.arrayContaining(['라틴 글자', '밑줄']));
    expect(wordingHits('C-A|W-01|1')).toContain('세로줄');
    expect(wordingHits('sha256:abc')).toContain('해시');
    expect(wordingHits('급여 정산 자료 2행 F열, AB열')).toEqual([]);
  });

  it('링크: 쿼리·표본 값이 붙은 링크를 잡는다', () => {
    expect(hrefHits('/exit-employer?exit=2026-09-30#hi-loss')).toEqual(['/exit-employer?exit=2026-09-30#hi-loss']);
    expect(hrefHits('자세히: /exit-employer/W-01')).toHaveLength(1);
    expect(hrefHits('https://example.org/a?b=1')).toHaveLength(1);
    expect(hrefHits('/exit-employer#hi-loss')).toEqual([]);
    expect(wordingHits('/exit-employer?exit=2026-09-30#hi-loss').some((h) => h.startsWith('링크'))).toBe(true);
  });

  it('금액: 「입력값 기준 계산액」 없이 금액을 적으면 잡는다(「추정액」은 금지어로도 걸린다)', () => {
    expect(amountHits('퇴직금 1,234,000원')).toEqual(['1,234,000원']);
    expect(amountHits('퇴직금 입력값 기준 계산액 1,234,000원')).toEqual([]);
    expect(amountHits('퇴직금 입력값 기준 1,234,000원')).toEqual(['1,234,000원']);
    expect(wordingHits('퇴직금 입력값 기준 추정액 1,234,000원')).toEqual(expect.arrayContaining(['금지어 추정', '금액 1,234,000원']));
    expect(amountHits('2026.10.8.')).toEqual([]);
  });

  it.each(VARIANTS)('낱말 목록을 지나가던 변형을 꼴로 잡는다: %s', (s) => {
    expect(wordingHits(s).filter((h) => h.startsWith('꼴 '))).not.toEqual([]);
  });

  it('머리글 원문 검사: 우리 낱말에 없는 머리글 글자가 화면 글자에 있으면 잡는다', () => {
    expect(headerLeaks(['근로자토큰', '지급일'], ['머리글 근로자토큰 칸입니다.'])).toEqual(['근로자토큰']);
    expect(headerLeaks(['지급일'], ['급여 정산 자료 2행 F열'])).toEqual([]);
  });
});

/** 문안 두 파일에 나오는 낱말 — 머리글 원문 검사에서 「우리 낱말」로 본다(예: 머리글 「지급일」은 라벨 「지급일」과 같은 글자다). */
const VOCAB = [...exportedStrings(LABELS as Record<string, unknown>), ...exportedStrings(COPY as Record<string, unknown>)].map((x) => x.text).join('\n');
/** 화면 글자에 들어간 머리글 원문 — 우리 낱말에 없는 머리글 칸만 본다. */
function headerLeaks(headers: string[], shown: string[]): string[] {
  const all = shown.join('\n');
  return [...new Set(headers)].filter((h) => h.trim() !== '' && !VOCAB.includes(h) && all.includes(h));
}

describe('문안 두 파일(labels.ts·copy.ts)', () => {
  const all = [...exportedStrings(LABELS as Record<string, unknown>).map((x) => ({ ...x, where: `labels ${x.where}` })), ...exportedStrings(COPY as Record<string, unknown>).map((x) => ({ ...x, where: `copy ${x.where}` }))];

  it('내보내는 문자열이 있다(빈 모듈이면 이 묶음은 아무것도 증명하지 않는다)', () => {
    expect(all.length).toBeGreaterThan(80);
  });

  it('모든 문자열에 금지어·결론형·기한·자격·개선·라틴 글자·밑줄·세로줄·해시·쿼리 링크·기준 없는 금액이 없다', () => {
    const bad = all.flatMap(({ where, text }) => wordingHits(stripPlaceholders(text)).map((h) => `${where}: ${h} — ${text}`));
    expect(bad).toEqual([]);
  });

  it('법률검증 2차 C-운영자표시 문장 꼴을 쓴다(0건 문장은 권고 7 틀을 능동으로 · 확인이 필요한 항목 · 두 자료의 ○○이 다릅니다)', () => {
    // 권고 7 「대조한 ○개 항목에서 차이가 발견되지 않았습니다」의 틀을 지키고 피동만 고쳤다(검수 B3 선택지 가). 결정 대기.
    expect(COPY.ZERO_NOTE).toBe('대조한 {n}개 항목에서 차이를 찾지 못했습니다.');
    expect(COPY.SCOPE_NOTE.startsWith('대조하지 않은 항목: ')).toBe(true);
    expect(COPY.HEADING_CHECK).toBe('확인이 필요한 항목');
    expect(LABELS.REASON_TEXT.SAME_CONCEPT_VALUES_DIFFER).toBe('두 자료의 {field} 값이 다릅니다.');
  });

  it('문장 품질(검수 지적 15) — 피동·비유·내부 말·두 뜻 낱말을 고친 문장을 고정한다', () => {
    const R = LABELS.REASON_TEXT;
    expect(R.EMPTY_WITH_SUBMITTED_STATUS).toBe('처리 상태가 제출 이후 단계로 적혀 있는데 {field} 칸이 비어 있습니다.'); // ③
    expect(R.SUPERSEDES_CYCLE).toBe('{group}의 정정 대상이 서로를 가리킵니다.'); // ④ 비유 「돌고 있습니다」
    expect(R.OLDER_THAN_APPROVED_MAX_AGE).toBe('{field} 값과 대조 기준 시각의 간격이 정해 둔 기간보다 깁니다.'); // ⑤
    expect(LABELS.STATUS_LABEL.NOT_APPLICABLE).toBe('대조에서 뺌'); // ⑥ 내부 말 「해당 없음 기록」
    expect(LABELS.IGNORED_KIND_LABEL.unmapped).toBe('이 대조에서 쓰는 칸이 아닌 열'); // ⑥
    expect(COPY.UNUSED_COLUMNS).not.toMatch(/[—–]/); // ⑦ 줄표
    expect(COPY.REASON_FALLBACK).not.toMatch(/[—–]/); // ⑦
    // ⑨ 열 전체는 「열」, 한 칸은 「칸」.
    expect(R.COLUMN_NOT_PROVIDED).toBe('{group}에 {column} 열이 없습니다.');
    expect(R.KEY_COLUMN_NOT_PROVIDED).toBe('{group}에 {column} 열이 없어 다른 자료와 맞춰 보지 못했습니다.');
    expect(LABELS.FIELD_LABEL.source_as_of).toBe('자료 기준 시각'); // ⑩ 대조 기준 시각과 가른다
    expect(Object.values(LABELS.COMPARED_ITEM_LABEL).filter((s) => s.includes('짝'))).toEqual([]); // ⑪ 값은 셋이다
  });

  it('자료 묶음 이름은 넷 다 「자료」로 끝난다(문장 틀이 「자료에·자료를·자료가」로 조사를 고정해 둔다)', () => {
    expect(Object.keys(LABELS.FILE_GROUP_LABEL).sort()).toEqual([...FILE_GROUPS].sort());
    for (const v of Object.values(LABELS.FILE_GROUP_LABEL)) expect(v).toMatch(/자료$/);
  });

  it('제도 이름 표 = 사본의 SCHEMES', () => {
    expect(Object.keys(LABELS.SCHEME_LABEL).sort()).toEqual([...SCHEMES].sort());
  });

  it('칸 이름 표가 사본 COLUMN_SPECS 의 칸 이름 전부와 칸 꼬리(행·위치 기록·정정 대상·자료 종류)를 덮는다', () => {
    const names = new Set<string>(['row', 'evidence', 'supersedes', 'source_type']);
    for (const specs of Object.values(COLUMN_SPECS)) for (const s of specs) names.add(s.name);
    const missing = [...names].filter((n) => !(n in LABELS.FIELD_LABEL));
    expect(missing).toEqual([]);
  });
});

// ---- 라벨 전수: 사본 소스의 대문자 문자열 리터럴 ----

/** 화면에 나오지 않는 대문자 값과 그 이유. 사본을 다시 떠서 새 값이 생기면 이 목록이나 labels.ts 에 넣어야 시험이 푸르다. */
const NOT_SHOWN: Record<string, string> = {
  // 엔진 내부 상태·형식 값
  ACCEPTED: '자료 통과 상태 — 화면은 막힌 자료만 적는다',
  OK: '칸 상태 내부값',
  ABSENT: '칸 상태 내부값 — 사유는 COLUMN_NOT_PROVIDED 로 나온다',
  NFC: '글자 정규화 형식 이름',
  NFKC: '글자 정규화 형식 이름',
  TRUE: '엑셀 참·거짓 칸을 글자로 바꾼 값',
  FALSE: '엑셀 참·거짓 칸을 글자로 바꾼 값',
  UNSPECIFIED: '시트 선택 내부값 — 사유는 SHEET_NOT_SPECIFIED',
  NOT_FOUND: '시트 선택 내부값 — 사유는 SHEET_NOT_FOUND',
  SCHEMA: '규칙 번호 자리값 — 화면은 막힌 자료를 자료 통과 결과에서 읽는다',
  CUTOFF_NEEDS_ISO_WITH_OFFSET: '기준 시각 형식 오류 — 결과가 만들어지기 전에 던진다',
  // 실행 상태(run_state) — 화면은 run_state 가 아니라 항목 묶음으로 문장을 만든다
  RECEIVED: '실행 상태(접수 상태 값과 글자가 같다) — 화면에 쓰지 않는다',
  NORMALIZED: '실행 상태',
  CORE_COMPARED: '실행 상태',
  EVIDENCE_INCOMPLETE: '실행 상태',
  REVIEW_RECORDED: '실행 상태',
  CLOSED_NO_LEGAL_CONCLUSION: '실행 상태',
  // 자료 종류·종료일 기준·사건 상태 — 화면에 싣지 않는 칸 값
  APPROVED_RECORD: '자료 종류 값 — 화면은 날짜·시각 칸 값만 싣는다',
  SYSTEM_EXPORT: '자료 종류 값',
  DRAFT: '자료 종류 값',
  USER_NOTE: '자료 종류 값',
  UNDECLARED: '자료 종류·종료일 기준 값',
  LAST_DAY: '종료일 기준 값',
  DAY_AFTER_LAST_DAY: '종료일 기준 값',
  MIXED: '종료일 기준 내부값',
  ENDED: '사건 상태 내부값',
  EMPLOYED: '재직 상태 칸 값',
  HOLD: '사건 상태 내부값',
  STATUS_BLANK: '사건 상태 내부값 — 사유는 EMPTY 등으로 나온다',
  STATUS_COLUMN_MISSING: '사건 상태 내부값 — 사유는 COLUMN_NOT_PROVIDED',
  STATUS_CONFLICT: '사건 상태 내부값 — 사유는 SAME_CONCEPT_VALUES_DIFFER',
  AFTER_CUTOFF: '사건 상태 내부값',
  UNKNOWN: '칸 값을 해석하지 못했다는 내부값 — 사유는 SCHEME_VALUE_NOT_INTERPRETED 등',
  REPORTED_PAID: '정산 상태 칸 값',
  REPORTED_COMPLETE: '정산 상태 칸 값',
  PREPARED: '처리 상태 칸 값',
  SUBMITTED: '처리 상태 칸 값',
  PROCESSED: '처리 상태 칸 값',
  // R-009 날짜 계산 — 사장님 결정 B4 전에는 화면 문장을 만들지 않는다(조각 4). 결과에 나오면 일반 문장이 된다.
  OBSERVED_DATE_LATER_THAN_EARLIEST_CANDIDATE: 'B4 전 — 날짜 계산 문장은 조각 4',
  RECORDED_DATE_DIFFERS_FROM_DERIVED_CANDIDATE: 'B4 전 — 날짜 계산 문장은 조각 4',
  NO_SUBMISSION_OBSERVATION_AFTER_EARLIEST_CANDIDATE: 'B4 전 — 날짜 계산 문장은 조각 4',
  ANCHOR_DATE_NOT_AVAILABLE: 'B4 전 — 날짜 계산 세부(details)에만 나온다',
  RULE_ANCHOR_NOT_SUPPORTED: 'B4 전 — 평가하지 않은 날짜 규칙 목록(화면에 싣지 않는다)',
  RULE_FORMULA_NOT_SUPPORTED: 'B4 전 — 평가하지 않은 날짜 규칙 목록',
  RULE_NOT_VERIFIED_FORMULA_NULL: 'B4 전 — 평가하지 않은 날짜 규칙 목록',
  RULE_SCHEME_NOT_SUPPORTED: 'B4 전 — 평가하지 않은 날짜 규칙 목록',
};

function engineUppercaseLiterals(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const walk = (dir: string) => {
    for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (rel.endsWith('.ts')) {
        for (const m of read(rel).matchAll(/["']([A-Z][A-Z0-9_]*[A-Z0-9])["']/g)) found.set(m[1]!, [...(found.get(m[1]!) ?? []), rel]);
      }
    }
  };
  for (const d of ['rules', 'core', 'parse']) walk(`${ENGINE}/${d}`);
  return found;
}

describe('라벨 전수 — 사본 rules/·core/·parse/ 의 대문자 리터럴', () => {
  const labelled = new Set<string>([
    ...Object.keys(LABELS.STATUS_LABEL),
    ...Object.keys(LABELS.REASON_TEXT),
    ...Object.keys(LABELS.GATE_REASON_TEXT),
    ...Object.keys(LABELS.SCHEME_LABEL),
  ]);

  it('리터럴을 모은다(40개 넘게 — 0 이면 수집기가 고장)', () => {
    expect(engineUppercaseLiterals().size).toBeGreaterThan(40);
  });

  it('각 리터럴이 labels.ts 표에 있거나 「화면에 나오지 않음」 목록(이유 기재)에 있다', () => {
    const missing = [...engineUppercaseLiterals().entries()].filter(([k]) => !labelled.has(k) && !(k in NOT_SHOWN)).map(([k, files]) => `${k} (${[...new Set(files)].join(', ')})`);
    expect(missing).toEqual([]);
  });

  it('「화면에 나오지 않음」 목록에 사본에 없는 값이 남아 있지 않고, 라벨 표와 겹치지 않는다', () => {
    const lits = engineUppercaseLiterals();
    expect(Object.keys(NOT_SHOWN).filter((k) => !lits.has(k))).toEqual([]);
    expect(Object.keys(NOT_SHOWN).filter((k) => labelled.has(k))).toEqual([]);
  });

  it('대조 항목 이름(rules 의 compared.push) 전부에 화면 이름이 있다', () => {
    const names = new Set<string>();
    const suffixes = new Set<string>();
    for (const f of readdirSync(join(ROOT, ENGINE, 'rules'))) {
      for (const line of read(`${ENGINE}/rules/${f}`).split('\n')) {
        if (!line.includes('compared.push(item(')) continue;
        for (const m of line.matchAll(/["`]([a-z][a-z0-9_]*)(?::([a-z][a-z0-9_]*))?/g)) {
          names.add(m[1]!);
          if (m[1] === 'deadline_candidates_not_computed' && m[2]) suffixes.add(m[2]);
        }
      }
    }
    expect(names.size).toBeGreaterThan(10);
    names.delete('deadline_candidates_not_computed');
    expect([...names].filter((n) => !(n in LABELS.COMPARED_ITEM_LABEL))).toEqual([]);
    expect(suffixes.size).toBeGreaterThan(0);
    expect([...suffixes].filter((s) => !(s in LABELS.NOT_COMPUTED_TEXT))).toEqual([]);
  });
});

// ---- 화면 모델 글자: 17개 fixture + 모르는 값 ----

describe('화면 모델 글자 — 17개 fixture 전부', () => {
  const reports = new Map<string, CoreReport>();
  beforeAll(async () => {
    for (const sc of EXIT_CHECK_SCENARIOS) reports.set(sc.id, await runFixture(sc));
  }, 120_000);

  it('17개를 다 돌렸다', () => {
    expect(reports.size).toBe(17);
  });

  it('모든 글자에 금지 목록·자리표시자 잔재가 없다', () => {
    const bad: string[] = [];
    for (const [id, r] of reports) {
      for (const s of viewStrings(toExitCheckView(r))) {
        for (const h of wordingHits(s)) bad.push(`${id}: ${h} — ${s}`);
        if (/[{}]/.test(s)) bad.push(`${id}: 자리표시자 — ${s}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('키 원문(사업장·근로자 구분값)·파일 이름·시트 이름이 없다', () => {
    const bad: string[] = [];
    for (const sc of EXIT_CHECK_SCENARIOS) {
      const r = reports.get(sc.id)!;
      const all = viewStrings(toExitCheckView(r)).join('\n');
      const keys = new Set<string>();
      for (const f of r.findings) for (const k of [f.company_key, f.worker_token, f.key]) if (k) keys.add(k);
      const inputs = (sc.manifest as { inputs?: Array<{ path?: string }> }).inputs ?? [];
      const sheets = r.file_gate_results.map((g) => g.sheet).filter((x): x is string => !!x);
      for (const w of [...keys, ...inputs.map((i) => i.path).filter((p): p is string => !!p), ...sheets]) if (all.includes(w)) bad.push(`${sc.id}: ${w}`);
    }
    expect(bad).toEqual([]);
  });

  it('0건 문장은 범위 한정 문장과 함께만 나오고, 확인이 필요한 항목·대조하지 못한 항목·대조에 쓰지 못한 자료가 모두 0일 때뿐이다', () => {
    let seen = 0;
    for (const [id, r] of reports) {
      const v = toExitCheckView(r);
      if (v.zeroNote === null) continue;
      seen += 1;
      expect(v.zeroNote, id).toContain(COPY.SCOPE_NOTE);
      expect(v.counts.checkItems, id).toBe(0);
      expect(v.counts.notCompared, id).toBe(0);
      expect(v.counts.unusableFiles, id).toBe(0);
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('머리글 원문(우리 낱말에 없는 머리글 칸)이 화면 글자에 없다', () => {
    const bad: string[] = [];
    for (const sc of EXIT_CHECK_SCENARIOS) {
      const headers = Object.values(sc.files).flatMap((lines) => (lines[0] ?? '').split(','));
      for (const h of headerLeaks(headers, viewStrings(toExitCheckView(reports.get(sc.id)!)))) bad.push(`${sc.id}: ${h}`);
    }
    expect(bad).toEqual([]);
    // 한글 머리글 fixture 가 있어야 이 시험이 무언가를 본다.
    expect(EXIT_CHECK_SCENARIOS.some((sc) => Object.values(sc.files).some((l) => /[가-힣]/.test(l[0] ?? '')))).toBe(true);
  });

  it('대조한 항목 개수 = 목록 줄 수(근로자 한 명). 여러 근로자 fixture 는 같은 이름을 합쳐 줄 수가 적다 — 여러 근로자 표시는 계획 범위 밖', () => {
    const multi: string[] = [];
    for (const [id, r] of reports) {
      const v = toExitCheckView(r);
      const workers = new Set(r.compared_items.map((c) => c.key));
      if (workers.size > 1) {
        multi.push(id);
        continue;
      }
      expect(v.comparedItems.length, id).toBe(v.counts.compared);
    }
    expect(multi.sort()).toEqual(MULTI_WORKER);
  });
});

/** 근로자가 둘 이상인 fixture(대조한 항목 개수와 목록 줄 수가 다를 수 있다). 여러 근로자 표시를 정하는 조각에서 이 목록을 없앤다. */
const MULTI_WORKER = ['S07'];

describe('view.ts — 한국어 글자를 품지 않는다(문안은 labels.ts·copy.ts 두 파일에만)', () => {
  it('주석을 지운 view.ts 에 한글이 없다', () => {
    const src = blankComments(read('src/lib/exit-check-view/view.ts'));
    expect(src.match(/[가-힣ㄱ-ㆎ]+/g) ?? []).toEqual([]);
  });

  it('검사기 자기시험: 문자열 안 한글은 잡고 주석 안 한글은 지나간다', () => {
    expect(blankComments(`const a = '자료'; // 주석`).match(/[가-힣]+/g)).toEqual(['자료']);
  });
});
