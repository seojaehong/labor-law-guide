import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bannedHits } from '@/lib/tool-kit/banned';
import { ACQ_CODES, allCopy, CODE_PICK, FIELD, LEAD, LOSS_CODES, LOSS_DAY_NOTE, PRIVACY } from '@/app/tools/nhis-report-form/copy';
import { ACQ_CODES_FORM6, LOSS_CODES_SUPPORTED } from '@/lib/nhis-forms/dates';
import { TOOLS } from '@/content/tools-registry';

describe('신고서 작성 화면 문장', () => {
  const t = allCopy().join(' ');
  it('직무 표방·단정 금지어가 없다', () => {
    expect(bannedHits(t)).toEqual([]);
  });
  // NOW.md — 사이트에 「대신·대행·대리」 금지(작성 도구이지 위임 제출이 아니다, 261102 결정)
  it('위임·제출 대행을 뜻하는 말이 없다', () => {
    expect(bannedHits(t, ['대신', '대행', '대리', '지도'])).toEqual([]);
  });
  it('주민등록번호는 서버로 보내지 않는다고 적는다', () => {
    expect(PRIVACY).toContain('서버로 보내지 않습니다');
  });
  // 별지 제6호서식 작성방법의 건강보험 자격취득부호 전부(261125 — 00·13 둘뿐이라 피부양자·지역가입자도 00 으로 찍혔다)
  it('건강보험 취득부호는 서식의 10종이고 미리 고르지 않는다', () => {
    expect(ACQ_CODES.map(c => c.v)).toEqual(['00', '04', '05', '06', '07', '10', '13', '14', '29', '30']);
    expect(ACQ_CODES.find(c => c.v === '06')?.label).toBe('06 직장피부양자 상실');
    expect(ACQ_CODES.find(c => c.v === '07')?.label).toBe('07 지역가입자에서 변경');
    expect(CODE_PICK).toBe('골라 주세요');
  });
  // 칸 이름이 「마지막 출근일」로 읽히지 않게 — 근로관계가 이어진 마지막 날, 사망이면 사망일(건보법 §9①3·§10①1)
  it('상실 날짜 칸은 사망일까지 밝히고 근로관계 기준을 안내한다', () => {
    expect(FIELD.lastWorkDay).toBe('마지막 근무일(사망이면 사망일)');
    expect(LOSS_DAY_NOTE).toContain('근로관계가 이어진 마지막 날');
  });
  // G4 261126 I25 — 화면 선택 목록과 엔진 검사(validate, MCP 공통)가 같은 부호 목록을 쓴다
  it('화면 부호 목록 = 엔진이 받는 부호 목록', () => {
    expect(LOSS_CODES.map(c => c.v)).toEqual([...LOSS_CODES_SUPPORTED]);
    expect(ACQ_CODES.map(c => c.v)).toEqual([...ACQ_CODES_FORM6]);
  });
  // G4 261126 I28 — 퇴직 상실일 근거는 건보법 제9조제1항제3호(사용관계가 끝난 날의 다음 날), 사망은 제10조제1항제1호
  it('상실일 근거 줄 — 퇴직 §9①3, 사망 §10①1', () => {
    const page = readFileSync(path.join(process.cwd(), 'src/app/tools/nhis-report-form/page.tsx'), 'utf8');
    expect(page).toMatch(/국민건강보험법 제9조제1항제3호[^']*사용관계가 끝난 날의 다음 날/);
    expect(page).toMatch(/국민건강보험법 제10조제1항제1호[^']*사망한 날의 다음 날/);
  });
  it('늦은 신고용이고 건강보험 칸만 채운다고 첫 문단에 적는다', () => {
    expect(LEAD).toContain('기한을 넘긴');
    expect(LEAD).toContain('건강보험 칸만');
  });
  it('도구 목록에 있다', () => {
    expect(TOOLS.some(x => x.href === '/tools/nhis-report-form')).toBe(true);
  });
  // 화면 문장은 copy.ts 밖(페이지 메타·근거 줄, 도구 목록 소개)에도 있다
  it('페이지·도구 목록 문장에도 금지어가 없다', () => {
    const page = readFileSync(path.join(process.cwd(), 'src/app/tools/nhis-report-form/page.tsx'), 'utf8');
    const literals = [...page.matchAll(/'([^'\n]*[가-힣][^'\n]*)'/g)].map(m => m[1]);
    expect(literals.length).toBeGreaterThan(5);
    const entry = TOOLS.find(x => x.href === '/tools/nhis-report-form')!;
    const all = [...literals, entry.title, entry.desc, entry.badge ?? ''].join(' ');
    expect(bannedHits(all)).toEqual([]);
    expect(bannedHits(all, ['대신', '대행', '대리', '지도'])).toEqual([]);
  });
});
