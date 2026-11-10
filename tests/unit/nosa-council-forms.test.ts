// 노사협의회 서류(01~14) — 노사협의회신고 스킬 test_assess.py 의 문서 시험 7건을 이름 그대로 옮기고,
// 변형 전부(직접·간접·위촉 × 겸임 × 전자투표 × 선거 결과 유무 × 선거구)를 PDF·한글로 그려 글꼴·금지어·근거 표기를 본다.
// 사업장은 합성 값만 쓴다. 근로자 이름 칸은 비어 있어야 한다.
import { readFileSync } from 'node:fs';

import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { DOC_NAMES } from '@/lib/nosa-council/assess';
import {
  concurrentDoc, grievanceGuideDoc, nosaBlanks, nosaDocs, nosaErrors, portalDoc, PORTAL_FIELDS, quorumDoc, rosterDoc, type NosaFormInput,
} from '@/lib/nosa-council/forms';
import { formHwpx, formLines, formPdf, type FormDoc } from '@/lib/work-rules-report/render';
import { bannedHits } from '@/lib/tool-kit/banned';

const FONT = new Uint8Array(readFileSync('public/fonts/NanumGothic-Regular.ttf'));
const WORDS = ['노무사', '상담', '자문', '진단', '판정', '적법', '확률', '체불', '위법', '승소', '받을 수 있는 금액', '포괄', '대신', '대행', '대리', '지도'];
const all = (d: FormDoc) => formLines(d).join('\n');

const BASE: NosaFormInput = {
  workplace: { name: '가상제조', ownerName: '김대표', bizNo: '0000000000', address: '서울특별시 가상구 가상로 1', tel: '02-000-0000' },
  headcount: 120,
  majorityUnion: false,
  workerMembers: 5,
  employerMembers: 5,
  grievanceMembers: 3,
  concurrentRep: true,
  concurrentScope: ['탄력적 근로시간제 서면합의'],
  installDate: '2026-12-01',
  electionDate: '2026-11-19',
  termStart: '2026-12-01',
  rosterDate: '2026-11-16',
  electors: 100,
  election: { electors: 100, voters: 60, candidates: 5, notified: true, supporters: 40 },
  council: { name: '가상제조 노사협의회', regularMeetings: '3월·6월·9월·12월 둘째 주 화요일' },
  unit: '사업',
  office: '서울지방고용노동청 서울가상지청',
  writtenDate: '2026-11-10',
};
const CFG: NosaFormInput = { workplace: { name: '시험' }, headcount: 50, majorityUnion: false, concurrentRep: true, concurrentScope: ['탄력적 근로시간제 서면합의'], writtenDate: '2026-11-10' };

// ── 파이썬 test_assess.py 문서 시험 7건 ───────────────────

describe('겸임문서시험', () => {
  // 261110 재홍님: 두 출처 대조 끝났으니 확인서·정족수 서류에 번호·일자를 넣는다. 263 은 회시일이 토요일·본문 일자 없음, 8048 은 과반 지지 근거가 아니다
  const 근거들 = ['근로기준정책과-1140(2023. 4. 7.)', '근로기준정책과-221(2021. 1. 20.)', '「노사협의회 운영 매뉴얼」(2022. 12.) 95쪽'];

  it('test_확인서는_두_축을_칸으로_둔다', () => {
    const t = all(concurrentDoc(CFG));
    expect(t).toContain('근로자 과반수 지지');
    expect(t).toContain('권한 부여 사실 주지 + 근로자 과반수 참여');
    expect(t).not.toContain('겸하여 행사하는 자로 선출되었음을 확인한다');
  });
  it('test_일자_미확인_263_은_쓰지_않음', () => {
    expect(all(concurrentDoc(CFG))).not.toContain('-263');
  });
  it('test_8048_은_과반지지_근거로_쓰지_않음', () => {
    const line = formLines(concurrentDoc(CFG)).filter((l) => l.includes('과반수 지지:'))[0];
    expect(line).toBeTruthy();
    expect(line).not.toContain('8048');
  });
  it('test_판정서에_회시번호_일자', () => {
    for (const d of [quorumDoc({ ...CFG, election: { electors: 100, voters: 60, notified: true, supporters: 40 } }), quorumDoc(CFG)]) {
      for (const x of 근거들) expect(all(d)).toContain(x);
    }
  });
  it('test_확인서에_회시번호_일자', () => {
    for (const x of 근거들) expect(all(concurrentDoc(CFG))).toContain(x);
  });
  it('test_확인되지_않은_회시는_쓰지_않음', () => {
    expect(all(concurrentDoc(CFG))).not.toContain('-994');
  });
});

describe('문서시험', () => {
  it('test_고충대장_1년_보존', () => {
    const t = all(grievanceGuideDoc({ ...CFG, concurrentRep: false }));
    expect(t).toContain('1년간 보존');
    expect(t).not.toContain('보존기간은 협의회규정으로 정한다');
  });
});

