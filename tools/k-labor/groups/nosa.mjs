// nosa 묶음 — 노사협의회(근로자참여 및 협력증진에 관한 법률) 설치의무·선출방식·위원 수·정족수·기한 확인.
// 규칙은 src/lib/nosa-council/assess.ts(정본, 노사협의회신고 스킬 assess.py 에서 옮김)를 그대로 불러온다.
// ★ assess_labor_council 은 읽기 전용이라 원격판에 싣는다(nosaRemoteSafe) — 숫자·참거짓·날짜·고른 값만 받는다. 이름 칸이 없다.
// ★ 이 파일은 work-rules 묶음(법제처 · 홈 폴더 .env 읽기)을 불러오지 않는다. 원격판 번들에 섞이지 않게.
// ★ 등록 함수에 파일·네트워크 I/O 를 넣지 않는다(원격 라우트는 요청마다 McpServer 를 새로 만든다).
// ★ 공개 문구 금지어(src/lib/tool-kit/banned.ts) + 포괄·대신·대행·대리·지도를 이 묶음의 글(설명·결과)에 쓰지 않는다.
import { z } from 'zod';
import {
  assess, BOUNDARY_NOTICE, deadline, electionCheck, electionErrors, INDIRECT_REASONS, isoDate, quorumMeeting,
} from '@/lib/nosa-council/assess';
import { looksLikeRrn, text } from '../lib/common.mjs';

export const nosaTools = ['assess_labor_council'];
/** 원격(HTTP)판에 실어도 되는 도구 — 읽기 전용, 파일·네트워크를 건드리지 않는다 */
export const nosaRemoteSafe = ['assess_labor_council'];
/** 이 PC 에 파일을 쓰는 도구 — 원격판에서 뺀다 */
export const nosaLocalOnly = [];

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const fail = (error, extra = {}) => text({ ok: false, error, ...extra });

/** 오늘(KST, YYYY-MM-DD). 시험용으로 LLG_TODAY 를 주면 그날로 본다 */
export function todayKst() {
  return isoDate(process.env.LLG_TODAY) ?? new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
}

const count = () => z.number().int().min(0);
const date = (d) => z.string().optional().describe(`${d} YYYY-MM-DD`);

/** 선거 결과 칸 — 원격판도 쓰므로 숫자·참거짓만 */
export const electionShape = z.object({
  electors: count().describe('선거인 수 — 근로기준법상 근로자에서 사용자(이중 지위자 포함)를 뺀 인원, 기간제·단시간 포함. 간접선거면 1단계 모수'),
  voters: count().describe('그중 투표한 사람 수'),
  delegateElectors: count().optional().describe('간접선거 2단계 — 위원선거인 수'),
  delegateVoters: count().optional().describe('간접선거 2단계 — 그중 투표한 위원선거인 수'),
  districts: z.array(z.object({ electors: count(), voters: count() })).max(30).optional().describe('선거구를 나눠 뽑았을 때 선거구마다 선거인 수·투표자 수(최대 30개). 선거구마다 과반수 참여를 본다'),
  candidates: count().optional().describe('후보 수 — 정원 이하면 찬반투표(무투표 당선은 인정되지 않는다)'),
  seats: count().optional().describe('뽑을 근로자위원 수(비우면 근로자위원 수)'),
  notified: z.boolean().optional().describe('근로자대표 겸임 — 선출 당시 근로자대표 권한을 함께 맡긴다는 사실을 선거인에게 알렸다'),
  supporters: count().optional().describe('근로자대표 겸임 — 지지한 근로자 수(과반 지지 기준). 비우면 그 기준의 결과를 내지 않는다'),
});

export const meetingShape = z.object({
  workerSeats: count().describe('협의회규정상 근로자위원 정원'),
  employerSeats: count().describe('협의회규정상 사용자위원 정원'),
  workerPresent: count().describe('출석 근로자위원 수'),
  employerPresent: count().describe('출석 사용자위원 수'),
  inFavor: count().optional().describe('찬성 수(의결 안건이면)'),
});

