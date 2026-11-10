// 노사협의회 서류 모델(FormDoc) — work-rules-report/render.ts 가 PDF·한글로 그린다(두 파일이 같은 모델에서 나온다).
// 출발점은 노사협의회신고 스킬 build_new_docs.py(261110)의 13개 문서이고, 14번 「노동포털 제출 입력값」(SN012 화면 실측 261110)을 더했다.
// 바꾼 것:
//   - 「…판정서」 → 「…확인서」(assess.ts DOC_NAMES 한 곳). 「판정 근거」 → 「기준별 근거」. 근거 두 줄의 글자는 그대로다.
//   - 고충처리 운영지침의 「임금 체불」 → 「임금 미지급」, 겸임 확인서 빈 칸 안내의 「포괄 위임」 → 「묶어 맡기는 문구」(공개 문구 금지어)
//   - 마크다운(**·>·|)은 글자로 남기지 않고 서식 블록으로 옮겼다. ☐ 는 나눔고딕에 없어 □ 로 쓴다.
//   - 01 에 상시 근로자 수 산정 기준(파견근로자 제외, 매뉴얼 26쪽), 05 에 선거인 범위(매뉴얼 45·51쪽)를 실었다(교차 확인 B8·B4).
//   - 03 제7조③ 무투표 당선 불인정·찬반투표(B5), 제9조⑤⑥ 겸임 주지 반복·간접선거 1단계 공고(근로기준정책과-221·-1140)를 더했다.
// 서명·날인 칸은 비워 둔다. 근로자 이름은 받지도 넣지도 않는다(선거관리위원·후보·당선자·위원 이름 칸은 빈 칸).
import type { FormBlock, FormCell, FormDoc } from '@/lib/work-rules-report/render';
import { dateKo } from '@/lib/work-rules-report/forms';
import {
  assess, BOUNDARY_NOTICE, DOC_NAMES, ELECTOR_SCOPE, electionCheck, electionErrors, isoDate, addDays, MINUTES_REQUIRED, REGULATION_REQUIRED,
  REP_BASIS_ADMIN, REP_BASIS_SUPPORT, REPORT_DAYS, type Assessment, type ElectionCheck, type ElectionInput, type QuorumStage,
} from './assess';

export interface NosaFormInput {
  workplace: { name?: string; ownerName?: string; bizNo?: string; address?: string; tel?: string };
  headcount: number;
  majorityUnion: boolean;
  indirectReason?: string;
  workerMembers?: number;
  employerMembers?: number;
  grievanceMembers?: number;
  concurrentRep?: boolean;
  concurrentScope?: string[];
  electronicVoting?: boolean;
  /** 설치단위 */
  unit?: '사업' | '사업장';
  /** 협의회 설치일 = 제1차 회의에서 협의회규정을 의결한 날 */
  installDate?: string;
  /** 협의회규정 제정·변경일(비우면 제정은 설치일) */
  regulationDate?: string;
  regulationKind?: '제정' | '변경';
  electionDate?: string;
  termStart?: string;
  rosterDate?: string;
  /** 선거인 총수 */
  electors?: number;
  election?: ElectionInput;
  council?: { name?: string; tel?: string; address?: string; unitBizNo?: string; unitOwnerName?: string; unitHeadcount?: number; regularMeetings?: string };
  /** 관할 지방고용노동관서 */
  office?: string;
  writtenDate: string;
}

export const DATE_FIELDS = ['installDate', 'regulationDate', 'electionDate', 'termStart', 'rosterDate', 'writtenDate'] as const;

const blank = (s: string | undefined) => !(s ?? '').trim();
const digits = (s: string | undefined) => String(s ?? '').replace(/\D/g, '');
const bizNoText = (s: string | undefined) => {
  const d = digits(s);
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : (s ?? '').trim();
};
const ko = (s: string | undefined, none = '') => {
  const d = isoDate(s);
  return d ? dateKo(d) : none;
};

/** 비어 있으면 서류를 만들지 않는 칸 */
export function nosaBlanks(input: NosaFormInput): string[] {
  return blank(input.workplace?.name) ? ['사업장명'] : [];
}

const isIndirect = (input: NosaFormInput) => !input.majorityUnion && (!!(input.indirectReason ?? '').trim() || input.election?.delegateElectors != null);

/** 형식·앞뒤가 맞지 않는 칸 */
export function nosaErrors(input: NosaFormInput): string[] {
  const out: string[] = [];
  if (!Number.isInteger(input.headcount) || input.headcount < 0) out.push('상시 근로자 수(headcount)는 0 이상의 정수입니다.');
  for (const k of DATE_FIELDS) {
    const v = input[k];
    if (!blank(v) && !isoDate(v)) out.push(`${k} 는 YYYY-MM-DD 날짜입니다(받은 값: ${v}).`);
  }
  const w = input.workplace ?? {};
  if (!blank(w.bizNo) && digits(w.bizNo).length !== 10) out.push('사업자등록번호는 숫자 10자리입니다.');
  if (!blank(input.council?.unitBizNo) && digits(input.council?.unitBizNo).length !== 10) out.push('해당사업장 사업자등록번호는 숫자 10자리입니다.');
  if (input.election) out.push(...electionErrors(input.election, isIndirect(input)));
  return out;
}

// ── 공용 ──────────────────────────────────────────────

interface Ctx {
  a: Assessment;
  el?: ElectionCheck;
  name: string;
  written: string;
}

function ctx(input: NosaFormInput): Ctx {
  const written = isoDate(input.writtenDate) ?? input.writtenDate;
  const a = assess(
    {
      workplaceName: input.workplace?.name, headcount: input.headcount, majorityUnion: input.majorityUnion, indirectReason: input.indirectReason,
      workerMembers: input.workerMembers, employerMembers: input.employerMembers, grievanceMembers: input.grievanceMembers,
      concurrentRep: input.concurrentRep, concurrentScope: input.concurrentScope, installDate: isoDate(input.installDate) ?? undefined,
    },
    written,
  );
  const indirect = isIndirect(input);
  const el = input.election && !electionErrors(input.election, indirect).length
    ? electionCheck(input.election, { indirect, concurrentRep: !!input.concurrentRep, seats: a.members.worker })
    : undefined;
  return { a, el, name: (input.workplace?.name ?? '').trim() || '(확인 필요)', written };
}