// ── 더한 시험 ──────────────────────────────────────────

describe('근거 두 줄은 05·07 에 글자 그대로', () => {
  const lines = [
    '- ① 권한 부여 사실 주지 + 근로자 과반수 참여: 고용노동부 근로기준정책과-1140(2023. 4. 7.), 근로기준정책과-221(2021. 1. 20.)',
    '- ② 근로자 과반수 지지: 고용노동부 「노사협의회 운영 매뉴얼」(2022. 12.) 95쪽',
  ];
  it('정족수 확인서(결과 유무)·겸임 확인서', () => {
    for (const d of [quorumDoc(BASE), quorumDoc({ ...BASE, election: undefined }), concurrentDoc(BASE)]) {
      const ls = formLines(d);
      for (const l of lines) expect(ls, d.title).toContain(l);
    }
  });
  it('겸임이 아니면 정족수 확인서에 근로자대표 절이 없다', () => {
    expect(all(quorumDoc({ ...BASE, concurrentRep: false }))).not.toContain('근로기준정책과');
  });
});

describe('서류 고르기', () => {
  it('직접선거 + 겸임이면 12(위촉통지서)를 빼고 13건', () => {
    const r = nosaDocs(BASE);
    expect(r.made.map((d) => d.id)).toEqual([
      '01_설치의무_확인서', '02_선출방식_확인서', '03_선거관리규정', '04_선거인명부', '05_정족수_확인서', '06_당선공고', '07_근로자대표_겸임_선출_확인서',
      '08_회의_소집통보서', '09_안건_구분표', '10_고충처리위원_선임_의결서', '11_고충처리_운영지침', '13_협의회규정_필수기재_점검표', '14_노동포털_제출_입력값',
    ]);
    expect(r.skipped).toEqual([{ id: '12_위촉통지서', reason: '선거 방식이므로 만들지 않음' }]);
  });
  it('과반수 노동조합 위촉이면 선거 서류(03~06)를 빼고 위촉통지서를 만든다', () => {
    const r = nosaDocs({ ...BASE, majorityUnion: true, concurrentRep: false });
    expect(r.made.map((d) => d.id.slice(0, 2))).toEqual(['01', '02', '08', '09', '10', '11', '12', '13', '14']);
    expect(r.skipped.map((x) => x.id.slice(0, 2))).toEqual(['03', '04', '05', '06', '07']);
  });
  it('서류 제목은 확인서 이름 상수를 쓴다', () => {
    const t = nosaDocs(BASE).made.map((d) => d.doc.title);
    expect(t).toContain(DOC_NAMES.install);
    expect(t).toContain(DOC_NAMES.method);
    expect(t).toContain(DOC_NAMES.quorum);
  });
});

describe('빈 칸·맞지 않는 칸', () => {
  it('사업장명이 비면 만들지 않는다', () => {
    expect(nosaBlanks({ ...BASE, workplace: {} })).toEqual(['사업장명']);
    expect(nosaBlanks(BASE)).toEqual([]);
  });
  it('날짜·선거 숫자·사업자등록번호', () => {
    expect(nosaErrors(BASE)).toEqual([]);
    const e = nosaErrors({ ...BASE, installDate: '2026-02-30', workplace: { ...BASE.workplace, bizNo: '123' }, election: { electors: 10, voters: 11 } }).join('\n');
    expect(e).toMatch(/installDate/);
    expect(e).toMatch(/사업자등록번호/);
    expect(e).toMatch(/선거인 수\(10명\)보다 많습니다/);
  });
});

describe('정족수 확인서 — 값', () => {
  it('직접선거 결과를 채우고 투표율은 파이썬 round 값(32명 중 1명 → 3.12%)', () => {
    const t = all(quorumDoc({ ...BASE, concurrentRep: false, election: { electors: 32, voters: 1 } }));
    expect(t).toContain('3.12%');
    expect(t).toContain('근로자 과반수 참여 미달 - 선출 불성립, 재투표 필요');
  });
  it('간접선거·선거구는 단계마다 한 줄', () => {
    const ind = all(quorumDoc({ ...BASE, indirectReason: '작업부서별 특성이 현저히 다르다', election: { electors: 200, voters: 120, delegateElectors: 20, delegateVoters: 10 } }));
    expect(ind).toContain('1단계(위원선거인 선출)');
    expect(ind).toContain('미충족 단계 재투표 필요');
    const dis = all(quorumDoc({ ...BASE, election: { electors: 100, voters: 55, districts: [{ label: '생산', electors: 40, voters: 30 }, { label: '사무', electors: 60, voters: 25 }] } }));
    expect(dis).toContain('선거구 생산');
    expect(dis).toContain('미달 선거구 재투표 필요');
  });
  it('지지자 수를 넣지 않으면 과반 지지 결과를 비운다', () => {
    expect(all(quorumDoc({ ...BASE, election: { electors: 100, voters: 60, notified: true } }))).toContain('지지자 수 미입력');
  });
});