/** 공통 입력 확인 — 날짜 형식, 선거·회의 숫자의 앞뒤. 오류 글 목록 */
export function inputErrors(a, dateKeys, indirect) {
  const out = [];
  for (const k of dateKeys) if (a[k] != null && a[k] !== '' && !isoDate(a[k])) out.push(`${k} 는 YYYY-MM-DD 날짜입니다(받은 값: ${a[k]}).`);
  if (a.election) out.push(...electionErrors(a.election, indirect || a.election.delegateElectors != null));
  const m = a.meeting;
  if (m) {
    if (m.workerPresent > m.workerSeats) out.push(`출석 근로자위원(${m.workerPresent}명)이 정원(${m.workerSeats}명)보다 많습니다.`);
    if (m.employerPresent > m.employerSeats) out.push(`출석 사용자위원(${m.employerPresent}명)이 정원(${m.employerSeats}명)보다 많습니다.`);
    if (m.inFavor != null && m.inFavor > m.workerPresent + m.employerPresent) out.push(`찬성(${m.inFavor}명)이 출석 위원 수보다 많습니다.`);
  }
  return out;
}

const DATE_KEYS = ['installDate', 'targetInstallDate', 'meetingDate', 'grievanceHeardDate', 'today'];

export function registerNosa(server) {
  server.registerTool(
    'assess_labor_council',
    {
      title: '노사협의회 설치·선출·신고 확인',
      description:
        '근로자참여 및 협력증진에 관한 법률 기준으로 노사협의회의 설치의무(상시 30명 이상, 법 제4조)·근로자위원 선출방식(과반수 노동조합이면 위촉, 부득이한 사유가 있으면 간접선거, 아니면 직접선거, 법 제6조)·위원 수(노사 동수 각 3~10명)·고충처리위원 수(3명 이내)를 확인한다. ' +
        '날짜를 주면 협의회규정 제출 기한(설치일부터 15일)·회의 소집 통보 기한(개최일 − 8일, 통보일 불산입)·고충 처리결과 통보 기한(청취일부터 10일)과 설치 목표일에서 거꾸로 잡은 일정을 낸다. ' +
        'election 을 주면 근로자위원 선출 정족수(근로자 과반수 참여 — 투표율 요건, 간접선거는 1·2단계 각각, 선거구는 선거구마다)·투표 방식(후보 수가 정원 이하면 찬반투표)과, 근로자대표 겸임이면 두 기준(행정해석 기준: 주지 + 과반수 참여 / 과반 지지 기준)을 따로 낸다. meeting 을 주면 회의 개최(정원 기준 노사 각 과반수 출석)와 의결(출석 3분의 2 이상)을 본다. ' +
        '숫자·날짜만 받고 이름은 받지 않는다. 서류(확인서·선거관리규정·당선공고·노동포털 제출 입력값 등)는 로컬 전용 make_labor_council_forms 로 만든다. 일반 기준을 정리한 참고 결과다.',
      inputSchema: {
        headcount: count().describe('상시 근로자 수(사업 전체). 기간제·단시간·일용을 넣고 파견근로자는 뺀다'),
        majorityUnion: z.boolean().optional().describe('근로자의 과반수로 조직된 노동조합이 있다 — 있으면 근로자위원은 노동조합 대표자와 노동조합이 위촉하는 사람'),
        indirectReason: z.enum(INDIRECT_REASONS).optional().describe('간접선거를 쓰는 부득이한 사유(고용노동부 노사협의회 운영 매뉴얼 33·55쪽). 비우면 직접선거'),
        workerMembers: count().optional().describe('근로자위원 수(비우면 규모별 자리값 — 법정 기준 아님)'),
        employerMembers: count().optional().describe('사용자위원 수'),
        grievanceMembers: z.number().int().min(1).optional().describe('고충처리위원 수(비우면 3)'),
        concurrentRep: z.boolean().optional().describe('근로자위원이 근로기준법상 근로자대표를 겸한다'),
        concurrentScopeSet: z.boolean().optional().describe('겸임 권한 범위(탄력적 근로시간제 서면합의 등)를 선거공고·협의회규정에 하나씩 적어 두었다'),
        installDate: date('협의회 설치일(제1차 회의에서 협의회규정을 의결한 날) → 협의회규정 제출 기한.'),
        targetInstallDate: date('설치 목표일 → 선거관리위원회 구성부터 제출까지 일정.'),
        meetingDate: date('회의 개최일 → 소집 통보 기한.'),
        grievanceHeardDate: date('고충사항 청취일 → 처리결과 통보 기한.'),
        election: electionShape.optional().describe('근로자위원 선거 결과(숫자)'),
        meeting: meetingShape.optional().describe('협의회 회의 출석·찬성(숫자)'),
        today: date('기준일(기본 오늘, 한국 시간).'),
      },
      annotations: READ_ONLY,
    },
    async (a) => {
      if (looksLikeRrn(JSON.stringify(a))) return fail('입력에 주민등록번호 모양의 숫자가 있어 확인하지 않았습니다. 이 도구는 주민등록번호를 받지 않습니다.');
      const indirect = !a.majorityUnion && !!a.indirectReason;
      const errors = inputErrors(a, DATE_KEYS, indirect);
      if (errors.length) return text({ ok: false, errors, error: '맞지 않는 칸이 있어 결과를 내지 않았습니다. 고쳐서 다시 부르세요.' });
      const today = a.today ? isoDate(a.today) : todayKst();
      const r = assess(
        {
          headcount: a.headcount, majorityUnion: a.majorityUnion, indirectReason: a.indirectReason,
          workerMembers: a.workerMembers, employerMembers: a.employerMembers, grievanceMembers: a.grievanceMembers,
          concurrentRep: a.concurrentRep, concurrentScope: a.concurrentScopeSet ? ['선거공고·협의회규정에 열거함'] : [],
          installDate: a.installDate ? isoDate(a.installDate) : undefined, targetInstallDate: a.targetInstallDate ? isoDate(a.targetInstallDate) : undefined,
        },
        today,
      );
      const warnings = [...r.warnings];
      const deadlines = {
        ...(r.reportDeadline ? { report: r.reportDeadline } : {}),
        ...(a.meetingDate ? { convene: deadline(isoDate(a.meetingDate), '소집', today) } : {}),
        ...(a.grievanceHeardDate ? { grievance: deadline(isoDate(a.grievanceHeardDate), '고충', today) } : {}),
      };
      if (a.installDate && !r.installation.required) warnings.push('상시 30명 미만이라 협의회규정 제출 기한은 내지 않았습니다.');
      let election;
      if (a.election) {
        if (r.selection.method === '위촉') warnings.push('과반수 노동조합이 있으면 근로자위원은 선거 없이 위촉합니다. 선거 정족수는 참고로만 보세요.');
        election = electionCheck(a.election, { indirect: indirect || a.election.delegateElectors != null, concurrentRep: !!a.concurrentRep, seats: r.members.worker });
      }
      const meeting = a.meeting ? quorumMeeting(a.meeting.workerSeats, a.meeting.employerSeats, a.meeting.workerPresent, a.meeting.employerPresent, a.meeting.inFavor) : undefined;
      return text({
        ok: true,
        today,
        installation: r.installation,
        selection: r.selection,
        members: r.members,
        grievanceMembers: r.grievanceMembers,
        grievanceBasis: r.grievanceBasis,
        ...(r.concurrentRep ? { concurrentRep: r.concurrentRep } : {}),
        deadlines,
        ...(r.schedule ? { schedule: r.schedule } : {}),
        ...(election ? { election } : {}),
        ...(meeting ? { meeting } : {}),
        warnings,
        boundary: BOUNDARY_NOTICE,
        documents: '서류(설치의무·선출방식·정족수 확인서, 선거관리규정, 선거인명부, 당선공고, 소집통보서, 고충처리 서류, 노동포털 제출 입력값)는 로컬 전용 make_labor_council_forms 로 PDF·한글 파일을 만든다.',
        notice: '근로자참여 및 협력증진에 관한 법률·같은 법 시행령과 고용노동부 「노사협의회 운영 매뉴얼」(2022. 12.)을 정리한 일반 기준이다. 사업장 사정에 따라 달라질 수 있으니 원문과 함께 확인한다.',
      });
    },
  );
}
