// 협의회규정 본문 점검(check_council_rules) — 실제 사업장 2021 규정(29개조 + 별지, 이름·주소 가림)과 견본으로 시험한다.
// 기대값 = 사람이 손으로 대조한 결과(2026-11 회고 자료 2·3절과 부록 대비표). 견본은 필수 0건이어야 한다.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

import { checkCouncilRules } from '@/lib/nosa-council/rules-check';
import { councilRulesDoc, type RulesInput } from '@/lib/nosa-council/rules-template';
import { formLines } from '@/lib/work-rules-report/render';
import { bannedHits } from '@/lib/tool-kit/banned';
import { registerNosa, nosaLocalOnly, nosaRemoteSafe } from '../../tools/k-labor/groups/nosa.mjs';

const SAMPLE = fs.readFileSync('tests/fixtures/nosa-council/rules-sample-2021.txt', 'utf8');
const NOSA_WORDS = ['노무사', '상담', '자문', '진단', '판정', '적법', '확률', '체불', '위법', '승소', '받을 수 있는 금액', '포괄', '대신', '대행', '대리', '지도'];

const find = (r: ReturnType<typeof checkCouncilRules>, id: string) => r.findings.filter((f) => f.id === id);

describe('checkCouncilRules — 2021 규정 표본(이름 가림)', () => {
  const r = checkCouncilRules({ text: SAMPLE });

  it('조문 29개·부칙·별지를 나눈다, 사업장명은 「사업장명 :」 줄에서', () => {
    expect(r.parsed).toMatchObject({ articles: 29, addendum: true, formsTail: true, workplaceName: '가나상사(주)' });
  });

  it('제7조② 「근로자 과반수가 참여하여」 없음 — 필수, 법 제6조제2항', () => {
    const f = find(r, 'direct-majority');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ grade: '필수', regulation: '제7조제2항', law: '법 제6조제2항 본문' });
  });

  it('제7조③ 위원선거인 두 단계 모두 과반수 참여 요건 없음 — 필수, 법 제6조제2항 단서', () => {
    const f = find(r, 'indirect-majority');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ grade: '필수', regulation: '제7조제3항', law: '법 제6조제2항 단서' });
    expect(f[0].issue).toMatch(/근로자 과반수가 참여/);
    expect(f[0].issue).toMatch(/위원선거인 과반수가 참여/);
  });

  it('제7조④ 근로자 10인 이상 추천 — 선택(법령이 정하지 않고 매뉴얼 예시도 추천을 둔다), 없애라고 하지 않는다', () => {
    const f = find(r, 'nomination-requirement');
    expect(f.map((x) => x.regulation)).toEqual(['제7조제4항']);
    expect(f[0]).toMatchObject({ grade: '선택', law: '시행령 제3조' });
    expect(f[0].issue).not.toMatch(/옛 법령 문구가 남아/);
    expect(f[0].change).toMatch(/노사가 협의회에서 정한다/);
    expect(f[0].change).not.toMatch(/삭제한다|지운다/);
  });

  it('제10조④ 결원 30일 이내 「위촉」만 — 근로자위원은 선출이라 필수, 시행령 제4조', () => {
    const f = find(r, 'vacancy-fill');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ grade: '필수', regulation: '제10조제4항', law: '시행령 제4조' });
    expect(f[0].change).toMatch(/위촉하거나 선출한다/);
  });

  it('제18조① 16개 호 — 16호 성희롱 예방 없음, 필수', () => {
    const f = find(r, 'topics');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ grade: '필수', regulation: '제18조제1항', law: '법 제20조제1항제16호', current: '16개 호' });
    expect(f[0].issue).toMatch(/성희롱/);
  });

  it('제23조①3호 「기타 중재가 필요한 경우」 — 선택, 법 제25조제1항', () => {
    expect(find(r, 'arbitration-other')).toEqual([expect.objectContaining({ grade: '선택', regulation: '제23조제1항제3호', law: '법 제25조제1항' })]);
    expect(find(r, 'arbitration-target')).toEqual([]);
  });

  it('제9조② 「보권위원」 오기 — 권장', () => {
    expect(find(r, 'typo-vacancy')).toEqual([expect.objectContaining({ grade: '권장', regulation: '제9조제2항' })]);
  });

  it('부칙 시행일 「2017년 4월 일」 빈칸 — 권장', () => {
    expect(find(r, 'addendum-date')).toEqual([expect.objectContaining({ grade: '권장', regulation: '부칙' })]);
  });

  it('제11조① 회의일을 「제 3 금요일」로 고정 — 선택, 법 제12조제1항', () => {
    expect(find(r, 'regular-fixed-date')).toEqual([expect.objectContaining({ grade: '선택', regulation: '제11조제1항', law: '법 제12조제1항' })]);
    expect(find(r, 'regular-interval')).toEqual([]);
  });

  it('시행령 제5조제1항 기재사항 7개 — 모두 있음', () => {
    expect(r.requiredItems).toHaveLength(7);
    expect(r.requiredItems.filter((x) => !x.found)).toEqual([]);
    expect(r.requiredItems.map((x) => x.where)).toEqual(['제7조제1항', '제7조제2항', '제7조제5항', '제10조제3항', '제12조제1항', '제23조제1항', '제27조제1항']);
  });

  it('별지 서식 — 다른 이름 「다라」·위촉 근거 조문 2곳은 권장, 추천 요건은 선택', () => {
    const other = find(r, 'forms-other-name');
    expect(other).toHaveLength(1);
    expect(other[0]).toMatchObject({ grade: '권장', regulation: '별지 서식', law: '시행령 제3조' });
    expect(other[0].issue).toMatch(/「다라」/);
    expect(find(r, 'forms-nomination')).toEqual([expect.objectContaining({ grade: '선택' })]);
    expect(find(r, 'forms-basis-employer')).toEqual([expect.objectContaining({ grade: '권장' })]);
    expect(find(r, 'forms-basis-grievance')).toEqual([expect.objectContaining({ grade: '권장', law: '법 제27조제1항' })]);
    expect(find(r, 'forms-basis-grievance')[0].change).toMatch(/법 제27조제1항에 따라/);
  });

  it('선거 공고의 당선 요건에 과반수 참여가 없음 — 필수, 법 제6조제2항', () => {
    expect(find(r, 'forms-election-majority')).toEqual([expect.objectContaining({ grade: '필수', regulation: '별지 서식(선거 공고)', law: '법 제6조제2항' })]);
  });

  it('이미 맞춘 조항은 내지 않는다 — 불이익 금지(R2)·차점자 조건(R5)·12호 직무발명(R6)·고충 3인·청취 기산(R8)·15일 제출(R9)', () => {
    const ids = r.findings.map((f) => f.id);
    for (const id of ['disadvantage', 'runner-up', 'topic-12-invention', 'grievance-members', 'grievance-start', 'report-15days', 'amend-resolution', 'quorum', 'members-range']) {
      expect(ids, id).not.toContain(id);
    }
  });

  it('전체 — 필수 5 · 권장 5 · 선택 4, 필수 → 권장 → 선택 순', () => {
    expect(r.counts).toEqual({ 필수: 5, 권장: 5, 선택: 4 });
    expect(r.findings.map((f) => f.grade)).toEqual([...Array(5).fill('필수'), ...Array(5).fill('권장'), ...Array(4).fill('선택')]);
  });

  it('결과 글자에 금지어가 없다', () => {
    expect(bannedHits(JSON.stringify(r), NOSA_WORDS)).toEqual([]);
  });
});

