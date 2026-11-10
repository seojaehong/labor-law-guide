// 퇴사 자료 대조 — 화면 모델(계획 조각 2). core_report → 화면 글자로 바꾸는 순수 함수의 기대값을 고정한다.
// 기대값은 fixture CSV 를 손으로 센 근거를 주석으로 같이 적는다. 엔진 결과를 그대로 받아 적은 값이 아니다.
// 문장 자체(금지어·결론형 표현)는 exit-check-wording.test.ts 가 본다.

import { describe, expect, it } from 'vitest';
import { prepareFromManifest, type RunManifest } from '@/lib/exit-check/config';
import { COLUMN_SPECS } from '@/lib/exit-check/core/aliases';
import { runCore, type CoreReport } from '@/lib/exit-check/core/run';
import type { DeadlineRulesFile } from '@/lib/exit-check/core/types';
import rulesJson from '@/lib/exit-check/deadline-rules.json';
import { runScenario } from '@/lib/exit-check-demo/run';
import { DATE_VALUE_FIELDS, toExitCheckView, type ExitCheckView } from '@/lib/exit-check-view/view';
import { EXIT_CHECK_SCENARIOS } from '../fixtures/exit-check/scenarios';

const rules = rulesJson as DeadlineRulesFile;

/** fixture 를 (필요하면 CSV 줄을 고친 뒤) 사본 엔진으로 돌린다. 시험 안에서만 쓰는 입력이다 — 화면 입구는 runScenario 하나뿐. */
async function runFixture(id: string, edit?: (files: Record<string, string[]>) => void): Promise<CoreReport> {
  const sc = EXIT_CHECK_SCENARIOS.find((s) => s.id === id);
  if (!sc) throw new Error(`fixture ${id} 없음`);
  const files = structuredClone(sc.files) as Record<string, string[]>;
  edit?.(files);
  const map = new Map<string, Uint8Array>();
  for (const [p, lines] of Object.entries(files)) map.set(p, new TextEncoder().encode(lines.join('\n')));
  const manifest = sc.manifest as unknown as RunManifest;
  const prepared = await prepareFromManifest({ manifest, cutoff_at: manifest.cutoff_at!, files: map, deadline_rules: rules });
  return runCore(prepared.core).core_report;
}

/** 화면 모델 안의 글자 전부. */
export function viewStrings(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(viewStrings);
  if (v && typeof v === 'object') return Object.values(v).flatMap(viewStrings);
  return [];
}

const SCOPE = '대조하지 않은 항목: 금액(임금·퇴직금·연차수당), 퇴직 사유, 세금 신고, 이직확인서.';
const CUTOFF = '이 예시는 2026.10.20. 23:59:59(한국 시간) 기준으로 대조했습니다.';

describe('화면 모델 — 내장 표본 두 개(S01·S03)', () => {
  it('S01: 확인할 항목 0건 · 대조한 항목 14개, 범위 한정 문장이 붙은 0건 문장', async () => {
    // 손으로 센 근거(S01 CSV): 근로자 1명·고용 차수 1. 인사·퇴사 1행, 급여 정산 1행(지급일 2026-10-08), 4대보험 상실 3행(국민연금·건강보험·고용보험), 연차 대장 1행.
    // 대조 항목 = 네 자료 짝 1 + 고용 종료일 1 + 상실 신고 행(세 제도 한 항목) 1 + 기준 시각 1 + 정산 참조·귀속 기간 1 + 연차 대장 1 + 위치 기록 1 = 7
    //           + 날짜 관계(상실일 3 + 지급일 1 + 제출 시각 3) = 7  → 14.  차이 0, 빠진 자료 0, 막힌 자료 0.
    const r = await runScenario('S01');
    const v = toExitCheckView(r.core_report);
    expect(v.counts).toEqual({ confirm: 0, checkItems: 0, notCompared: 0, compared: 14, unusableFiles: 0, excluded: 0 });
    expect(v.summary).toBe('확인할 항목 0건 · 대조한 항목 14개');
    expect(v.zeroNote).toBe(`대조한 14개 항목에서 차이가 발견되지 않았습니다. ${SCOPE}`);
    expect(v.scopeNote).toBe(SCOPE);
    expect(v.cutoffNote).toBe(CUTOFF);
    expect(v.checkItems).toEqual([]);
    expect(v.notComparedItems).toEqual([]);
    expect(v.comparedItems).toHaveLength(14);
    expect(new Set(v.comparedItems).size).toBe(14);
    expect(v.comparedItems).toContain('국민연금·건강보험·고용보험 상실 신고 행');
  }, 60_000);

  it('S03: 확인할 항목 1건 · 대조한 항목 12개, 국민연금 문장, 근거 위치는 「인사·퇴사 자료 2행」', async () => {
    // 손으로 센 근거(S03 CSV): S01 과 같은 꼴에서 4대보험 상실 자료의 국민연금 행이 없다(건강보험·고용보험 2행).
    // 대조 항목 = 7(위와 같음, 상실 신고 행은 건강보험·고용보험 한 항목) + 날짜 관계(상실일 2 + 지급일 1 + 제출 시각 2) = 5 → 12.
    // 확인할 항목 = 국민연금 행 없음 1. 행이 없으니 근거는 기준 행(인사·퇴사 자료 2행)뿐이다.
    const r = await runScenario('S03');
    const v = toExitCheckView(r.core_report);
    expect(v.counts).toEqual({ confirm: 1, checkItems: 1, notCompared: 0, compared: 12, unusableFiles: 0, excluded: 0 });
    expect(v.summary).toBe('확인할 항목 1건 · 대조한 항목 12개');
    expect(v.zeroNote).toBeNull();
    expect(v.scopeNote).toBe(SCOPE);
    expect(v.checkItems).toEqual([{ status: '자료 확인', text: '4대보험 상실 자료에 국민연금 행이 없습니다.', places: ['인사·퇴사 자료 2행'] }]);
  }, 60_000);
});

