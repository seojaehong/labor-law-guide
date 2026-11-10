import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { bannedHits } from '@/lib/tool-kit/banned';
import { formHwpx, formLines, formPdf, type FormDoc } from '@/lib/work-rules-report/render';
import { ELECTION_DOC_IDS, electionDates, electionDocs, electionDocsErrors, type ElectionDocsInput } from '@/lib/nosa-council/election-docs';
import { noticeDoc } from '@/lib/nosa-council/forms';

// 근로자위원 선거 서류 — 선관위 구성 공고 · 선거공고문 · 입후보 신청서 · 후보자 공고 · 투표용지 · 개표록 · 당선공고.
// 설계 = practice-docs-spec-261110.md 「make_council_election_docs」. 사업장·사람은 합성 값.
// 찬반투표의 당선 기준은 참고자료에 없어 도구가 정하지 않는다(찬성·반대 수만 적는다).

const FONT = new Uint8Array(readFileSync('public/fonts/NanumGothic-Regular.ttf'));
const WORDS = ['노무사', '상담', '자문', '진단', '판정', '적법', '확률', '체불', '위법', '승소', '받을 수 있는 금액', '포괄', '대신', '대행', '대리', '지도'];
const all = (d: FormDoc) => formLines(d).join('\n');
const doc = (r: ReturnType<typeof electionDocs>, id: string) => r.made.find((d) => d.id === id)!.doc;

const BASE: ElectionDocsInput = {
  workplace: { name: '가상제조' },
  seats: 3,
  targetInstallDate: '2026-12-15',
  vote: { time: '09:00~18:00', place: '본관 1층 투표소' },
  concurrentRep: true,
  concurrentScope: ['탄력적 근로시간제 서면합의', '연차 유급휴가 대체 서면합의'],
  tieBreak: '근속기간이 긴 사람',
  candidates: [
    { name: '가상일', dept: '생산1팀' },
    { name: '가상이', dept: '생산2팀' },
    { name: '가상삼', dept: '품질팀' },
  ],
  writtenDate: '2026-11-10',
};

describe('일정 — 설치 목표일에서 거꾸로(일정역산)', () => {
  it('날짜를 비우면 schedule 값, 넣으면 그 값', () => {
    const d = electionDates(BASE);
    expect(d).toMatchObject({ committee: '2026-11-05', announce: '2026-11-19', candidacyEnd: '2026-11-28', roster: '2026-11-30', vote: '2026-12-03', winnerNotice: '2026-12-05' });
    expect(electionDates({ ...BASE, dates: { vote: '2026-12-04' } }).vote).toBe('2026-12-04');
  });
  it('순서가 뒤집힌 날짜·과반수 노동조합·위원 수 범위 밖은 오류', () => {
    expect(electionDocsErrors({ ...BASE, dates: { announce: '2026-12-10', vote: '2026-12-03' } }).join()).toMatch(/선거일/);
    expect(electionDocsErrors({ ...BASE, majorityUnion: true }).join()).toMatch(/노동조합/);
    expect(electionDocsErrors({ ...BASE, seats: 11 }).join()).toMatch(/3명 이상 10명 이하/);
    expect(electionDocsErrors({ ...BASE, workplace: {} }).join()).toMatch(/사업장명/);
    expect(electionDocsErrors(BASE)).toEqual([]);
  });
});