const h = (text: string, span = 1): FormCell => ({ text, head: true, span });
const v = (text: string, span = 1, align?: FormCell['align']): FormCell => ({ text, span, align });
const H = (text: string): FormBlock => ({ kind: 'text', text, size: 'large', gapAfter: 4 });
const P = (text: string, gapAfter = 6): FormBlock => ({ kind: 'text', text, gapAfter });
const RIGHT = (text: string): FormBlock => ({ kind: 'text', text, align: 'right', gapAfter: 6 });
const NOTE = (text: string): FormBlock => ({ kind: 'text', text: `※ ${text}`, size: 'small', gapAfter: 6 });
const LIST = (items: readonly string[]): FormBlock => ({ kind: 'text', text: items.map((x) => `- ${x}`).join('\n'), gapAfter: 6 });
const SPACE = (pt = 6): FormBlock => ({ kind: 'space', pt });
const GRID = (head: string[], rows: string[][], widths: number[]): FormBlock => ({
  kind: 'table', widths, headerRows: 1, size: 'small', minRowHeight: 20, rows: [head.map((x) => h(x)), ...rows.map((r) => r.map((x) => v(x)))],
});
const KV = (rows: [string, string][], widths = [30, 70]): FormBlock => ({ kind: 'table', widths, minRowHeight: 22, rows: rows.map(([k, x]) => [h(k), v(x)]) });
const SIGN = (who: string) => P(`${who} (서명) __________`);

function head(title: string, c: Ctx): FormBlock[] {
  return [{ kind: 'title', text: title }, { kind: 'text', text: `사업장  ${c.name}      작성일  ${dateKo(c.written)}`, size: 'small', gapAfter: 8 }];
}
const BANNER: FormBlock[] = [SPACE(10), { kind: 'text', text: BOUNDARY_NOTICE.join('\n'), size: 'small' }];

const pct = (s: QuorumStage) => `${s.turnout.toFixed(2)}%`;

/** 근로자대표 겸임 기준별 근거 — 05·07 이 같은 두 줄을 싣는다(글자 그대로) */
const REP_BASIS: FormBlock[] = [
  { kind: 'text', text: '기준별 근거', gapAfter: 2 },
  LIST([`① 권한 부여 사실 주지 + 근로자 과반수 참여: ${REP_BASIS_ADMIN}`, `② 근로자 과반수 지지: ${REP_BASIS_SUPPORT}`]),
];

// ── 01 설치의무 확인서 ───────────────────────────────────

export function installDoc(input: NosaFormInput): FormDoc {
  const c = ctx(input);
  const s = c.a.installation;
  const e = c.a.selection;
  return {
    title: DOC_NAMES.install,
    blocks: [
      ...head(DOC_NAMES.install, c),
      H('1. 확인 결과'),
      KV([['상시 근로자 수', `${s.headcount}명 (사업 전체 기준)`], ['법정 기준', `상시 ${s.threshold}명 이상`], ['결과', s.result], ['근거', s.basis], ['설치 단위', input.unit ?? '사업']]),
      NOTE(s.unitBasis),
      H('2. 상시 근로자 수 산정'),
      P('산정 기준일과 산정 방법을 아래에 기재한다. 추정치를 쓰지 않는다.'),
      GRID(['구분', '인원', '비고'], [['정규직', '', ''], ['기간제', '', ''], ['단시간', '', ''], ['일용', '', ''], ['해외 파견', '', ''], ['파견근로자(사용사업주 쪽)', '', '넣지 않는다'], ['합계', '', '']], [36, 18, 46]),
      NOTE(s.countNote),
      H('3. 후속 조치'),
      LIST(
        s.required
          ? [
              `근로자위원 선출 (${e.method}, ${e.basis})`,
              '협의회규정 제정 후 협의회 설치일부터 15일 이내 관할 관서 제출 (법 제18조제1항)',
              '미제출 시 200만원 이하 과태료 (법 제33조제1항)',
              '고충처리위원 선임 (법 제26조)',
            ]
          : ['법정 설치의무 없음. 임의 설치 여부를 사업장이 결정한다', '임의 설치 시에도 설치하였다면 법이 정한 운영·신고 의무가 적용되는지 확인 필요'],
      ),
      ...BANNER,
    ],
  };
}

// ── 02 선출방식 확인서 ───────────────────────────────────

export function methodDoc(input: NosaFormInput): FormDoc {
  const c = ctx(input);
  const e = c.a.selection;
  const rows: [string, string][] = [['과반수 노동조합', input.majorityUnion ? '있음' : '없음'], ['선출 방식', e.method], ['근거', e.basis]];
  if (e.indirectReason) rows.push(['부득이한 사유', e.indirectReason]);
  const quorum =
    e.method === '직접선거'
      ? ['근로자 과반수가 참여한 직접·비밀·무기명 투표', '과반수는 참여율(투표율) 요건이다. 찬성률이 아니다']
      : e.method === '간접선거'
        ? ['1단계: 근로자 과반수 참여로 위원선거인 선출', '2단계: 위원선거인 과반수 참여로 근로자위원 선출', '두 단계를 각각 충족해야 한다']
        : ['선거를 실시하지 않는다. 노동조합 대표자 + 노동조합이 위촉하는 자', '노동조합의 과반수 조직 사실을 증빙으로 남긴다(조합원 명부 대조 등)'];
  return {
    title: DOC_NAMES.method,
    blocks: [
      ...head(DOC_NAMES.method, c),
      H('1. 확인'),
      KV(rows),
      SPACE(),
      P(e.explanation),
      ...(e.caution ? [NOTE(e.caution)] : []),
      H('2. 산출 문서'),
      LIST(e.documents),
      H('3. 정족수 요건'),
      LIST(quorum),
      ...BANNER,
    ],
  };
}

