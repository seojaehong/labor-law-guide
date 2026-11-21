// 모성보호 서식 엔진 — 칸 검사·조문 안내(경계 양쪽)·한글 파일. 값은 모두 합성.
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildForm, catalog, findForm, FormError, HR_FORMS, review } from '@/lib/hr-forms';
import { addMonths, parseYmd, toYmd } from '@/lib/hr-forms/dates';

const P = { name: '김가나', birth: '1990-03-04', dept: '총무팀', position: '주임', company: '가나다상사' };
const leave = (o: Record<string, string> = {}) => ({ ...P, reason: 'child', childName: '김다라', childBirth: '2022-05-01', start: '2027-01-04', end: '2027-07-03', appliedOn: '2026-12-01', ...o });
const notes = (id: string, v: Record<string, string>) => review(findForm(id)!, v);

describe('날짜 도우미', () => {
  it('없는 날짜는 거른다', () => {
    expect(parseYmd('2026-02-30')).toBeNull();
    expect(parseYmd('2026-2-3')).toBeNull();
    expect(parseYmd('2028-02-29')).not.toBeNull();
  });
  it('n개월 뒤 — 말일 보정', () => {
    expect(toYmd(addMonths(parseYmd('2027-01-31')!, 1))).toBe('2027-02-28');
    expect(toYmd(addMonths(parseYmd('2026-12-15')!, 18))).toBe('2028-06-15');
  });
});