describe('선거공고문·선관위 공고·입후보 신청서', () => {
  it('선거공고문 — 직접·비밀·무기명, 과반수 참여, 선거인 범위, 찬반투표, 겸임 권한 범위, 동점 기준', () => {
    const t = all(doc(electionDocs(BASE), '02_선거공고문'));
    for (const x of ['직접·비밀·무기명', '근로자 과반수가 참여', '기간제·단시간', '찬반투표', '탄력적 근로시간제 서면합의', '근속기간이 긴 사람', '2026년 12월 3일', '본관 1층 투표소', '3명']) expect(t).toContain(x);
    expect(t).toMatch(/근로자대표/);
  });
  it('동점 기준을 비우면 ○○ 로 남긴다', () => {
    expect(all(doc(electionDocs({ ...BASE, tieBreak: undefined }), '02_선거공고문'))).toMatch(/동점.*○○/);
  });
  it('선관위 구성 공고 — 사용자 개입 금지, 위원 이름은 넣을 때만', () => {
    const t = all(doc(electionDocs({ ...BASE, committee: [{ position: '위원장', name: '가상위원' }, { position: '위원' }] }), '01_선관위구성공고'));
    expect(t).toContain('가상위원');
    expect(t).toMatch(/법 제10조제1항/);
  });
  it('입후보 신청서에 주민등록번호·추천서가 없다', () => {
    const t = all(doc(electionDocs(BASE), '03_입후보신청서'));
    expect(t).not.toContain('주민등록번호');
    expect(t).not.toContain('추천');
    for (const x of ['성명', '소속', '직책', '연락처', '서명']) expect(t).toContain(x);
  });
});

describe('투표용지 — 후보 수와 정원으로 형식을 고른다', () => {
  it('후보 3 · 정원 3 → 찬반형', () => {
    const r = electionDocs(BASE);
    expect(r.ballot?.method).toBe('찬반투표');
    const t = all(doc(r, '05_투표용지'));
    expect(t).toContain('찬성');
    expect(t).toContain('반대');
    expect(t).toContain('가상이');
    expect(t).toMatch(/근로자대표/);
  });
  it('후보 4 · 정원 3 → 다수득표형(기표 수는 입력 값, 없으면 ○)', () => {
    const r = electionDocs({ ...BASE, candidates: [...BASE.candidates!, { name: '가상사', dept: '물류팀' }], marksPerBallot: 1 });
    expect(r.ballot?.method).toBe('다수득표');
    const t = all(doc(r, '05_투표용지'));
    expect(t).not.toContain('반대');
    expect(t).toMatch(/1명에게 기표/);
  });
  it('후보가 정해지지 않았으면 후보자 공고·투표용지는 만들지 않는다', () => {
    const r = electionDocs({ ...BASE, candidates: undefined });
    expect(r.skipped.map((s) => s.id)).toEqual(expect.arrayContaining(['04_후보자공고', '05_투표용지']));
  });
  it('후보 수만 알면 빈 줄로 만든다', () => {
    const r = electionDocs({ ...BASE, candidates: undefined, candidateCount: 2 });
    expect(r.ballot?.method).toBe('찬반투표');
    expect(r.warnings.join()).toMatch(/후보가 정원보다 적다/);
  });
});