describe('화면 모델 — 시험 fixture', () => {
  it('S12: 확인할 항목 4건(값 확인 2 + 대조하지 못한 항목 2, 따로 적는다) · 대조에 쓰지 못한 자료 1개 · 대조한 항목 11개', async () => {
    // 손으로 센 근거(S12 CSV): 급여 정산 자료 머리글에 고용 차수 열이 없다 → 그 자료 전체를 대조에 쓰지 못함(1개).
    //   그 결과 ① 고용 차수 칸 없음(대조하지 못함) ② 급여 정산 대조 못함(대조하지 못함).
    //   연차 대장 2행의 고용 차수 칸이 비었다 → ③ 빈 칸(확인) ④ 같은 근로자·차수의 연차 행을 못 찾음(확인).
    // 대조 항목 = 짝(인사·상실 두 자료) 1 + 고용 종료일 1 + 상실 신고 행 1 + 기준 시각 1 + 위치 기록 1 + 날짜 관계(상실일 3 + 제출 시각 3) = 11.
    //   (급여 정산·연차 대장 항목과 지급일 날짜 관계는 자료를 못 써서 대조 항목에 없다.)
    // 대조하지 못한 항목은 0건으로 세지 않고 notComparedItems 로 따로 적는다(개발게이트 G2: 비교 근거 없음 ≠ 어긋남 없음).
    const v = toExitCheckView(await runFixture('S12'));
    expect(v.counts).toEqual({ confirm: 4, checkItems: 2, notCompared: 2, compared: 11, unusableFiles: 1, excluded: 0 });
    expect(v.summary).toBe('확인할 항목 4건 · 대조한 항목 11개 · 대조에 쓰지 못한 자료 1개');
    expect(v.zeroNote).toBeNull();
    expect(v.checkItems).toEqual([
      { status: '자료 확인', text: '연차 대장 자료의 고용 차수 칸이 비어 있습니다.', places: ['연차 대장 자료 2행 C열'] },
      { status: '자료 확인', text: '연차 대장 자료에서 같은 근로자·고용 차수의 행을 찾지 못했습니다.', places: ['인사·퇴사 자료 2행'] },
    ]);
    expect(v.notComparedItems).toEqual([
      { status: '자료 없음', text: '급여 정산 자료에 고용 차수 칸이 없어 다른 자료와 맞춰 보지 못했습니다.', places: ['급여 정산 자료 1행'] },
      {
        status: '자료 없음',
        text: '급여 정산 자료를 대조에 쓰지 못해 그 자료가 필요한 대조는 하지 않았습니다.',
        places: ['급여 정산 자료', '인사·퇴사 자료 2행'],
      },
    ]);
    expect(v.unusableFiles).toEqual([
      {
        status: '대조에 쓰지 못한 자료',
        text: '급여 정산 자료에 맞춰 보는 데 꼭 필요한 칸(고용 차수)이 없어 이 자료를 대조에 쓰지 못했습니다.',
        places: [],
      },
    ]);
  }, 60_000);

  it('S12 처럼 막힌 자료가 있으면 확인할 항목이 0건이어도 0건 문장을 내지 않는다(run_state 가 아니라 화면 묶음으로 판단)', async () => {
    const r = await runFixture('S12');
    const only = { ...r, findings: r.findings.filter((f) => f.rule_id === 'SCHEMA') } as CoreReport;
    const v = toExitCheckView(only);
    expect(v.counts.confirm).toBe(0);
    expect(v.counts.unusableFiles).toBe(1);
    expect(v.zeroNote).toBeNull();
  }, 60_000);

  it('근거 위치는 「급여 정산 자료 2행 F열」 꼴이고, 날짜 칸이면 값이 「2026.10.5.」 꼴로 붙는다(S10)', async () => {
    // S10 급여 정산 자료: 지급일(F열)이 2행 2026-10-05, 3행 2026-10-10 두 개이고 지급 회차 열이 없다.
    const v = toExitCheckView(await runFixture('S10'));
    expect(v.checkItems).toEqual([
      {
        status: '자료 확인',
        text: '지급일이 여러 개인데 지급 회차 칸이 없습니다.',
        places: ['급여 정산 자료 2행 F열(2026.10.5.)', '급여 정산 자료 3행 F열(2026.10.10.)'],
      },
    ]);
  }, 60_000);

  it('시각 칸 값은 한국 시간으로 바꿔 적는다(S04: 01:00Z → 10:00, 00:00Z → 09:00)', async () => {
    const v = toExitCheckView(await runFixture('S04'));
    const stale = v.checkItems.find((i) => i.status === '기준 시점 확인');
    expect(stale?.places).toEqual([
      '4대보험 상실 자료 2행 I열(2026.10.14. 10:00)',
      '4대보험 상실 자료 3행 I열(2026.10.14. 10:00)',
      '4대보험 상실 자료 4행 I열(2026.10.14. 10:00)',
      '인사·퇴사 자료 3행 G열(2026.10.16. 09:00)',
    ]);
  }, 60_000);

  it('대조에서 빼기로 한 기록(S17)은 확인할 항목에 세지 않고 따로 적는다', async () => {
    const v = toExitCheckView(await runFixture('S17'));
    expect(v.counts.excluded).toBe(1);
    expect(v.counts.confirm).toBe(0);
    expect(v.excluded.map((i) => i.text)).toEqual(['건강보험 항목은 대조에서 빼기로 한 기록이 있어 대조하지 않았습니다.']);
    expect(v.summary).toContain('대조에서 뺀 항목 1건');
  }, 60_000);

  it('「두 자료의 ○○ 값이 다릅니다」는 근거가 두 파일 이상일 때만 쓰고, 한 파일 안의 차이(S05)는 「○○ 안에서 … 행마다 다릅니다」로 쓴다', async () => {
    // S05 인사·퇴사 자료 한 파일의 2행(2026-09-30)·3행(2026-10-15) 고용 종료일이 다르다 — 「두 자료」가 아니다.
    const r = await runFixture('S05');
    const v = toExitCheckView(r);
    const one = v.checkItems.find((i) => i.status === '자료 사이 차이');
    expect(one?.text).toBe('인사·퇴사 자료 안에서 고용 종료일 값이 행마다 다릅니다.');
    expect(one?.places).toEqual(['인사·퇴사 자료 2행 D열(2026.9.30.)', '인사·퇴사 자료 3행 D열(2026.10.15.)']);
    // 같은 결과에서 둘째 근거를 다른 파일(4대보험 상실 자료)로 바꾸면 법률검증 2차 꼴 「두 자료의 ○○이 다릅니다」가 된다.
    const f = r.findings.find((x) => x.reason_code === 'SAME_CONCEPT_VALUES_DIFFER')!;
    const ev = f.evidence.map((e, i) => (i === 1 ? { ...e, file_group: 'insurance_loss' as const, file_sha256: 'sha256:other' } : e));
    const two = toExitCheckView({ ...r, findings: [{ ...f, evidence: ev }] } as CoreReport);
    expect(two.checkItems[0]!.text).toBe('두 자료의 고용 종료일 값이 다릅니다.');
  }, 60_000);

  it('날짜 관계를 셈하지 못한 표시(deadline_candidates_not_computed)는 대조한 항목에서 빼고 대조하지 못한 항목으로 적는다(S05)', async () => {
    const r = await runFixture('S05');
    const notComputed = r.compared_items.filter((c) => c.item.startsWith('deadline_candidates_not_computed:'));
    expect(notComputed.length).toBeGreaterThan(0);
    const v = toExitCheckView(r);
    expect(v.counts.compared).toBe(r.compared_items.length - notComputed.length);
    expect(v.notComparedItems.map((i) => i.text)).toContain('자료마다 고용 종료일이 달라 고용 종료일과 다른 날짜의 관계는 대조하지 않았습니다.');
    expect(v.notComparedItems.find((i) => i.text.startsWith('자료마다 고용 종료일'))?.status).toBe('대조하지 않음');
  }, 60_000);
});