describe('서식 목록', () => {
  it('6종, id 가 겹치지 않는다', () => {
    const ids = catalog().map((f) => f.id);
    expect(ids).toEqual(['childcare-leave', 'short-childcare-leave', 'spouse-maternity-leave', 'infertility-leave', 'childcare-leave-approval', 'short-leave-reschedule']);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('주민등록번호 칸이 없다', () => {
    for (const f of HR_FORMS) for (const x of f.fields) expect(`${x.key}${x.label}`).not.toMatch(/주민|rrn/i);
  });
});

describe('칸 검사', () => {
  it('필수 칸이 비면 막는다 — 자녀 성명은 자녀 양육 사유일 때만', () => {
    expect(notes('childcare-leave', leave({ childName: '' })).problems).toContain('「대상 자녀 성명」을(를) 적어 주세요.');
    expect(notes('childcare-leave', leave({ childName: '', reason: 'spouse' })).problems).toEqual([]);
  });
  it('주민등록번호 모양은 막는다', () => {
    const r = notes('childcare-leave', leave({ dept: '900304-1234567' }));
    expect(r.problems.join()).toMatch(/주민등록번호/);
  });
  it('날짜 형식·선택지·글자 수', () => {
    const r = notes('childcare-leave', leave({ start: '2027/01/04', reason: 'x', name: '가'.repeat(41) }));
    expect(r.problems).toHaveLength(3);
  });
  it('끝나는 날이 앞서면 막는다', () => {
    expect(notes('childcare-leave', leave({ end: '2027-01-03' })).problems.join()).toMatch(/앞섭니다/);
  });
  it('모르는 칸은 알려 준다', () => {
    expect(notes('childcare-leave', { ...leave(), foo: '1' }).unknown).toEqual(['foo']);
  });
});

describe('조문 안내 — 경계 양쪽', () => {
  const has = (r: { notes: string[] }, re: RegExp) => r.notes.some((n) => re.test(n));
  it('육아휴직 신청 30일 전', () => {
    expect(has(notes('childcare-leave', leave({ appliedOn: '2026-12-05' })), /휴직 시작 \d+일 전/)).toBe(false); // 딱 30일 전
    expect(has(notes('childcare-leave', leave({ appliedOn: '2026-12-06' })), /휴직 시작 29일 전/)).toBe(true);
  });
  it('위험 임신 배우자 돌봄은 7일 전', () => {
    const v = leave({ reason: 'spouse', childName: '', childBirth: '2027-03-01' });
    expect(has(notes('childcare-leave', { ...v, appliedOn: '2026-12-28' }), /휴직 시작 7일 전/)).toBe(false);
    expect(has(notes('childcare-leave', { ...v, appliedOn: '2026-12-29' }), /휴직 시작 6일 전.*7일 전까지/)).toBe(true);
  });
  it('기간 1년 — 추가 사유가 있으면 1년 6개월', () => {
    expect(has(notes('childcare-leave', leave({ end: '2028-01-03' })), /1년 이내/)).toBe(false);
    expect(has(notes('childcare-leave', leave({ end: '2028-01-04' })), /1년 이내/)).toBe(true);
    expect(has(notes('childcare-leave', leave({ end: '2028-07-03', extra: 'single' })), /1년 이내/)).toBe(false);
    expect(has(notes('childcare-leave', leave({ end: '2028-07-04', extra: 'single' })), /1년 이내/)).toBe(true);
  });
  const spouse = (o: Record<string, string> = {}) => ({ ...P, birthState: 'due', birthDate: '2027-03-01', p1Start: '2027-01-10', p1End: '2027-01-19', appliedOn: '2026-12-20', ...o });
  it('배우자 출산전후휴가 — 출산예정일 50일 전', () => {
    expect(has(notes('spouse-maternity-leave', spouse({ p1Start: '2027-01-10' })), /50일 전보다/)).toBe(false); // 50일 전
    expect(has(notes('spouse-maternity-leave', spouse({ p1Start: '2027-01-09' })), /50일 전보다/)).toBe(true);
  });
  it('배우자 출산전후휴가 — 출산일부터 120일, 3회차까지', () => {
    const born = spouse({ birthState: 'born', p1Start: '2027-03-01', p1End: '2027-03-10', p2Start: '2027-06-20', p2End: '2027-06-29' });
    expect(has(notes('spouse-maternity-leave', born), /120일/)).toBe(false);
    expect(has(notes('spouse-maternity-leave', { ...born, p2End: '2027-06-30' }), /2회차 종료일이 출산일부터 120일/)).toBe(true);
    expect(notes('spouse-maternity-leave', { ...born, p3Start: '2027-05-01' }).problems.join()).toMatch(/3회차 종료일/);
  });
  it('난임치료휴가 — 6일 넘으면 안내, 날짜 아닌 값은 막는다', () => {
    const d6 = '2027-01-04, 2027-01-05\n2027-01-06 2027-01-07,2027-01-08,2027-01-09';
    const base = { ...P, appliedOn: '2026-12-20' };
    expect(has(notes('infertility-leave', { ...base, days: d6 }), /연간 6일/)).toBe(false);
    expect(has(notes('infertility-leave', { ...base, days: `${d6},2027-01-10` }), /연간 6일/)).toBe(true);
    expect(notes('infertility-leave', { ...base, days: '1월 4일' }).problems.join()).toMatch(/읽지 못한/);
  });
  it('허용 통지 — 신청일부터 14일', () => {
    const a = { company: '가나다상사', ceo: '박대표', employee: '김가나', appliedOn: '2026-12-01', kind: 'asis', start: '2027-01-04', end: '2027-07-03' };
    expect(has(notes('childcare-leave-approval', { ...a, notifiedOn: '2026-12-15' }), /14일 이내/)).toBe(false);
    expect(has(notes('childcare-leave-approval', { ...a, notifiedOn: '2026-12-16' }), /15일 뒤.*14일 이내/)).toBe(true);
    expect(notes('childcare-leave-approval', { ...a, notifiedOn: '2026-11-30' }).problems.join()).toMatch(/앞섭니다/);
  });
});

describe('공개 문구 금지어', () => {
  it('화면 문장·서식 목록·안내·원고에 금지어가 없다(대신·대행·대리 포함)', async () => {
    const { allCopy } = await import('@/app/tools/hr-forms/copy');
    const { bannedHits, SERVICE_BANNED, RESULT_BANNED } = await import('@/lib/tool-kit/banned');
    const words = [...SERVICE_BANNED, ...RESULT_BANNED, '대신', '대행', '대리'];
    const texts = [...allCopy(), JSON.stringify(catalog()), ...['childcare-leave', 'spouse-maternity-leave', 'childcare-leave-approval'].flatMap((id) => {
      const r = notes(id, id === 'spouse-maternity-leave' ? { ...P, birthState: 'born', birthDate: '2027-03-01', p1Start: '2026-12-01', p1End: '2027-08-01', appliedOn: '2026-11-01' } : id === 'childcare-leave' ? leave({ appliedOn: '2026-12-30', end: '2028-12-31', extra: 'both' }) : { company: '가', ceo: '나', employee: '다', appliedOn: '2026-12-01', kind: 'asis', start: '2027-01-04', end: '2027-07-03', notifiedOn: '2027-01-01' });
      return [...r.notes, r.md];
    })];
    expect(bannedHits(texts.join(' '), words)).toEqual([]);
  });
});

describe('한글(hwpx) 만들기', () => {
  it('여섯 서식이 모두 파일이 되고 값이 본문에 들어간다', async () => {
    const vals: Record<string, Record<string, string>> = {
      'childcare-leave': leave(),
      'short-childcare-leave': { ...P, childName: '김다라', childBirth: '2020-05-01', reason: 'vacation', reasonDetail: '겨울방학', start: '2027-01-04', weeks: '2', appliedOn: '2026-12-01' },
      'spouse-maternity-leave': { ...P, birthState: 'due', birthDate: '2027-03-01', p1Start: '2027-02-20', p1End: '2027-03-01', appliedOn: '2027-01-20' },
      'infertility-leave': { ...P, days: '2027-01-04,2027-01-05', appliedOn: '2026-12-20' },
      'childcare-leave-approval': { company: '가나다상사', ceo: '박대표', employee: '김가나', appliedOn: '2026-12-01', kind: 'asis', start: '2027-01-04', end: '2027-07-03', notifiedOn: '2026-12-10' },
      'short-leave-reschedule': { company: '가나다상사', ceo: '박대표', employee: '김가나', fromStart: '2027-01-04', fromEnd: '2027-01-17', toStart: '2027-02-01', toEnd: '2027-02-14', reason: '방학 중 신청 집중', notifiedOn: '2026-12-10' },
    };
    for (const f of HR_FORMS) {
      const b = await buildForm(f.id, vals[f.id]);
      const z = await JSZip.loadAsync(b.hwpx);
      expect(Object.keys(z.files)[0]).toBe('mimetype');
      const sec = await z.file('Contents/section0.xml')!.async('string');
      expect(sec).toContain(f.title.split('').join('')); // 제목
      expect(sec).toMatch(/김가나/);
      expect(sec).not.toMatch(/undefined|NaN/);
    }
  });
  it('단기 육아휴직 2주 = 14일로 끝나는 날을 계산한다', async () => {
    const b = await buildForm('short-childcare-leave', { ...P, childName: '김다라', childBirth: '2020-05-01', reason: 'vacation', start: '2027-01-04', weeks: '2', appliedOn: '2026-12-01' });
    expect(b.md).toContain('2027. 1. 4. ~ 2027. 1. 17. (2주)');
  });
  it('검사에 걸리면 FormError, 없는 서식도 FormError', async () => {
    await expect(buildForm('childcare-leave', leave({ name: '' }))).rejects.toBeInstanceOf(FormError);
    await expect(buildForm('nope', {})).rejects.toBeInstanceOf(FormError);
  });
});