describe('개표록·당선공고', () => {
  const RES = { electors: 100, voters: 60 };
  it('찬반형 — 찬성·반대 수만 적고 당선 기준을 지어내지 않는다', () => {
    const r = electionDocs({ ...BASE, result: RES, candidates: BASE.candidates!.map((c, k) => ({ ...c, inFavor: 50 - k, against: 8 + k })) });
    const t = all(doc(r, '06_개표록'));
    expect(t).toContain('선거인 100명 중 60명 참여');
    expect(t).toContain('근로자 과반수 참여 충족');
    expect(t).toMatch(/가상일[\s\S]*50[\s\S]*8/);
    expect(t).toMatch(/선거관리규정/);
    expect(t).not.toMatch(/과반수 찬성|찬성률/);
    expect(r.made.map((d) => d.id)).toContain('07_당선공고');
  });
  it('참여 미달이면 당선공고를 만들지 않는다', () => {
    const r = electionDocs({ ...BASE, result: { electors: 100, voters: 40 } });
    expect(r.skipped).toContainEqual({ id: '07_당선공고', reason: expect.stringMatching(/재투표/) });
    expect(all(doc(r, '06_개표록'))).toContain('미달');
  });
  it('다수득표 — 득표순으로 정원만큼, 경계에서 동점이면 정하지 않고 알린다', () => {
    const four = [...BASE.candidates!, { name: '가상사', dept: '물류팀' }];
    const ok = electionDocs({ ...BASE, candidates: four.map((c, k) => ({ ...c, votes: [30, 25, 20, 10][k] })), result: RES });
    expect(ok.elected).toEqual(['가상일', '가상이', '가상삼']);
    expect(all(doc(ok, '07_당선공고'))).toContain('가상삼');
    const tie = electionDocs({ ...BASE, candidates: four.map((c, k) => ({ ...c, votes: [30, 25, 20, 20][k] })), result: RES });
    expect(tie.elected).toBeNull();
    expect(tie.warnings.join()).toMatch(/동점[\s\S]*근속기간이 긴 사람/);
  });
  it('선거구별·간접선거 참여 확인', () => {
    const d = electionDocs({ ...BASE, districts: [{ label: '본사', seats: 1 }, { label: '공장', seats: 2 }], result: { electors: 100, voters: 55, districts: [{ label: '본사', electors: 40, voters: 30 }, { label: '공장', electors: 60, voters: 25 }] } });
    expect(all(doc(d, '06_개표록'))).toContain('미달 선거구 재투표 필요');
    const ind = electionDocs({ ...BASE, indirectReason: '사무직·기술직·기능직 사업장이 따로 있다', result: { electors: 400, voters: 250, delegateElectors: 20, delegateVoters: 15 } });
    expect(all(doc(ind, '06_개표록'))).toContain('2단계');
  });
  it('당선공고는 설치·신고 서류(06)와 같은 틀 — 이름을 주면 채우고, 겸임 문구를 싣는다', () => {
    const r = electionDocs({ ...BASE, result: RES, candidates: BASE.candidates!.map((c) => ({ ...c, elected: true })) });
    const t = all(doc(r, '07_당선공고'));
    expect(t).toContain('가상일');
    expect(t).toContain('선거인 100명 중 60명이 참여하여');
    expect(t).toMatch(/근로자대표의 권한을 겸하여/);
    const slice2 = all(noticeDoc({ workplace: { name: '가상제조' }, headcount: 120, majorityUnion: false, concurrentRep: true, electionDate: '2026-12-03', election: RES, writtenDate: '2026-11-10' }));
    expect(slice2).toContain('선거인 100명 중 60명이 참여하여');
    expect(slice2.split('\n')[0]).toBe(t.split('\n')[0]);
  });
});

describe('서류 묶음', () => {
  it('일곱 가지 서류 ID · 고른 것만 만든다', () => {
    expect([...ELECTION_DOC_IDS]).toEqual(['01_선관위구성공고', '02_선거공고문', '03_입후보신청서', '04_후보자공고', '05_투표용지', '06_개표록', '07_당선공고']);
    expect(electionDocs(BASE, ['02_선거공고문']).made.map((d) => d.id)).toEqual(['02_선거공고문']);
  });
  it('전부 PDF·한글로 그려지고 금지어·주민등록번호가 없다', async () => {
    const variants = [
      { ...BASE, result: { electors: 100, voters: 60 }, candidates: BASE.candidates!.map((c, k) => ({ ...c, inFavor: 40 + k, against: 5 })) },
      { ...BASE, concurrentRep: false, candidates: undefined, candidateCount: 5, marksPerBallot: 2 },
      { ...BASE, districts: [{ label: '본사', seats: 1 }, { label: '공장', seats: 2 }], result: { electors: 100, voters: 70, districts: [{ label: '본사', electors: 40, voters: 30 }, { label: '공장', electors: 60, voters: 40 }] } },
    ];
    for (const v of variants) {
      const r = electionDocs(v);
      for (const d of r.made) {
        const t = all(d.doc);
        expect(bannedHits(t, WORDS), d.id).toEqual([]);
        expect(t).not.toContain('주민등록번호');
        await formPdf([d.doc], FONT);
        await formHwpx([d.doc]);
      }
      expect(bannedHits(r.warnings.join('\n'), WORDS)).toEqual([]);
    }
  }, 120_000);
});
