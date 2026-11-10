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

/** 문자열 하나의 위반 목록. 라틴 글자는 셀 열 표기(「H열」「AB열」)만 허용한다 — 코드·식별자·파일 이름·시트 이름·키가 다 여기서 걸린다. */
function wordingHits(s: string): string[] {
  const hits: string[] = BANNED.filter((w) => s.includes(w)).map((w) => `금지어 ${w}`);
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

/** 금액: 금액을 적는 문장은 「입력값 기준」을 함께 적는다(법률검증 2차). 지금 화면 모델에는 금액이 없다. */
function amountHits(s: string): string[] {
  const m = s.match(/\d[\d,]*\s*(원|만원|억원)/g) ?? [];
  return m.length > 0 && !s.includes('입력값 기준') ? m : [];
}

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

  it('금액: 「입력값 기준」 없이 금액을 적으면 잡는다', () => {
    expect(amountHits('퇴직금 1,234,000원')).toEqual(['1,234,000원']);
    expect(amountHits('입력값 기준 퇴직금 1,234,000원')).toEqual([]);
    expect(amountHits('2026.10.8.')).toEqual([]);
  });
});

describe('문안 두 파일(labels.ts·copy.ts)', () => {
  const all = [...exportedStrings(LABELS as Record<string, unknown>).map((x) => ({ ...x, where: `labels ${x.where}` })), ...exportedStrings(COPY as Record<string, unknown>).map((x) => ({ ...x, where: `copy ${x.where}` }))];

  it('내보내는 문자열이 있다(빈 모듈이면 이 묶음은 아무것도 증명하지 않는다)', () => {
    expect(all.length).toBeGreaterThan(80);
  });

  it('모든 문자열에 금지어·결론형·기한·자격·개선·라틴 글자·밑줄·세로줄·해시·쿼리 링크·기준 없는 금액이 없다', () => {
    const bad = all.flatMap(({ where, text }) => wordingHits(stripPlaceholders(text)).map((h) => `${where}: ${h} — ${text}`));
    expect(bad).toEqual([]);
  });

  it('법률검증 2차 C-운영자표시 문장 꼴을 그대로 쓴다(0건 문장 · 확인이 필요한 항목 · 두 자료의 ○○이 다릅니다)', () => {
    expect(COPY.ZERO_NOTE).toBe('대조한 {n}개 항목에서 차이가 발견되지 않았습니다.');
    expect(COPY.SCOPE_NOTE.startsWith('대조하지 않은 항목: ')).toBe(true);
    expect(COPY.HEADING_CHECK).toBe('확인이 필요한 항목');
    expect(LABELS.REASON_TEXT.SAME_CONCEPT_VALUES_DIFFER).toBe('두 자료의 {field} 값이 다릅니다.');
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

  it('0건 문장은 범위 한정 문장과 함께만 나온다', () => {
    for (const [id, r] of reports) {
      const v = toExitCheckView(r);
      if (v.zeroNote === null) continue;
      expect(v.zeroNote, id).toContain(COPY.SCOPE_NOTE);
      expect(v.counts.confirm, id).toBe(0);
      expect(v.counts.unusableFiles, id).toBe(0);
    }
  });
});

describe('view.ts — 한국어 글자를 품지 않는다(문안은 labels.ts·copy.ts 두 파일에만)', () => {
  it('주석을 지운 view.ts 에 한글이 없다', () => {
    const src = blankComments(read('src/lib/exit-check-view/view.ts'));
    expect(src.match(/[가-힣ㄱ-ㆎ]+/g) ?? []).toEqual([]);
  });

  it('검사기 자기시험: 문자열 안 한글은 잡고 주석 안 한글은 지나간다', () => {
    expect(blankComments(`const a = '자료'; // 주석`).match(/[가-힣]+/g)).toEqual(['자료']);
  });
});