describe('화면 모델 — 값은 날짜·시각 칸만, 머리글·자유 글은 싣지 않는다', () => {
  it('날짜 값 허용목록 = 사본 COLUMN_SPECS 의 date·instant 칸 전부(그 밖의 칸 값은 기본 거부)', () => {
    const fromSpecs = new Set<string>();
    for (const specs of Object.values(COLUMN_SPECS)) for (const s of specs) if (s.type === 'date' || s.type === 'instant') fromSpecs.add(s.name);
    expect([...DATE_VALUE_FIELDS].sort()).toEqual([...fromSpecs].sort());
  });

  it('대조에 쓰지 않은 열: 시험 표(머리글 「성명」 + 가짜 이름, 「가나다」 + 가짜 값)를 사본에 넣어도 화면에는 「H열(이름·연락처 열)」 꼴만 나온다', async () => {
    const report = await runFixture('S01', (files) => {
      const p = files['personnel_exit.csv']!;
      p[0] = `${p[0]},성명,가나다`;
      p[1] = `${p[1]},홍길순,라마바사`;
    });
    // 먼저 원 결과에 머리글 글자가 실려 있는지 본다 — 없으면 이 시험은 아무것도 증명하지 않는다.
    const raw = JSON.stringify(report);
    expect(raw).toContain('성명');
    expect(raw).toContain('가나다');
    const v = toExitCheckView(report);
    expect(v.unusedColumns).toEqual([
      '인사·퇴사 자료 — 대조에 쓰지 않은 열: H열(이름·연락처 열), I열(대응하는 기준 칸이 없는 열). 이 열의 값은 대조에 쓰지 않았고 화면에도 싣지 않았습니다.',
    ]);
    const all = viewStrings(v).join('\n');
    for (const w of ['성명', '가나다', '홍길순', '라마바사']) expect(all, w).not.toContain(w);
  }, 60_000);

  it('자유 글 칸(정산 참조 번호)의 값은 원 결과에 실려도 화면에는 싣지 않는다', async () => {
    // S01 급여 정산 자료의 머리글 「settlement_reference」를 「문서번호」(자동 대응 별칭)로 바꾸고, 같은 근로자의 고용 차수 2 행을 더해
    // 두 행에 같은 자유 글을 적는다 → 사본이 「같은 정산 참조가 여러 고용 차수에 붙음」을 내면서 그 글을 근거 값으로 싣는다.
    const memo = '가나다라 구월 정산메모';
    const report = await runFixture('S01', (files) => {
      const p = files['final_payroll_settlement.csv']!;
      p[0] = p[0]!.replace('settlement_reference', '문서번호');
      p[1] = p[1]!.replace('SET-S01-W-01-1', memo);
      const second = p[1]!.replace('C-A,W-01,1,', 'C-A,W-01,2,');
      p.splice(2, 0, second);
    });
    const raw = JSON.stringify(report);
    expect(raw).toContain(memo);
    expect(report.findings.some((f) => f.reason_code === 'SETTLEMENT_REFERENCE_ON_SEVERAL_SEQUENCES')).toBe(true);
    const v = toExitCheckView(report);
    const item = v.checkItems.find((i) => i.text === '같은 정산 참조 번호가 여러 고용 차수에 붙어 있습니다.');
    expect(item).toBeDefined();
    // 근거 순서는 엔진이 정렬한다. 자유 글 칸(H열)은 위치만 나오고 값은 붙지 않는다.
    expect(item!.places).toEqual(expect.arrayContaining(['급여 정산 자료 2행 H열', '급여 정산 자료 3행']));
    const all = viewStrings(v).join('\n');
    for (const w of ['가나다라', '정산메모', '구월', '문서번호']) expect(all, w).not.toContain(w);
  }, 60_000);

  it('칸 이름이 날짜 칸이 아니면 날짜 모양 값도 싣지 않고, 날짜 칸이어도 날짜 모양이 아니면 싣지 않는다', async () => {
    const base = await runScenario('S03');
    const f0 = base.core_report.findings[0]!;
    const crafted = {
      ...base.core_report,
      findings: [
        {
          ...f0,
          evidence: [
            { ...f0.evidence[0]!, role: 'observed', field: 'settlement_reference', normalized: '2026-01-02', locator: { ...f0.evidence[0]!.locator!, column: 'H', cell: 'H2' } },
            { ...f0.evidence[0]!, role: 'observed', field: 'payment_date', normalized: '가나다', locator: { ...f0.evidence[0]!.locator!, column: 'F', cell: 'F2' } },
            { ...f0.evidence[0]!, role: 'observed', field: 'source_as_of', normalized: '2026-10-14T01:00:00.000Z', locator: { ...f0.evidence[0]!.locator!, column: 'G', cell: 'G2' } },
          ],
        },
      ],
    } as CoreReport;
    const v = toExitCheckView(crafted);
    expect(v.checkItems[0]!.places).toEqual(['인사·퇴사 자료 2행 H열', '인사·퇴사 자료 2행 F열', '인사·퇴사 자료 2행 G열(2026.10.14. 10:00)']);
    expect(viewStrings(v).join('\n')).not.toContain('2026.1.2.');
  }, 60_000);

  it('details 는 읽지 않는다(S13: 날짜 후보·조문을 심어 두어도 화면에 없다)', async () => {
    const r = await runFixture('S13');
    const sentinel = { candidates: [{ citation: '근로기준법 제36조', candidate_dates: ['1999-01-02', '1999-01-03'] }], memo: '심어둔표시' };
    const planted = { ...r, findings: r.findings.map((f) => ({ ...f, details: sentinel })) } as CoreReport;
    expect(JSON.stringify(planted)).toContain('1999-01-02');
    const all = viewStrings(toExitCheckView(planted)).join('\n');
    for (const w of ['1999', '제36조', '근로기준법', '심어둔표시']) expect(all, w).not.toContain(w);
    // 원래 S13 의 후보 날짜(지급일 2026-10-14 를 뺀 10-12·10-13·10-15)도 화면에 없다.
    const plain = viewStrings(toExitCheckView(r)).join('\n');
    for (const d of ['2026.10.12.', '2026.10.13.', '2026.10.15.']) expect(plain, d).not.toContain(d);
  }, 60_000);
});