// ── 03 선거관리규정 ──────────────────────────────────────

const ART = (text: string): FormBlock => ({ kind: 'text', text, size: 'large', gapAfter: 2 });

export function electionRulesDoc(input: NosaFormInput): FormDoc {
  const c = ctx(input);
  const title = '노사협의회 근로자위원 선거관리규정';
  const blocks: FormBlock[] = [
    ...head(title, c),
    ART('제1조(목적)'),
    P('이 규정은 노사협의회 근로자위원 선출에 관한 사항을 정함을 목적으로 한다.'),
    ART('제2조(선거관리위원회)'),
    P('① 근로자위원 선출을 관리하기 위하여 선거관리위원회(이하 "선관위"라 한다)를 둔다.\n② 선관위는 선거 공고일 14일 전까지 구성한다.\n③ 선관위 위원: (선임 후 기재)\n④ 사용자는 선관위의 구성과 운영에 개입하거나 방해할 수 없다(법 제10조제1항).'),
    ART('제3조(선거인)'),
    P('① 선거일 현재 재직 중인 근로자를 선거인으로 한다.\n② 선거인명부는 선거일 5일 전까지 확정하고, 확정 이후에는 변경하지 않는다.\n③ 선거인명부에 주민등록번호를 수집하지 않는다. 성명·사번·소속으로 특정한다.'),
    ART('제4조(입후보)'),
    P('① 선거인은 누구든지 입후보할 수 있다.\n② 입후보 신청서에 주민등록번호를 기재하지 않는다.'),
    ART('제5조(투표)'),
    P('① 투표는 직접·비밀·무기명으로 한다(법 제6조제2항).\n② 1인 1표로 하며, 중복투표를 방지하는 조치를 둔다.'),
  ];
  if (input.electronicVoting) {
    blocks.push(
      P(
        '③ 전자적 방법에 의한 투표를 실시하는 경우 다음을 준수한다.\n' +
          '   1. 본인인증 절차를 거칠 것\n' +
          '   2. 인증 데이터와 투표 데이터를 분리 저장하여 표심이 특정되지 않게 할 것\n' +
          '   3. 중복투표를 시스템적으로 차단할 것\n' +
          '   4. 사용자측은 투표 현황·득표 상황을 열람할 수 없도록 접근권한을 분리할 것\n' +
          '   5. 투표기록의 보존기간을 정할 것',
      ),
    );
  }
  blocks.push(
    ART('제6조(투표 현황의 열람)'),
    P(
      '① 투표율(참여 여부) 현황은 선관위와 근로자측 참관인만 열람한다.\n② 사용자측의 실시간 열람을 허용하지 않는다.\n' +
        '③ 득표(찬반) 상황은 개표 전까지 누구에게도 공개하지 않는다.\n④ 사용자측은 투표 참여를 일반적으로 독려할 수 있으나, 미투표자를 개별적으로 접촉·설득할 수 없다.',
    ),
    ART('제7조(개표 및 당선)'),
    P(
      '① 개표는 선관위와 참관인 입회 하에 실시한다.\n② 다수 득표자를 당선자로 하되, 동수인 경우 연장자를 당선자로 한다.\n' +
        '③ 후보자 수가 뽑을 인원 이하여도 투표를 실시하며, 이 경우 후보자별 찬반투표로 한다(무투표 당선은 인정하지 않는다).\n' +
        '④ 부서 인원이 10명 미만인 단위의 투표 결과를 분리하여 공개하지 않는다. 소규모 단위의 표심이 특정되는 것을 막기 위함이다.',
    ),
    ART('제8조(정족수)'),
    P(`① 근로자 과반수가 참여하지 않은 투표는 무효로 하고 재투표를 실시한다.\n② 정족수 충족 여부는 ${DOC_NAMES.quorumShort}로 기록한다.`),
  );
  if (input.concurrentRep) {
    const scope = (input.concurrentScope ?? []).map((s) => s.trim()).filter(Boolean);
    blocks.push(
      ART('제9조(근로자대표 겸임)'),
      P('① 이 선거로 선출되는 근로자위원은 그 임기 동안 근로기준법상 근로자대표의 권한을 겸하여 행사한다.\n② 제1항의 권한 범위는 다음과 같다.', 2),
      P((scope.length ? scope : ['(권한 범위를 반드시 열거할 것)']).map((x) => `   - ${x}`).join('\n')),
      P(
        '③ 제1항의 사실은 선거 공고문과 투표용지에 각각 명시하여 선거인에게 주지한다.\n④ 근로자대표 겸임의 성립 여부는 근로자위원 정족수와 별도로 확인한다.\n' +
          '⑤ 제3항의 주지는 선거를 할 때마다 다시 한다(근로기준정책과-221).' +
          (isIndirect(input) ? '\n⑥ 위원선거인을 거쳐 선출하는 경우 위원선거인 선거 공고부터 제1항의 사실을 명시한다(근로기준정책과-1140).' : ''),
      ),
    );
  }
  return { title, blocks: [...blocks, ...BANNER] };
}

// ── 04 선거인명부 ────────────────────────────────────────

export function rosterDoc(input: NosaFormInput): FormDoc {
  const c = ctx(input);
  const title = '근로자위원 선거인명부';
  const at = ko(input.rosterDate, '(기재)');
  return {
    title,
    blocks: [
      ...head(title, c),
      P(`확정 기준일  ${at}\n선거인 총수  ${input.electors != null ? `${input.electors}명` : '(기재)'}`),
      NOTE('주민등록번호를 수집하지 않는다. 선거 목적의 수집 근거가 없다.'),
      GRID(['연번', '성명', '사번', '소속', '재직 여부', '비고'], Array.from({ length: 10 }, (_, i) => [String(i + 1), '', '', '', '', '']), [8, 20, 16, 24, 14, 18]),
      P('(행은 인원수에 맞게 늘린다)'),
      H('확정 확인'),
      P(`위 명부는 ${at} 기준으로 확정되었으며, 확정 이후 변경하지 않았음을 확인한다.`),
      SIGN('선거관리위원회 위원장'),
      ...BANNER,
    ],
  };
}