describe('근로자 이름은 채우지 않는다', () => {
  it('선거인명부는 빈 줄만', () => {
    const t = rosterDoc(BASE).blocks.find((b) => b.kind === 'table' && b.rows[0][1]?.text === '성명');
    expect(t && t.kind === 'table').toBe(true);
    if (t?.kind !== 'table') return;
    for (const r of t.rows.slice(1)) expect(r.slice(1).every((c) => c.text === '')).toBe(true);
  });
});

describe('14 노동포털 제출 입력값(SN012)', () => {
  const d = portalDoc(BASE);
  const t = all(d);
  it('신청 화면의 칸을 전부 싣는다', () => {
    for (const f of PORTAL_FIELDS) expect(t, f.label).toContain(f.label);
    expect(PORTAL_FIELDS.length).toBeGreaterThanOrEqual(30);
  });
  it('아는 값은 채우고(규정 제정일 = 설치일, 고충처리위원 수, 위원 수, 관할관서) 모르는 값은 비운다', () => {
    expect(t).toContain('2026년 12월 1일');
    expect(t).toContain('3명');
    expect(t).toContain('근로자위원 5명 / 사용자위원 5명');
    expect(t).toContain('서울지방고용노동청 서울가상지청');
    expect(t).toContain('3월·6월·9월·12월 둘째 주 화요일');
    expect(t).toContain('000-00-00000');
    const row = (label: string) => d.blocks.flatMap((b) => (b.kind === 'table' ? b.rows : [])).find((r) => r[1]?.text === label);
    expect(row('법인등록번호')?.[3].text).toBe('');
    expect(row('휴대전화')?.[3].text).toBe('');
  });
  it('위원 수를 넣지 않으면 자리값을 옮기지 않는다', () => {
    const e = all(portalDoc({ ...BASE, workerMembers: undefined, employerMembers: undefined }));
    expect(e).not.toContain('근로자위원 5명 / 사용자위원 5명');
  });
  it('첨부 확장자 안내 — hwpx·docx 없음, pdf 또는 hwp', () => {
    expect(t).toMatch(/hwpx·docx·xlsx 는 목록에 없/);
    expect(t).toMatch(/pdf 또는 hwp/);
  });
});

describe('그리기 — 변형 전부', () => {
  const variants: NosaFormInput[] = [];
  for (const m of ['direct', 'indirect', 'union'] as const)
    for (const concurrentRep of [true, false])
      for (const electronicVoting of [true, false])
        for (const withResult of [true, false])
          variants.push({
            ...BASE,
            majorityUnion: m === 'union',
            indirectReason: m === 'indirect' ? '작업부서별 특성이 현저히 다르다' : undefined,
            concurrentRep,
            concurrentScope: concurrentRep && electronicVoting ? [] : BASE.concurrentScope,
            electronicVoting,
            election: withResult ? (m === 'indirect' ? { electors: 200, voters: 120, delegateElectors: 20, delegateVoters: 15, notified: true } : { electors: 100, voters: 60, candidates: 2, seats: 3 }) : undefined,
          });
  variants.push({ ...BASE, election: { electors: 100, voters: 55, districts: [{ label: '1', electors: 40, voters: 30 }, { label: '2', electors: 60, voters: 25 }] } });
  variants.push({ workplace: { name: '최소' }, headcount: 20, majorityUnion: false, writtenDate: '2026-11-10' });
  const seen = new Map<string, FormDoc>();
  for (const v of variants) for (const d of nosaDocs(v).made) seen.set(JSON.stringify(d.doc), d.doc);
  const docs = [...seen.values()];

  it('모든 서류 글자에 금지어가 없다', () => {
    const hits = docs.flatMap((d) => formLines(d).flatMap((l) => bannedHits(l, WORDS).map((w) => `${d.title}: ${w} | ${l.slice(0, 60)}`)));
    expect(hits).toEqual([]);
  });
  it('확인되지 않은 회시번호·내부 파일 이름이 없다', () => {
    const t = docs.map(all).join('\n');
    for (const x of ['-263', '-994', '8048', 'manual-crosscheck', '.md', '**', '☐']) expect(t).not.toContain(x);
  });
  it('PDF 로 그려진다(글꼴에 없는 글자 없음)', async () => {
    const bytes = await formPdf(docs, FONT);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(docs.length);
  }, 60_000);
  it('한글(hwpx)로 그려진다', async () => {
    const z = await JSZip.loadAsync(await formHwpx(docs));
    const sec = await z.file('Contents/section0.xml')!.async('string');
    expect(sec).toContain(DOC_NAMES.quorum);
    expect(sec).toContain('근로기준정책과-1140(2023. 4. 7.)');
  });
});
