// 모성보호 서식 엔진 — 칸 검사·조문 안내(경계 양쪽)·한글 파일. 값은 모두 합성.
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildForm, catalog, findForm, FormError, HR_FORMS, review } from '@/lib/hr-forms';
import { addMonths, parseYmd, toYmd } from '@/lib/hr-forms/dates';
import { hasRrnValue as formsRrn } from '@/lib/hr-forms/rrn';
import { hasRrnValue as sharedRrn } from '@/lib/exit-check/core/rrn';

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
  it('7종, id 가 겹치지 않는다', () => {
    const ids = catalog().map((f) => f.id);
    expect(ids).toEqual(['childcare-leave', 'short-childcare-leave', 'spouse-maternity-leave', 'infertility-leave', 'childcare-leave-approval', 'short-leave-reschedule', 'integrated-leave-application']);
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
    // 이미 출산했으면 예정일이 없으므로 출산일과 견주지 않는다
    expect(has(notes('spouse-maternity-leave', spouse({ birthState: 'born', p1Start: '2027-01-09' })), /50일 전보다/)).toBe(false);
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
  it('난임치료휴가 안내에 11월 27일 유급 확대와 시행 전 사용일을 표시한다', () => {
    const summary = findForm('infertility-leave')!.summary;
    expect(summary).toContain('11월 27일부터 최초 4일 유급');
    expect(summary).toContain('시행 전 사용일도 최초 4일에 포함');
    const r = notes('infertility-leave', { ...P, appliedOn: '2026-11-24', days: '2026-11-26, 2026-11-27' });
    expect(r.problems).toEqual([]);
    const guidance = r.notes.find((n) => n.includes('법률 제21700호'));
    expect(guidance).toContain('11월 26일까지는 최초 2일');
    expect(guidance).toContain('11월 27일부터 사용한 난임치료휴가는 최초 4일이 유급');
    expect(guidance).toContain('시행 전 이미 사용한 난임치료휴가도 최초 4일에 포함');
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
  it('일곱 서식이 모두 파일이 되고 값이 본문에 들어간다', async () => {
    const vals: Record<string, Record<string, string>> = {
      'childcare-leave': leave(),
      'short-childcare-leave': { ...P, childName: '김다라', childBirth: '2020-05-01', reason: 'vacation', reasonDetail: '겨울방학', start: '2027-01-04', weeks: '2', appliedOn: '2026-12-01' },
      'spouse-maternity-leave': { ...P, birthState: 'due', birthDate: '2027-03-01', p1Start: '2027-02-20', p1End: '2027-03-01', appliedOn: '2027-01-20' },
      'infertility-leave': { ...P, days: '2027-01-04,2027-01-05', appliedOn: '2026-12-20' },
      'childcare-leave-approval': { company: '가나다상사', ceo: '박대표', employee: '김가나', appliedOn: '2026-12-01', kind: 'asis', start: '2027-01-04', end: '2027-07-03', notifiedOn: '2026-12-10' },
      'short-leave-reschedule': { company: '가나다상사', ceo: '박대표', employee: '김가나', fromStart: '2027-01-04', fromEnd: '2027-01-17', toStart: '2027-02-01', toEnd: '2027-02-14', reason: '방학 중 신청 집중', notifiedOn: '2026-12-10' },
      'integrated-leave-application': { name: '김가나', birth: '1990-03-04', childBirth: '2027-03-01', kind: 'maternity', leaveStart: '2027-01-20', leaveEnd: '2027-04-19', ccStart: '2027-04-20', ccEnd: '2028-04-19', appliedOn: '2026-12-10' },
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

describe('법정 서식 — 별지 제7호의2 통합 신청서(원본 칸에 채움)', () => {
  const IV = { name: '김가나', birth: '1990-03-04', phone: '010-0000-0000', dept: '총무팀', position: '주임', childBirth: '2027-03-01', kind: 'maternity', leaveStart: '2027-01-20', leaveEnd: '2027-04-19', ccStart: '2027-04-20', ccEnd: '2028-04-19', appliedOn: '2026-12-10' };
  const sec = async (v: Record<string, string>) => {
    const b = await buildForm('integrated-leave-application', v);
    return (await JSZip.loadAsync(b.hwpx)).file('Contents/section0.xml')!.async('string');
  };
  it('원본 서식 글자(머리·제목·작성방법·사업주 확인란)가 그대로 남고 칸이 채워진다', async () => {
    const x = await sec(IV);
    for (const s of ['[별지 제7호의2서식]', '출산전후휴가(배우자 출산전후휴가)ㆍ육아휴직 통합 신청서', '작성방법', '사업주 확인', '사업장명'])
      expect(x).toContain(s);
    for (const s of ['김가나', '1990. 3. 4.', '(연락처: 010-0000-0000)', '출산전후휴가 청구 기간 ( 90일)', '육아휴직 기간 ( 366일)', '2027년 1월 20일', '2028년 4월 19일', '2026년 12월 10일', '신청인        김가나        (인)'])
      expect(x).toContain(s);
  });
  it('배우자 출산전후휴가면 그 줄에 적고 출산전후휴가 줄은 비운다 — 일수는 적은 값만', async () => {
    const x = await sec({ ...IV, kind: 'spouse', leaveStart: '2027-02-20', leaveEnd: '2027-03-11', leaveDays: '20' });
    expect(x).toContain('배우자 출산전후휴가 고지 기간 ( 20일)');
    expect(x).toContain('출산전후휴가 청구 기간 (     일)');
    const y = await sec({ ...IV, kind: 'spouse', leaveStart: '2027-02-20', leaveEnd: '2027-03-11' });
    expect(y).toContain('배우자 출산전후휴가 고지 기간 (     일)');
  });
  it('조문 대조 — 육아휴직 30일 전 신청(시행령 제11조제2항)', () => {
    expect(notes('integrated-leave-application', { ...IV, appliedOn: '2027-04-01' }).notes.some((n) => /30일 전까지/.test(n))).toBe(true);
    expect(notes('integrated-leave-application', IV).notes.some((n) => /30일 전까지/.test(n))).toBe(false);
  });
  it('휴가 일수는 숫자만', () => {
    expect(notes('integrated-leave-application', { ...IV, kind: 'spouse', leaveDays: '이십' }).problems).toContain('「휴가 일수」는 숫자로만 적어 주세요.');
  });
});

// ── interrogate(261122) 반영 — 조용히 틀리거나 빠지는 값 ──────────────────────
const APPROVAL = { company: '가나다상사', ceo: '박마바', employee: '김가나', appliedOn: '2026-12-01', kind: 'asis', start: '2027-01-04', end: '2027-07-03', notifiedOn: '2026-12-05' };
const IV2 = { name: '김가나', birth: '1990-03-04', phone: '010-0000-0000', dept: '총무팀', position: '주임', childBirth: '2027-03-01', kind: 'maternity', leaveStart: '2027-01-20', leaveEnd: '2027-04-19', ccStart: '2027-04-20', ccEnd: '2028-04-19', appliedOn: '2026-12-10' };

describe('주민등록번호 — 공용 판정·서식에 없는 칸·날짜 여러 개', () => {
  it('구분자를 바꾼 주민번호 모양도 막는다', () => {
    for (const s of ['900304.1234567', '900304—1234567', '９００３０４-１２３４５６７', '900304 - 1234567'])
      expect(notes('childcare-leave', leave({ dept: s })).problems.some((p) => /주민등록번호/.test(p)), s).toBe(true);
  });
  it('16자리 접수번호는 주민번호로 보지 않는다', () => {
    expect(notes('childcare-leave', leave({ dept: '1234567890123456' })).problems).toEqual([]);
  });
  it('서식에 없는 칸에 있어도 막는다', () => {
    expect(notes('childcare-leave-approval', { ...APPROVAL, name: '900304-1234567' }).problems.some((p) => /서식에 없는 칸/.test(p))).toBe(true);
  });
  it('날짜 여러 개를 띄어 적어도 주민번호로 보지 않는다', () => {
    expect(notes('infertility-leave', { ...P, days: '2027-01-20 2027-01-21', appliedOn: '2027-01-10' }).problems).toEqual([]);
  });
});

describe('한 줄 칸의 줄바꿈', () => {
  it('사내 서식 서명줄이 갈라지지 않는다', async () => {
    const b = await buildForm('childcare-leave', leave({ name: '김\n가나' }));
    expect(b.md).toContain('신청인  김 가나  (서명 또는 인)');
  });
  it('법정 서식도 오류 없이 만든다', async () => {
    const b = await buildForm('integrated-leave-application', { ...IV2, name: '김\n가나', dept: '총무\r\n팀' });
    const x = await (await JSZip.loadAsync(b.hwpx)).file('Contents/section0.xml')!.async('string');
    expect(x).toContain('신청인        김 가나        (인)');
  });
});

describe('배우자 출산전후휴가 — 회차 반쪽', () => {
  it('2회차 종료일만 적으면 시작일을 요구한다', () => {
    const v = { ...P, birthState: 'due', birthDate: '2027-03-01', p1Start: '2027-02-01', p1End: '2027-02-10', p2End: '2027-03-05', appliedOn: '2027-01-20' };
    expect(notes('spouse-maternity-leave', v).problems).toContain('「2회차 시작일」을(를) 적어 주세요.');
  });
});

describe('난임치료휴가 — 비정상 날짜 목록', () => {
  const I = (days: string) => notes('infertility-leave', { ...P, days, appliedOn: '2027-01-10' });
  it('날짜가 하나도 없으면 막는다', () => {
    expect(I(' , ,').problems).toContain('「휴가 사용 예정일」에 날짜를 하나 이상 적어 주세요.');
  });
  it('같은 날짜를 두 번 적으면 막는다', () => {
    expect(I('2027-01-20, 2027-01-20').problems.some((p) => /두 번/.test(p))).toBe(true);
  });
  it('연간 6일은 해마다 센다 — 두 해에 걸친 7일은 안내하지 않는다', () => {
    const two = '2027-12-27, 2027-12-28, 2027-12-29, 2027-12-30, 2028-01-03, 2028-01-04, 2028-01-05';
    expect(I(two).notes.some((n) => /연간 6일/.test(n))).toBe(false);
    const one = '2027-03-01, 2027-03-02, 2027-03-03, 2027-03-04, 2027-03-05, 2027-03-08, 2027-03-09';
    expect(I(one).notes.some((n) => /2027년 사용 예정일이 7일/.test(n))).toBe(true);
  });
});

describe('기한·기간 문장의 경계', () => {
  it('신청일이 시작일보다 뒤면 음수 대신 「N일 뒤」', () => {
    const r = notes('childcare-leave', leave({ appliedOn: '2027-01-10' }));
    expect(r.notes.join(' ')).toContain('신청일이 휴직 시작보다 6일 뒤입니다.');
    expect(r.notes.join(' ')).not.toMatch(/-\d+일 전/);
  });
  it('2월 29일 시작의 정확한 1년(2029-02-28 까지)은 안내하지 않고, 하루 넘으면 안내한다', () => {
    const y = (end: string) => notes('childcare-leave', leave({ start: '2028-02-29', end, appliedOn: '2028-01-01' })).notes.some((n) => /1년 이내/.test(n));
    expect(y('2029-02-28')).toBe(false);
    expect(y('2029-03-01')).toBe(true);
  });
  it('보통 날짜의 1년 경계(2027-01-04 시작 → 2028-01-03 까지)', () => {
    const y = (end: string) => notes('childcare-leave', leave({ end })).notes.some((n) => /1년 이내/.test(n));
    expect(y('2028-01-03')).toBe(false);
    expect(y('2028-01-04')).toBe(true);
  });
});

describe('법정 서식 — 시간대·메타데이터', () => {
  it('UTC 서쪽 PC 에서도 날짜가 당겨지지 않는다', async () => {
    const tz = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    try {
      expect(new Date(Date.UTC(2027, 0, 20)).getDate()).toBe(19); // 이 시험이 실제로 서쪽 시간대에서 돈다는 확인
      const b = await buildForm('integrated-leave-application', IV2);
      const x = await (await JSZip.loadAsync(b.hwpx)).file('Contents/section0.xml')!.async('string');
      expect(x).toContain('2027년 1월 20일');
      expect(x).toContain('2026년 12월 10일');
    } finally {
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
  });
  it('만든 파일에 변환한 PC 의 저장자·미리보기가 없다', async () => {
    const z = await JSZip.loadAsync((await buildForm('integrated-leave-application', IV2)).hwpx);
    const hpf = await z.file('Contents/content.hpf')!.async('string');
    expect(hpf).toMatch(/<opf:meta name="lastsaveby" content="text"><\/opf:meta>/);
    expect(hpf).not.toMatch(/노무사|ModifiedDate" content="text">2026/);
    expect(Object.keys(z.files).filter((n) => n.startsWith('Preview/'))).toEqual([]);
    expect(await z.file('META-INF/container.xml')!.async('string')).not.toContain('Preview/');
  });
});

describe('주민번호 판정 사본 — 공용 판정과 같은 결과', () => {
  it('같은 표본에 같은 답을 낸다', () => {
    const samples = ['900304-1234567', '900304.1234567', '900304—1234567', '９００３０４-１２３４５６７', '9003​04-1234567', '900304-1******', '1234567890123456', '2027-01-20 2027-01-21', '010-0000-0000', '900304-9234567', '', '접수 20102026307745'];
    for (const x of samples) expect(formsRrn(x), x).toBe(sharedRrn(x));
    expect(samples.filter(formsRrn).length).toBeGreaterThanOrEqual(5);
  });
});