// ── 05 정족수 확인서 ─────────────────────────────────────

const yn = (x: boolean | null) => (x == null ? '지지자 수 미입력' : x ? '충족' : '미충족');

export function quorumDoc(input: NosaFormInput): FormDoc {
  const c = ctx(input);
  const blocks: FormBlock[] = [...head(DOC_NAMES.quorum, c), H('1. 근참법상 근로자위원')];
  const el = c.el;
  if (el && el.kind !== '직접선거') {
    blocks.push(
      P(el.kind === '간접선거' ? '간접선거 (법 제6조제2항 단서) — 두 단계를 각각 확인' : '선거구별 — 선거구마다 근로자 과반수 참여를 확인(매뉴얼 44쪽)'),
      GRID(['단계', '모수', '투표자', '필요', '투표율', '결과'], el.workerMembers.stages.map((s) => [s.stage, String(s.electors), String(s.voters), String(s.needed), pct(s), s.result]), [24, 10, 10, 10, 12, 34]),
      P(`종합 결과: ${el.workerMembers.result}`),
      NOTE('과반수는 참여(투표율) 요건이다.'),
    );
  } else if (el) {
    const s = el.workerMembers.stages[0];
    blocks.push(
      KV([['선거인 수', `${s.electors}명`], ['투표자 수', `${s.voters}명`], ['필요 투표자 수(과반수)', `${s.needed}명`], ['투표율', pct(s)], ['결과', s.result], ['근거', s.basis]]),
      NOTE(s.caution),
    );
  } else {
    blocks.push(
      KV([['선거인 수', ''], ['투표자 수', ''], ['필요 투표자 수(과반수)', ''], ['투표율', ''], ['결과', '']]),
      NOTE('근거: 근참법 제6조제2항. 과반수는 참여(투표율) 요건이며 찬성률이 아니다.'),
    );
  }
  blocks.push(NOTE(`선거인 범위: ${ELECTOR_SCOPE}`), H('2. 득표 결과'));
  if (el?.ballot) blocks.push(P(`투표 방식: ${el.ballot.method} (후보 ${el.ballot.candidates}명 / 정원 ${el.ballot.seats}명)${el.ballot.warning ? ` — ${el.ballot.warning}` : ''}`));
  blocks.push(GRID(['후보자', '소속', '득표수', '당선 여부'], [['', '', '', '']], [30, 30, 20, 20]), NOTE('부서 인원 10명 미만 단위의 결과는 분리 공개하지 않는다.'));
  if (input.concurrentRep) {
    blocks.push(H('3. 근기법상 근로자대표 겸임'));
    const d = el?.workerRep;
    if (d) {
      const ad = d.adminInterpretation;
      const su = d.majoritySupport;
      blocks.push(
        GRID(
          ['기준', '내용', '결과'],
          [
            ['권한 부여 사실 주지 + 근로자 과반수 참여', `주지 ${ad.notified ? '함' : '안 함'} · 과반수 참여 ${ad.majorityTurnout ? '충족' : '미달'}`, yn(ad.met)],
            ['근로자 과반수 지지', `지지 ${su.supporters == null ? '-' : su.supporters}명 / 필요 ${su.needed}명`, yn(su.met)],
          ],
          [40, 40, 20],
        ),
        NOTE('두 기준을 모두 충족하면 다툼 여지가 가장 적다. 근로자대표 권한 부여 사실은 선출할 때마다 다시 알린다.'),
      );
    } else {
      blocks.push(GRID(['기준', '내용', '결과'], [['권한 부여 사실 주지 + 근로자 과반수 참여', '', ''], ['근로자 과반수 지지', '', '']], [40, 40, 20]));
    }
    blocks.push(NOTE('근참법상 근로자위원 정족수와 별도로 확인한다. 하나가 충족되어도 다른 하나가 자동으로 충족되지 않는다.'), ...REP_BASIS);
  }
  blocks.push(H('확인'), SIGN('선거관리위원회 위원장'), SIGN('참관인'), ...BANNER);
  return { title: DOC_NAMES.quorum, blocks };
}

// ── 06 당선공고 ──────────────────────────────────────────

export function noticeDoc(input: NosaFormInput): FormDoc {
  const c = ctx(input);
  const s = c.el?.kind === '직접선거' && c.el.workerMembers.met ? c.el.workerMembers.stages[0] : null;
  const scope = (input.concurrentScope ?? []).map((x) => x.trim()).filter(Boolean);
  return {
    title: '근로자위원 당선자 공고',
    blocks: [
      { kind: 'title', text: '공  고' },
      P('제목  노사협의회 근로자위원 당선자 공고', 8),
      P(`노사협의회 선거관리위원회는 ${ko(input.electionDate, '(선거일)')} 실시한 근로자위원 선거 결과를 다음과 같이 공고합니다.`),
      H('1. 당선자'),
      GRID(['연번', '성명', '소속', '득표수'], [['', '', '', '']], [12, 30, 38, 20]),
      SPACE(),
      H('2. 정족수 충족'),
      P(`선거인 ${s ? s.electors : '○○'}명 중 ${s ? s.voters : '○○'}명이 참여하여 근로자 과반수 참여 요건을 충족하였습니다(근참법 제6조제2항).`),
      H('3. 임기'),
      P(`${ko(input.termStart, '(기재)')}부터 3년(근참법 제8조제1항)`),
      ...(input.concurrentRep
        ? [
            H('4. 근로자대표 겸임'),
            P('본 선거는 선거 공고문 및 투표용지에 명시한 바에 따라, 당선된 근로자위원이 그 임기 동안 근로기준법상 근로자대표의 권한을 겸하여 행사하는 것을 내용으로 합니다. 권한 범위는 다음과 같습니다.'),
            LIST(scope.length ? scope : ['(기재)']),
          ]
        : []),
      SPACE(8),
      RIGHT(dateKo(c.written)),
      RIGHT('노사협의회 선거관리위원회'),
      ...BANNER,
    ],
  };
}

// ── 07 근로자대표 겸임 선출 확인서 ─────────────────────────