describe('화면 모델 — 모르는 값', () => {
  it('모르는 상태·사유·칸 이름·대조 항목·열 종류·막힘 사유는 일반 문장이 되고, 원래 코드 글자는 어디에도 없다', async () => {
    const base = await runScenario('S03');
    const rep = base.core_report;
    const f0 = rep.findings[0]!;
    const crafted = {
      ...rep,
      findings: [
        { ...f0, status: 'WEIRD_STATUS', reason_code: 'WEIRD_REASON', field: 'weird_field' },
        { ...f0, status: 'INCOMPLETE', reason_code: 'WEIRD_REASON_TWO', field: 'weird_group.weird_col:WEIRD_SCHEME' },
      ],
      compared_items: [...rep.compared_items, { rule_id: 'R-099', key: 'C-A|W-03|1', item: 'weird_item:WEIRD_PARAM' }],
      file_gate_results: [
        ...rep.file_gate_results,
        {
          ...rep.file_gate_results[0]!,
          status: 'SCHEMA_BLOCKED',
          reason_code: 'WEIRD_GATE',
          file_group: 'weird_group',
          ignored_columns: [{ source_column: 'K', source_header: '머리글원문', kind: 'weird_kind' }],
        },
      ],
    } as unknown as CoreReport;
    const v: ExitCheckView = toExitCheckView(crafted);
    const all = viewStrings(v).join('\n');
    expect(all).not.toMatch(/weird/i);
    expect(all).not.toContain('머리글원문');
    expect(v.counts.checkItems).toBe(2); // 모르는 상태도 확인할 항목으로 센다(빼 먹지 않는다)
    expect(v.counts.unusableFiles).toBe(1);
    expect(v.checkItems[0]!.status).toBe('확인 필요');
    expect(v.checkItems[0]!.text).toBe('자료의 한 항목 — 확인이 필요한 항목입니다.');
    expect(v.unusableFiles[0]!.text).toBe('자료를 대조에 쓰지 못했습니다.');
    expect(v.comparedItems).toContain('그 밖의 대조 항목');
    expect(v.unusedColumns[0]).toContain('K열(대조에 쓰지 않은 열)');
  }, 60_000);
});