describe('checkCouncilRules — 견본(make_labor_council_forms 00)', () => {
  const FILLED = {
    workplaceName: '가상상사', workerMembers: 5, employerMembers: 5, grievanceMembers: 3, councilName: '가상상사 노사협의회', unit: '사업' as const,
    regularMeetings: '매 분기 마지막 달 첫째 주', effectiveDate: '2026-12-01', employerPositions: ['인사팀장', '생산팀장'], allowanceHours: 2,
    subcommitteeMembers: 2, electionCommitteeMembers: 3, tieBreak: '근속기간이 긴 사람', arbitrationMembers: 2, grievanceDesk: '고충처리위원 전자우편', chairTerm: '1년',
  };
  const cases: [string, RulesInput][] = [
    ['직접선거', { ...FILLED, majorityUnion: false }],
    ['선거구 + 위원선거인', { ...FILLED, majorityUnion: false, indirectReason: '사무직·기술직·기능직 사업장이 따로 있다', districts: [{ label: '본사', seats: 2 }, { label: '공장', seats: 3 }] }],
    ['과반수 노동조합', { ...FILLED, majorityUnion: true, unionName: '가상상사 노동조합' }],
  ];
  for (const [label, input] of cases) {
    it(`${label} — 필수 0건, 기재사항 7개 모두`, () => {
      const r = checkCouncilRules({ text: formLines(councilRulesDoc(input)).join('\n') });
      expect(r.parsed.articles).toBeGreaterThan(30);
      expect(r.findings.filter((f) => f.grade === '필수'), JSON.stringify(r.findings)).toEqual([]);
      expect(r.requiredItems.every((x) => x.found)).toBe(true);
      expect(r.findings, JSON.stringify(r.findings)).toEqual([]);
    });
  }
  it('칸을 비운 견본 — 필수 0건, 시행일 빈칸만 권장', () => {
    const r = checkCouncilRules({ text: formLines(councilRulesDoc({ majorityUnion: false })).join('\n') });
    expect(r.findings.filter((f) => f.grade === '필수')).toEqual([]);
    expect(r.findings.map((f) => f.id)).toEqual(['addendum-date']);
    expect(JSON.stringify(r)).not.toContain('—');
  });
});