export function concurrentDoc(input: NosaFormInput): FormDoc {
  const c = ctx(input);
  const title = '근로기준법상 근로자대표 겸임 선출 확인서';
  const scope = (input.concurrentScope ?? []).map((x) => x.trim()).filter(Boolean);
  return {
    title,
    blocks: [
      ...head(title, c),
      H('1. 확인 사항'),
      P(
        '아래 근로자위원은 근로자참여 및 협력증진에 관한 법률에 따른 노사협의회 근로자위원으로 선출되었고, ' +
          '그 선거는 근로기준법상 근로자대표 권한을 겸하여 행사하는 자를 함께 선출한다는 사실을 알린 상태에서 ' +
          '치러졌음을 확인한다. 겸임 권한의 인정 여부는 제4항의 확인 결과에 따른다.',
      ),
      GRID(['성명', '소속', '임기'], [['', '', '']], [30, 40, 30]),
      SPACE(),
      H('2. 겸임 권한의 범위'),
      LIST(scope.length ? scope : ['(반드시 하나씩 열거할 것. 「모든 권한」처럼 묶어 맡기는 문구는 쓰지 않는다)']),
      P('위에 열거하지 않은 사항에 관하여는 근로자대표의 권한을 가지지 아니한다.'),
      H('3. 주지 사실'),
      GRID(['문서', '겸임 명시 여부', '일자'], [['선거 공고문', '명시함', ''], ['투표용지', '명시함', ''], ['당선 공고', '명시함', '']], [40, 30, 30]),
      P('위 각 문서를 통하여 선거인 전원에게 근로자대표 권한 부여 사실이 사전에 주지되었다.'),
      H('4. 정족수'),
      GRID(
        ['구분', '모수', '충족 인원', '결과'],
        [
          ['근참법상 근로자위원 — 근로자 과반수 참여', '', '', ''],
          ['근기법상 근로자대표 ① 권한 부여 사실 주지 + 근로자 과반수 참여', '', '', ''],
          ['근기법상 근로자대표 ② 근로자 과반수 지지', '', '', ''],
        ],
        [52, 14, 16, 18],
      ),
      NOTE('①과 ②는 따로 확인한다. 두 기준을 모두 충족하면 다툼 여지가 가장 적다.'),
      ...REP_BASIS,
      H('5. 한계'),
      LIST([
        '본 확인서는 근로자대표의 서면합의 권한에 관한 것이다',
        '취업규칙 불이익변경에 대한 근로기준법 제94조제1항 단서의 집단적 동의를 갈음하지 않는다',
        '협의회의 의결로 취업규칙 불이익변경 동의를 갈음할 수 없다',
      ]),
      SPACE(8),
      RIGHT(dateKo(c.written)),
      SIGN('선거관리위원회 위원장'),
      ...BANNER,
    ],
  };
}

// ── 08 회의 소집통보서 ───────────────────────────────────

export function conveneDoc(input: NosaFormInput): FormDoc {
  const c = ctx(input);
  const title = '노사협의회 회의 소집 통보서';
  return {
    title,
    blocks: [
      ...head(title, c),
      KV([['회의 구분', '정기회의 / 임시회의'], ['회차', '제    차'], ['일시', ''], ['장소', ''], ['통보일', '']]),
      NOTE('회의 개최 7일 전까지 위원에게 통보하여야 한다(근참법 제13조제3항). 통보한 날은 세지 않고 개최일 전날까지 7일이 있어야 한다 — 15일 회의면 7일까지 통보.'),
      H('의제'),
      GRID(['구분', '안건', '근거'], [['협의', '', '법 제20조'], ['의결', '', '법 제21조'], ['보고', '', '법 제22조']], [16, 60, 24]),
      SPACE(),
      H('사전 제공 자료'),
      P('근로자위원이 요구한 자료는 회의 개최 전에 제공한다(법 제14조).'),
      GRID(['자료명', '요구자', '제공일'], [['', '', '']], [50, 25, 25]),
      SPACE(),
      H('수신'),
      GRID(['구분', '성명', '통보 방법', '확인'], [['근로자위원', '', '', ''], ['사용자위원', '', '', '']], [22, 28, 28, 22]),
      ...BANNER,
    ],
  };
}

// ── 09 안건 구분표 ───────────────────────────────────────

export function agendaDoc(input: NosaFormInput): FormDoc {
  const c = ctx(input);
  const title = '노사협의회 안건 구분표';
  return {
    title,
    blocks: [
      ...head(title, c),
      P('안건의 성격을 잘못 분류하면 의결해야 할 사항을 협의로 끝내거나, 협의 사항을 의결로 처리하게 된다.'),
      H('1. 협의 사항 (법 제20조)'),
      P('협의회가 협의하는 사항. 의결이 필수는 아니다.'),
      GRID(['안건', '제안자', '협의 결과'], [['', '', '']], [50, 20, 30]),
      SPACE(),
      H('2. 의결 사항 (법 제21조)'),
      P('협의회가 반드시 의결해야 하는 사항.'),
      GRID(['안건', '제안자', '의결 결과', '정족수'], [['', '', '', '']], [40, 18, 22, 20]),
      NOTE('법 제15조(정족수) 회의는 근로자위원과 사용자위원 각 과반수의 출석으로 개최하고 출석위원 3분의 2 이상의 찬성으로 의결한다.'),
      H('3. 보고 사항 (법 제22조)'),
      P('사용자가 보고·설명하는 사항.'),
      GRID(['안건', '보고자', '비고'], [['', '', '']], [50, 20, 30]),
      SPACE(),
      H('4. 의결 사항의 사후 관리'),
      GRID(['의결 사항', '이행 책임자', '이행 기한', '점검 결과'], [['', '', '', '']], [40, 20, 20, 20]),
      LIST([
        '의결된 사항은 신속히 근로자에게 공지한다(법 제23조)',
        '노사 쌍방은 의결된 사항을 성실하게 이행하여야 한다(법 제24조)',
        '의결된 사항을 정당한 사유 없이 이행하지 않으면 1천만원 이하 벌금(법 제30조제2호)',
      ]),
      H('5. 회의록 법정 기재사항 (법 제19조제1항)'),
      P(MINUTES_REQUIRED.map((x, i) => `${i + 1}. ${x}`).join('\n')),
      LIST([
        '회의록에는 출석위원 전원이 서명하거나 날인하여야 한다(시행령 제6조)',
        '회의록은 작성한 날부터 3년간 보존한다(법 제19조제2항)',
        '정기회의는 3개월마다 개최한다(법 제12조제1항). 미개최 시 200만원 이하 벌금(법 제32조)',
      ]),
      ...BANNER,
    ],
  };
}

