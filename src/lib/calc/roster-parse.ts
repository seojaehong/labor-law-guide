// 명단 붙여넣기 파서 — 엑셀에서 복사한 표를 Employee[] 로 바꾼다.
// 🔴 클라이언트 컴포넌트에 묻지 않고 여기 둔다. 화면을 띄우지 않고 시험할 수 있어야 한다.
// 🔴 받는 칸은 네 개(+직군)뿐이다 — 사번·출생연월·입사일·연봉. **이름도 주민등록번호도 칸이 없다**(#311 §3).
//    틀린 줄은 조용히 버리지 않고 줄 번호와 사유를 돌려준다. 조용한 누락이 제일 나쁘다.
import type { Employee } from './retirement-plan';

export interface RosterError {
  line: number;
  raw: string;
  reason: string;
}

export interface RosterParse {
  rows: Employee[];
  errors: RosterError[];
}

const HEADER_WORDS = ['사번', '출생', '생년', '입사', '연봉', '임금', '직군', '부서'];

/** 1969-06 · 1969.6 · 1969/06 · 196906 → 1969-06 */
export function normBirthYM(s: string): string | null {
  const t = s.trim();
  let m = /^(\d{4})[-./\s]?(\d{1,2})$/.exec(t);
  if (!m) m = /^(\d{4})(\d{2})$/.exec(t);
  if (!m) return null;
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return `${m[1]}-${String(mo).padStart(2, '0')}`;
}

/** 2005-03-01 · 2005.3.1 · 20050301 → 2005-03-01. 달력에 없는 날은 거부한다 */
export function normDate(s: string): string | null {
  const t = s.trim();
  let m = /^(\d{4})[-./\s](\d{1,2})[-./\s](\d{1,2})$/.exec(t);
  if (!m) m = /^(\d{4})(\d{2})(\d{2})$/.exec(t);
  if (!m) return null;
  const out = `${m[1]}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[3])).padStart(2, '0')}`;
  const d = new Date(`${out}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== out) return null;
  return out;
}

/** 60,000,000 · 60000000원 · 6,000만 → 원. 「만」이 붙으면 만 원 단위로 읽는다 */
export function normWon(s: string): number | null {
  const t = s.trim().replace(/[,\s]/g, '').replace(/원$/, '');
  const man = /만$/.test(t);
  const body = man ? t.slice(0, -1) : t;
  if (!/^\d+(\.\d+)?$/.test(body)) return null;
  const n = Number(body) * (man ? 10_000 : 1);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/**
 * 한 줄 = 한 사람. 탭·쉼표·세미콜론으로 나눈다.
 * 칸 순서 = 사번 · 출생연월 · 입사일 · 연봉 · 직군(선택).
 * 머리글 줄과 빈 줄은 건너뛰고, 그 밖에 모자란 줄은 오류로 돌려준다.
 */
export function parseRoster(text: string): RosterParse {
  const rows: Employee[] = [];
  const errors: RosterError[] = [];
  const seen = new Set<string>();
  const lines = (text || '').split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = i + 1;
    if (!raw.trim()) continue;
    const cells = raw.split(/\t|,|;/).map((c) => c.trim());
    // 머리글 — 두 칸 이상이 머리글 낱말이면 건너뛴다
    if (cells.filter((c) => HEADER_WORDS.some((w) => c.includes(w))).length >= 2) continue;
    if (cells.length < 4) {
      errors.push({ line, raw, reason: '칸이 모자랍니다 — 사번·출생연월·입사일·연봉 네 칸이 필요합니다' });
      continue;
    }
    const [id, b, h, p, group] = cells;
    if (!id) {
      errors.push({ line, raw, reason: '사번이 비었습니다' });
      continue;
    }
    if (/\d{6}[-\s]?\d{7}/.test(raw)) {
      errors.push({ line, raw, reason: '주민등록번호처럼 보이는 값이 있습니다 — 이 도구는 주민등록번호를 받지 않습니다. 사번과 출생연월만 넣으세요' });
      continue;
    }
    const birthYM = normBirthYM(b);
    if (!birthYM) {
      errors.push({ line, raw, reason: `출생연월을 읽을 수 없습니다(예: 1969-06): ${b}` });
      continue;
    }
    const hireDate = normDate(h);
    if (!hireDate) {
      errors.push({ line, raw, reason: `입사일을 읽을 수 없습니다(예: 2005-03-01): ${h}` });
      continue;
    }
    const annualPay = normWon(p);
    if (annualPay === null) {
      errors.push({ line, raw, reason: `연봉을 읽을 수 없습니다(예: 60,000,000 또는 6,000만): ${p}` });
      continue;
    }
    if (seen.has(id)) {
      errors.push({ line, raw, reason: `사번이 겹칩니다: ${id}` });
      continue;
    }
    seen.add(id);
    rows.push({ id, birthYM, hireDate, annualPay, ...(group ? { group } : {}) });
  }
  return { rows, errors };
}

/** 예시 10명 — 바로 눌러 보라고 둔다. 실제 사람이 아니다 */
export const EXAMPLE_ROSTER = `사번,출생연월,입사일,연봉,직군
A-001,1967-03,1996-03-01,78000000,관리
A-002,1967-11,2001-07-01,72000000,관리
A-003,1969-06,2005-03-01,64000000,생산
A-004,1970-02,2008-09-16,61000000,생산
A-005,1971-08,2010-01-04,58000000,생산
A-006,1972-03,2012-05-02,56000000,사무
A-007,1973-12,2014-11-17,54000000,사무
A-008,1975-05,2016-03-01,51000000,생산
A-009,1977-09,2019-08-19,47000000,사무
A-010,1979-01,2021-02-15,44000000,생산`;