describe('checkCouncilRules — 옛 견본(2011) 문구 반례', () => {
  it('직무발령 오기 · 협의사항 기준 중재 · 고충 접수일 기산 · 4명 이내 · 조건 없는 차점자 · 정족수 다름 → 필수', () => {
    const text = [
      '제1조(구성) ① 협의회는 근로자위원과 사용자위원 각 2명으로 구성한다.',
      '② 근로자위원은 근로자 과반수가 참여하여 직접·비밀·무기명 투표로 선출한다.',
      '제2조(보궐) 결원이 생기면 차점자를 근로자위원으로 한다.',
      '제3조(정족수) 회의는 위원 과반수의 출석으로 열고 출석위원 과반수 찬성으로 의결한다.',
      '제4조(협의사항) 협의회는 다음 각 호를 협의한다.',
      ...COUNCIL_TOPICS_2011.map((t, i) => `${i + 1}. ${t}`),
      '제5조(임의중재) ① 다음 각 호의 경우 중재를 받을 수 있다.',
      '1. 제4조에 규정된 사항에 관하여 협의회가 의결하지 못한 경우',
      '제6조(고충처리위원) ① 고충처리위원은 4인 이내로 한다.',
      '② 고충처리위원은 고충을 접수한 날부터 10일 이내에 처리결과를 알린다.',
    ].join('\n');
    const r = checkCouncilRules({ text });
    const ids = r.findings.filter((f) => f.grade === '필수').map((f) => f.id);
    for (const id of ['topic-12-invention', 'arbitration-target', 'grievance-start', 'grievance-members', 'runner-up', 'quorum', 'members-range', 'topics']) expect(ids, id).toContain(id);
    // 「없으면 뜬다」 쪽 — 표본 시험의 「안 뜬다」가 빈 검사가 아님을 보인다
    const rec = r.findings.filter((f) => f.grade === '권장').map((f) => f.id);
    for (const id of ['disadvantage', 'report-15days', 'amend-resolution', 'addendum-absent']) expect(rec, id).toContain(id);
    // 시행령 제5조제1항 — 후보 등록·사용자위원 자격·근로 간주 시간·회의 소집이 없다
    expect(r.requiredItems.filter((x) => !x.found).map((x) => x.no)).toEqual([2, 3, 4, 5]);
    for (const no of [2, 3, 4, 5]) expect(ids, `required-${no}`).toContain(`required-${no}`);
    expect(JSON.stringify(r), '결과 글자에 줄표 없음').not.toContain('—');
  });
});

// 2011 견본 16개 호(12호 「직무발령」 오기, 성희롱 호 없음)
const COUNCIL_TOPICS_2011 = [
  '생산성 향상과 성과배분', '근로자의 채용·배치 및 교육훈련', '근로자의 고충처리', '안전·보건 기타 작업환경개선과 근로자의 건강증진', '인사·노무관리의 제도개선',
  '경영상 또는 기술상의 사정으로 인한 인력의 배치전환·재훈련·해고 등 고용조정의 일반원칙', '작업 및 휴게시간의 운용', '임금의 지불방법·체계·구조 등의 제도개선',
  '신기계·기술의 도입 또는 작업공정의 개선', '작업수칙의 제정 또는 개정', '종업원지주제 기타 근로자의 재산형성에 관한 지원', '직무발령 등과 관련하여 당해 근로자에 대한 보상에 관한 사항',
  '근로자의 복지증진', '사업장 내 근로자 감시설비의 설치', '여성근로자의 모성보호 및 일과 가정생활의 양립을 지원하기 위한 사항', '기타 노사협조에 관한 사항',
];

describe('check_council_rules 도구(로컬 전용)', () => {
  type Handler = (a: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
  const regs: { name: string; cfg: { title?: string; description?: string; annotations?: Record<string, boolean> }; handler: Handler }[] = [];
  registerNosa({ registerTool: (name: string, cfg: (typeof regs)[number]['cfg'], handler: Handler) => regs.push({ name, cfg, handler }), tool: () => { throw new Error('x'); } });
  const t = regs.find((x) => x.name === 'check_council_rules')!;
  const call = async (a: Record<string, unknown>) => JSON.parse((await t.handler(a)).content[0].text);

  it('로컬 전용 · 읽기 전용 주석', () => {
    expect(nosaLocalOnly).toContain('check_council_rules');
    expect(nosaRemoteSafe).not.toContain('check_council_rules');
    expect(t.cfg.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(bannedHits(`${t.cfg.title}\n${t.cfg.description}`, NOSA_WORDS)).toEqual([]);
  });
  it('표본 → 필수 5 · 권장 5 · 선택 4, 제출 서류 안내, 결과 글자에 금지어·줄표 없음', async () => {
    const r = await call({ text: SAMPLE });
    expect(r.ok).toBe(true);
    expect(r.counts).toEqual({ 필수: 5, 권장: 5, 선택: 4 });
    expect(r.submission).toMatch(/별지 제1호서식/);
    expect(r.submission).toMatch(/신·구조문대비표/);
    expect(r.submission).toMatch(/시행규칙 제3조제1항/);
    expect(bannedHits(JSON.stringify(r), NOSA_WORDS)).toEqual([]);
    expect(JSON.stringify(r)).not.toContain('—');
  });
  it('주민등록번호 모양이면 멈춘다 · 조문이 없으면 멈춘다', async () => {
    expect((await call({ text: `${SAMPLE}\n주민등록번호 : 900101-1234568` })).ok).toBe(false);
    expect((await call({ text: '협의회 규정입니다.' })).ok).toBe(false);
  });
});