// ── 10 고충처리위원 선임 의결서 ───────────────────────────

export function grievanceAppointDoc(input: NosaFormInput): FormDoc {
  const c = ctx(input);
  const title = '고충처리위원 선임 의결서';
  return {
    title,
    blocks: [
      ...head(title, c),
      H('1. 의결 사항'),
      P(`근로자참여 및 협력증진에 관한 법률 제26조에 따라 고충처리위원 ${c.a.grievanceMembers}명을 다음과 같이 선임한다.`),
      GRID(['구분', '성명', '소속·직위', '임기'], [['근로자측', '', '', ''], ['사용자측', '', '', '']], [20, 25, 30, 25]),
      NOTE('노사를 대표하는 3명 이내로 구성한다(법 제27조제1항). 협의회가 설치된 사업이나 사업장은 협의회가 그 위원 중에서 선임한다.'),
      H('2. 근거'),
      GRID(
        ['조문', '내용'],
        [
          ['법 제26조', '모든 사업·사업장에 고충처리위원을 둔다(상시 30명 미만 제외)'],
          ['법 제27조제1항', '노사를 대표하는 3명 이내. 협의회 위원 중에서 선임'],
          ['법 제27조제2항', '임기는 협의회 위원의 임기(제8조)를 준용 - 3년'],
          ['법 제28조제1항', '고충사항 청취일부터 10일 이내 처리결과 통보'],
          ['법 제32조', '고충처리위원 미설치 시 200만원 이하 벌금'],
        ],
        [26, 74],
      ),
      SPACE(),
      H('3. 의결'),
      KV([['회의', '제    차 노사협의회'], ['일시', ''], ['출석 위원', '근로자위원    명 / 사용자위원    명'], ['의결 결과', '출석    명, 찬성    명, 반대    명으로 가결']]),
      NOTE('의결 결과는 자동으로 채우지 않는다. 회의에서 실제 확정된 값을 기재한다.'),
      H('4. 서명'),
      GRID(['구분', '성명', '서명'], [['근로자위원', '', ''], ['사용자위원', '', '']], [30, 35, 35]),
      ...BANNER,
    ],
  };
}

// ── 11 고충처리 운영지침 ─────────────────────────────────

export function grievanceGuideDoc(input: NosaFormInput): FormDoc {
  const c = ctx(input);
  const title = '고충처리 운영지침';
  return {
    title,
    blocks: [
      ...head(title, c),
      H('1. 접수'),
      LIST([
        '근로자는 구두·서면·전자우편 등 어떤 방법으로도 고충을 제기할 수 있다',
        '접수 사실을 고충사항 접수·처리대장(시행규칙 별지 제4호서식)에 기록한다',
        '접수번호를 부여하고 청취일을 반드시 기록한다. 10일 기한의 기산점이다',
      ]),
      H('2. 처리 기한 (법 제28조제1항)'),
      GRID(['단계', '기한'], [['청취', 'D-day'], ['조치사항·처리결과 통보', '청취일부터 10일 이내']], [50, 50]),
      NOTE('기산점은 접수일이 아니라 청취일이다.'),
      H('3. 처리하기 곤란한 사항 (법 제28조제2항)'),
      P('고충처리위원이 처리하기 곤란한 사항은 협의회 회의에 부쳐 협의 처리한다. 이 경우에도 근로자에게 진행 경과를 통보한다.'),
      H('4. 비밀 유지'),
      LIST([
        '고충 내용과 요청인 신원은 처리에 필요한 범위를 넘어 공유하지 않는다',
        '대장의 열람 권한을 고충처리위원으로 한정한다',
        '소속 부서 인원이 적은 경우 요청인이 특정될 수 있으므로 기재 방식에 주의한다',
      ]),
      H('5. 경계'),
      GRID(
        ['사안', '처리'],
        [
          ['직장 내 괴롭힘 신고', '근로기준법 제76조의3 조사 절차로 이관. 고충처리로 갈음하지 않는다'],
          ['직장 내 성희롱', '남녀고용평등법상 조치 절차로 이관'],
          ['임금 미지급 등 법 위반 사항', '고충처리와 별개로 시정 조치'],
        ],
        [34, 66],
      ),
      SPACE(),
      H('6. 기록 보존'),
      P('고충사항 접수·처리대장은 작성하여 갖추어 두고 1년간 보존한다(시행령 제9조). 협의회규정으로 더 길게 정할 수는 있다.'),
      ...BANNER,
    ],
  };
}

// ── 12 위촉통지서(과반수 노동조합) ─────────────────────────

export function appointDoc(input: NosaFormInput): FormDoc {
  const c = ctx(input);
  const title = '노사협의회 근로자위원 위촉 통지서';
  return {
    title,
    blocks: [
      ...head(title, c),
      H('1. 근거'),
      P(
        '근로자참여 및 협력증진에 관한 법률 제6조제3항에 따라, 근로자의 과반수로 조직된 노동조합이 있는 경우 근로자위원은 노동조합의 대표자와 그 노동조합이 위촉하는 자로 한다. 따라서 선거를 실시하지 아니한다.',
      ),
      H('2. 과반수 조직 확인'),
      KV([['상시 근로자 수', `${input.headcount}명`], ['조합원 수', ''], ['조직률', ''], ['확인 자료', '조합원 명부 대조 등'], ['확인일', '']]),
      SPACE(),
      H('3. 위촉'),
      GRID(['구분', '성명', '소속·직위', '비고'], [['노동조합 대표자', '', '', '당연직'], ['위촉 위원', '', '', '']], [24, 26, 30, 20]),
      SPACE(),
      H('4. 임기'),
      P('3년(법 제8조제1항)'),
      H('5. 근로자대표와의 관계'),
      P('근로자의 과반수로 조직된 노동조합이 있는 경우 그 노동조합이 근로기준법상 근로자대표의 지위를 가진다는 것이 통용되는 해석이다. 다만 이 통지서로 근로자대표 지위가 창설되지 않는다.'),
      SPACE(8),
      RIGHT(dateKo(c.written)),
      SIGN('노동조합 위원장'),
      ...BANNER,
    ],
  };
}

// ── 13 협의회규정 필수기재 점검표 ──────────────────────────

export function regulationChecklistDoc(input: NosaFormInput): FormDoc {
  const c = ctx(input);
  const title = '협의회규정 필수기재사항 점검표';
  const caution = [
    '재단 배포 운영규정 예시문의 유의사항은 임의중재 근거를 「제24조」로 적고 있으나, 임의 중재는 법 제25조다(시행령 제5조제1항제6호도 제25조를 인용). 예시문을 그대로 옮기지 말 것',
    '예시문에는 「OO기업」, 「안양/구미/군포」 등 타사 잔재가 있다. 제2조 표를 반드시 눈으로 고칠 것',
  ];
  if (input.electronicVoting) caution.push('전자투표를 실시하면 방식·본인인증·중복투표 방지·명부와 득표자료 분리·관리자 접근차단·보존기간을 제2호(근로자위원 선출 절차)에 명문화한다');
  return {
    title,
    blocks: [
      ...head(title, c),
      P('협의회규정에 아래 7개 사항이 모두 들어가야 한다(시행령 제5조제1항). 하나라도 빠지면 관할 관서가 보완을 요구할 수 있다.'),
      GRID(['#', '필수기재사항 (시행령 제5조제1항 각 호)', '반영 조문', '확인'], REGULATION_REQUIRED.map((x, i) => [String(i + 1), x, '', '□']), [6, 62, 20, 12]),
      SPACE(),
      H('제정·변경 절차'),
      LIST([
        '협의회규정을 제정하거나 변경할 경우 협의회의 의결을 거쳐야 한다(시행령 제5조제2항)',
        '협의회를 설치한 날부터 15일 이내 고용노동부장관에게 제출한다(법 제18조제1항). 변경한 경우에도 같다',
        '미제출 시 200만원 이하 과태료(법 제33조제1항). 근참법상 과태료는 이 1건뿐이다',
      ]),
      H('주의'),
      LIST(caution),
      ...BANNER,
    ],
  };
}

// ── 14 노동포털 제출 입력값(SN012) ─────────────────────────
// 고용노동부 노동포털 민원 「노사협의회규정 (제정/변경) 제출서」(SN012) 신청 화면의 입력 칸 — 화면 실측 261110(스킬 references/labor-portal-SN012-261110.md)

export interface PortalField {
  group: string;
  label: string;
  required: boolean;
}

const F = (group: string, label: string, required = true): PortalField => ({ group, label, required });
export const PORTAL_FIELDS: PortalField[] = [
  F('사업체 정보', '사업체명'), F('사업체 정보', '대표자명'), F('사업체 정보', '법인등록번호', false), F('사업체 정보', '사업자등록번호'),
  F('사업체 정보', '주된 사무소 소재지'), F('사업체 정보', '연락처'), F('사업체 정보', '상시 근로자 수(사업 전체)'),
  F('노사협의회 정보', '노사협의회 명칭'), F('노사협의회 정보', '연락처'), F('노사협의회 정보', '노사협의회 소재지'), F('노사협의회 정보', '설치단위(사업 / 사업장)'),
  F('노사협의회 정보', '해당사업장 사업자등록번호'), F('노사협의회 정보', '설치단위 대표자명'), F('노사협의회 정보', '해당사업장 상시근로자 수'),
  F('노사협의회 정보', '협의회규정 제정(변경)일자'), F('노사협의회 정보', '고충처리위원 수'), F('노사협의회 정보', '정기회의 개최일자'),
  F('노사협의회 정보', '노사협의회 위원 수(근로자위원 / 사용자위원)'),
  F('관할관서·첨부', '관할관서'), F('관할관서·첨부', '구비서류'),
  F('제출', '신청일'), F('제출', '제출인(사용자)'),
  F('등록인', '사업장명'), F('등록인', '사업장소재지'), F('등록인', '대표자 성명'), F('등록인', '전화번호'), F('등록인', '휴대전화'), F('등록인', '이메일'),
  F('등록인', '처리상황 알림'), F('등록인', '전자문서 통지 동의'),
];

/** 노동포털 첨부 칸에 올릴 협의회규정 — 사용자가 준비한 파일 */
export const PORTAL_ATTACH_RULES = '협의회규정 — 사용자가 준비한 파일(pdf 또는 hwp)';

export function portalDoc(input: NosaFormInput, attachRules = PORTAL_ATTACH_RULES): FormDoc {
  const c = ctx(input);
  const w = input.workplace ?? {};
  const k = input.council ?? {};
  const kind = input.regulationKind ?? '제정';
  const regDate = ko(input.regulationDate) || (kind === '제정' ? ko(input.installDate) : '');
  const membersGiven = input.workerMembers != null || input.employerMembers != null;
  const t = (s: string | undefined) => (s ?? '').trim();
  const value: Record<string, string> = {
    '사업체 정보|사업체명': t(w.name),
    '사업체 정보|대표자명': t(w.ownerName),
    '사업체 정보|사업자등록번호': bizNoText(w.bizNo),
    '사업체 정보|주된 사무소 소재지': t(w.address),
    '사업체 정보|연락처': t(w.tel),
    '사업체 정보|상시 근로자 수(사업 전체)': `${input.headcount}명`,
    '노사협의회 정보|노사협의회 명칭': t(k.name),
    '노사협의회 정보|연락처': t(k.tel),
    '노사협의회 정보|노사협의회 소재지': t(k.address),
    '노사협의회 정보|설치단위(사업 / 사업장)': input.unit ?? '',
    '노사협의회 정보|해당사업장 사업자등록번호': bizNoText(k.unitBizNo),
    '노사협의회 정보|설치단위 대표자명': t(k.unitOwnerName),
    '노사협의회 정보|해당사업장 상시근로자 수': k.unitHeadcount != null ? `${k.unitHeadcount}명` : '',
    '노사협의회 정보|협의회규정 제정(변경)일자': regDate,
    '노사협의회 정보|고충처리위원 수': input.grievanceMembers != null ? `${c.a.grievanceMembers}명` : '',
    '노사협의회 정보|정기회의 개최일자': t(k.regularMeetings),
    '노사협의회 정보|노사협의회 위원 수(근로자위원 / 사용자위원)': membersGiven ? `근로자위원 ${c.a.members.worker}명 / 사용자위원 ${c.a.members.employer}명` : '',
    '관할관서·첨부|관할관서': t(input.office),
    '관할관서·첨부|구비서류': `① ${attachRules}\n② 신·구조문대비표(변경일 때)\n③ 참고(추가)자료(선택)`,
    '등록인|사업장명': t(w.name),
    '등록인|사업장소재지': t(w.address),
    '등록인|대표자 성명': t(w.ownerName),
    '등록인|전화번호': t(w.tel),
  };
  const rows = PORTAL_FIELDS.map((f) => [f.group, f.label, f.required ? '필수' : '선택', value[`${f.group}|${f.label}`] ?? '']);
  const install = isoDate(input.installDate);
  const title = '노동포털 제출 입력값';
  return {
    title,
    blocks: [
      ...head(title, c),
      P('고용노동부 노동포털 민원 「노사협의회규정 (제정/변경) 제출서」(SN012) 신청 화면의 입력 칸이다. 화면에 옮겨 적을 값을 정리했다. 빈 칸은 직접 채운다.'),
      GRID(['구분', '입력 칸', '필수', '값'], rows, [17, 31, 9, 43]),
      SPACE(),
      P(`제출 문구: 「시행규칙 제3조제1항에 따라 ${kind}된 노사협의회규정을 제출합니다」`),
      ...(install ? [P(`제출 기한: 협의회 설치일(${dateKo(install)})부터 15일 이내 — ${dateKo(addDays(install, REPORT_DAYS))}까지(법 제18조제1항)`)] : []),
      NOTE('첨부 파일 확장자는 hwp·doc·pdf·txt·xls·gif·jpg·bmp·zip·jpeg(500MB 이하)다. hwpx·docx·xlsx 는 목록에 없으므로 협의회규정은 pdf 또는 hwp 로 올린다.'),
      NOTE('신청 주소 https://labor.moel.go.kr/minwonRqst/SN012.do · 신청자격 사업주(기업회원) · 처리기간 0일 · 수수료 없음 · 접수 관할 지방고용노동관서(노사협력정책과).'),
      NOTE('신청 화면에는 파일 첨부와 제출 버튼이 있으나 안내 쪽은 접수방법을 방문·우편으로 적고 있다. 실제 접수가 되는지는 확인하지 않았다(2026. 11. 10. 화면 확인). 화면 제출이 되지 않으면 관할 관서에 방문·우편으로 낸다.'),
      NOTE('주민등록번호 입력 칸은 없다. 법인등록번호(선택)는 이 도구가 받지 않으니 직접 적는다.'),
      NOTE('필수기재사항 7개가 협의회규정에 모두 들어 있는지 13번 점검표로 확인한다(시행령 제5조제1항).'),
    ],
  };
}

// ── 묶음 ──────────────────────────────────────────────

export interface NosaDoc {
  id: string;
  doc: FormDoc;
}

type When = 'always' | 'election' | 'concurrent' | 'union';
const PLAN: [string, (i: NosaFormInput) => FormDoc, When][] = [
  ['01_설치의무_확인서', installDoc, 'always'],
  ['02_선출방식_확인서', methodDoc, 'always'],
  ['03_선거관리규정', electionRulesDoc, 'election'],
  ['04_선거인명부', rosterDoc, 'election'],
  ['05_정족수_확인서', quorumDoc, 'election'],
  ['06_당선공고', noticeDoc, 'election'],
  ['07_근로자대표_겸임_선출_확인서', concurrentDoc, 'concurrent'],
  ['08_회의_소집통보서', conveneDoc, 'always'],
  ['09_안건_구분표', agendaDoc, 'always'],
  ['10_고충처리위원_선임_의결서', grievanceAppointDoc, 'always'],
  ['11_고충처리_운영지침', grievanceGuideDoc, 'always'],
  ['12_위촉통지서', appointDoc, 'union'],
  ['13_협의회규정_필수기재_점검표', regulationChecklistDoc, 'always'],
  ['14_노동포털_제출_입력값', portalDoc, 'always'],
];

/** 빈 칸·오류가 없을 때 부른다. 파이썬판 DOCS 와 같은 조건으로 고른다(07 은 겸임이면 방식과 상관없이 만든다) */
export function nosaDocs(input: NosaFormInput): { made: NosaDoc[]; skipped: { id: string; reason: string }[]; assessment: Assessment; election?: ElectionCheck } {
  const c = ctx(input);
  const union = c.a.selection.method === '위촉';
  const made: NosaDoc[] = [];
  const skipped: { id: string; reason: string }[] = [];
  for (const [id, fn, when] of PLAN) {
    if (when === 'election' && union) skipped.push({ id, reason: '과반수 노동조합 위촉이므로 선거 서류를 만들지 않음' });
    else if (when === 'union' && !union) skipped.push({ id, reason: '선거 방식이므로 만들지 않음' });
    else if (when === 'concurrent' && !input.concurrentRep) skipped.push({ id, reason: '근로자대표 겸임이 아님' });
    else made.push({ id, doc: fn(input) });
  }
  return { made, skipped, assessment: c.a, election: c.el };
}
