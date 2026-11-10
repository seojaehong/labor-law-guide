// nosa 묶음 — 노사협의회(근로자참여 및 협력증진에 관한 법률) 설치의무·선출방식·위원 수·정족수·기한 확인.
// 규칙은 src/lib/nosa-council/assess.ts(정본, 노사협의회신고 스킬 assess.py 에서 옮김)를 그대로 불러온다.
// ★ assess_labor_council 은 읽기 전용이라 원격판에 싣는다(nosaRemoteSafe) — 숫자·참거짓·날짜·고른 값만 받는다. 이름 칸이 없다.
// ★ 이 파일은 work-rules 묶음(법제처 · 홈 폴더 .env 읽기)을 불러오지 않는다. 원격판 번들에 섞이지 않게.
// ★ 등록 함수에 파일·네트워크 I/O 를 넣지 않는다(원격 라우트는 요청마다 McpServer 를 새로 만든다).
// ★ 공개 문구 금지어(src/lib/tool-kit/banned.ts) + 포괄·대신·대행·대리·지도를 이 묶음의 글(설명·결과)에 쓰지 않는다.
// ★ make_labor_council_forms 는 이 PC 에 파일을 쓰므로 로컬 전용이다(nosaLocalOnly). 근로자 이름 칸은 받지 않고 서류에도 비워 둔다.
// ★ make_council_meeting_docs 도 로컬 전용이다. 위원 이름은 사용자가 넣을 때만 싣고, 서명 칸은 비워 둔다.
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addDays, assess, BOUNDARY_NOTICE, deadline, electionCheck, electionErrors, INDIRECT_REASONS, isoDate, quorumMeeting, REPORT_DAYS,
} from '@/lib/nosa-council/assess';
import { nosaBlanks, nosaDocs, nosaErrors } from '@/lib/nosa-council/forms';
import { ARTICLE_KEYS, meetingCheck, meetingErrors, REPORT_KEYS } from '@/lib/nosa-council/meeting';
import { IMPL_STATUSES, meetingDocs, meetingDocsErrors, minutesRecord } from '@/lib/nosa-council/meeting-docs';
import { RULES_SOURCE } from '@/lib/nosa-council/rules-template';
import { formHwpx, formPdf } from '@/lib/work-rules-report/render';
import { looksLikeRrn, text } from '../lib/common.mjs';

export const nosaTools = ['assess_labor_council', 'check_council_meeting', 'make_labor_council_forms', 'make_council_meeting_docs'];
/** 원격(HTTP)판에 실어도 되는 도구 — 읽기 전용, 파일·네트워크를 건드리지 않는다 */
export const nosaRemoteSafe = ['assess_labor_council', 'check_council_meeting'];
/** 이 PC 에 파일을 쓰는 도구 — 원격판에서 뺀다 */
export const nosaLocalOnly = ['make_labor_council_forms', 'make_council_meeting_docs'];

// 서류 PDF 글꼴 — 계약서·취업규칙 신고 서류와 같은 나눔고딕 전체(OFL). 묶은 뒤에는 dist/server.mjs 하나라 here = dist/ 다.
// (work-rules 묶음의 같은 함수를 부르지 않고 따로 둔다 — 그 묶음은 법제처·.env 모듈을 함께 불러온다)
const here = path.dirname(fileURLToPath(import.meta.url));
const PDF_FONT = 'NanumGothic-Regular.ttf';
const fontPath = () => (process.env.LLG_ROOT ? path.join(process.env.LLG_ROOT, 'public/fonts', PDF_FONT) : path.join(here, 'assets', PDF_FONT));
const safeName = (s) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
const SN012 = 'https://labor.moel.go.kr/minwonRqst/SN012.do';
/** 서명·날인을 사람이 받아야 하는 곳 — 서류 번호 → 누구 */
const SEALS = {
  '04': '선거인명부 — 선거관리위원회 위원장 서명',
  '05': '정족수 확인서 — 선거관리위원회 위원장·참관인 서명',
  '07': '근로자대표 겸임 선출 확인서 — 선거관리위원회 위원장 서명',
  '10': '고충처리위원 선임 의결서 — 근로자위원·사용자위원 서명',
  '12': '위촉통지서 — 노동조합 위원장 서명',
};

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITES = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const fail = (error, extra = {}) => text({ ok: false, error, ...extra });

/** 서류를 파일로 쓴다. 한 파일이 실패해도(예: PDF 글꼴에 없는 글자) 나머지는 쓴다 */
async function writeForms(targets) {
  const font = targets.some((x) => x.f === 'pdf') ? new Uint8Array(fs.readFileSync(fontPath())) : null;
  const files = [];
  const skipped = [];
  for (const t of targets) {
    try {
      const bytes = t.f === 'pdf' ? await formPdf([t.d.doc], font) : await formHwpx([t.d.doc]);
      fs.writeFileSync(t.path, bytes);
      files.push({ document: t.d.doc.title, format: t.f, path: t.path, bytes: bytes.length });
    } catch (e) {
      skipped.push({ document: t.d.doc.title, format: t.f, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { files, skipped };
}

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

  // ── 회의 확인(원격 가능) — 서류 도구와 같은 meetingCheck 결과를 낸다 ──
  server.registerTool(
    'check_council_meeting',
    {
      title: '노사협의회 회의 확인',
      description:
        '노사협의회 회의 하나를 확인한다: ① 소집 통보 기한(개최일 − 8일 — 통보일은 세지 않고 개최일 전 7일, 법 제13조제3항) ② 정기회의 3개월(법 제12조제1항 — 3개월 기간마다 1회 이상이라 직전 정기회의 + 3개월이 지나면 「확인 필요」, 6개월이 지나면 「빈 기간 있음」으로 알린다) ' +
        '③ 개최 정족수(협의회규정상 정원 기준 근로자위원·사용자위원 각 과반수 출석, 현원 기준이 아니다) ④ 안건별 의결(출석위원 3분의 2 이상, 올림) ⑤ 법 제21조 의결사항을 의결하지 못하면 임의 중재(법 제25조) 안내 ⑥ 정기회의 보고사항(법 제22조제1항 4개) 누락 ⑦ 의결사항 공지 기한(협의회규정 값, 견본 10일). ' +
        '숫자·날짜·선택지만 받고 안건 제목·이름은 받지 않는다. 통보서·회의자료·회의록·공지문은 로컬 전용 서류 도구로 만든다. 일반 기준을 정리한 참고 결과다.',
      inputSchema: {
        kind: z.enum(['정기', '임시']).describe('회의 종류'),
        meetingDate: z.string().describe('개최일 YYYY-MM-DD'),
        noticeDate: date('소집 통보일.'),
        previousRegularDate: date('직전 정기회의일(정기회의 간격을 볼 때).'),
        workerSeats: z.number().int().min(1).describe('협의회규정상 근로자위원 정원'),
        employerSeats: z.number().int().min(1).describe('협의회규정상 사용자위원 정원'),
        workerCurrent: count().optional().describe('근로자위원 현원(결원이 있을 때 — 정족수는 정원 기준이라 알림에만 쓴다)'),
        employerCurrent: count().optional().describe('사용자위원 현원'),
        workerPresent: count().optional().describe('출석 근로자위원 수'),
        employerPresent: count().optional().describe('출석 사용자위원 수'),
        agenda: z.array(z.object({
          type: z.enum(['보고', '협의', '의결']).describe('안건 구분'),
          article: z.enum(ARTICLE_KEYS).optional().describe('법조문 분류 — 20-1~20-17(법 제20조제1항 협의사항 각 호), 21-1~21-5(법 제21조 의결사항 각 호), 22-1~22-4(법 제22조제1항 보고사항 각 호)'),
          resolutionItem: z.boolean().optional().describe('법 제21조 의결사항(article 이 21- 이면 자동)'),
          inFavor: count().optional().describe('찬성 수(표결했을 때)'),
        })).max(40).optional().describe('안건 순서대로'),
        reportsCovered: z.array(z.enum(REPORT_KEYS)).max(4).optional().describe('정기회의에서 보고·설명한 사항(법 제22조제1항): 경영계획·생산계획·인력계획·재정상황'),
        noticeDays: z.number().int().min(1).max(60).optional().describe('의결사항 공지 기한(일) — 협의회규정 값(견본 제29조 10일)'),
        today: date('기준일(기본 오늘, KST).'),
      },
      annotations: READ_ONLY,
    },
    async (a) => {
      if (looksLikeRrn(JSON.stringify(a))) return fail('입력에 주민등록번호 모양의 숫자가 있어 멈췄습니다. 이 도구는 숫자·날짜만 받습니다.');
      const today = a.today ? isoDate(a.today) : todayKst();
      const errors = [...(a.today && !today ? [`today 는 YYYY-MM-DD 날짜입니다(받은 값: ${a.today}).`] : []), ...meetingErrors(a)];
      if (errors.length) return text({ ok: false, errors, error: '맞지 않는 칸이 있어 확인하지 않았습니다.' });
      const r = meetingCheck(a, today);
      return text({
        ok: true,
        today,
        ...r,
        boundary: BOUNDARY_NOTICE,
        notice: '근로자참여 및 협력증진에 관한 법률과 고용노동부 「노사협의회 운영 매뉴얼」(2022. 12.)을 정리한 일반 기준이다. 협의회규정이 법보다 엄격하면 그 규정을 따른다.',
      });
    },
  );

  // ── 서류(로컬 전용) ──
  const str = () => z.string().optional();
  server.registerTool(
    'make_labor_council_forms',
    {
      title: '노사협의회 서류 만들기(로컬 전용)',
      description:
        '노사협의회 설치·선출·신고 서류를 outDir 에 PDF·한글(hwpx)로 만든다: 00 협의회규정 견본(입력값으로 칸을 채우고 모르는 칸은 ○○, 과반수 노동조합·선거구·위원선거인·공동의장은 입력에 따라 한 가지만 남김) · 01 설치의무 확인서 · 02 선출방식 확인서 · 03 선거관리규정 · 04 선거인명부(빈 줄) · 05 정족수 확인서 · 06 당선공고 · 07 근로자대표 겸임 선출 확인서(겸임일 때) · 08 회의 소집통보서 · 09 안건 구분표 · ' +
        '10 고충처리위원 선임 의결서 · 11 고충처리 운영지침 · 12 위촉통지서(과반수 노동조합일 때) · 13 협의회규정 필수기재 점검표 · 14 노동포털 제출 입력값(SN012 신청 화면 칸과 채울 값). ' +
        '과반수 노동조합이면 선거 서류(03~06)를 만들지 않는다. election 을 주면 05 에 정족수 결과를 채운다. 사업장명이 비면 만들지 않고 빈 칸을 돌려준다. 작성일은 기본 오늘. ' +
        '근로자·위원·후보 이름은 받지 않고 서류에도 비워 둔다. 서명·날인 칸은 비워 둔다. 이미 있는 파일은 덮어쓰지 않는다. 주민등록번호는 받지 않는다. ' +
        '위원 수가 3명 미만·10명 초과이거나 양쪽 수가 다르면 만들지 않는다. 협의회규정은 ○○ 칸을 채우고 협의회에서 의결한 뒤 pdf 로 노동포털에 첨부한다(hwpx 는 편집용, 첨부 확장자 목록에 없다). 제출은 사용자가 노동포털이나 관할 지방고용노동관서에 한다.',
      inputSchema: {
        workplace: z.object({
          name: str().describe('사업장명(필수)'),
          ownerName: str().describe('대표자 성명'),
          bizNo: str().describe('사업자등록번호 10자리'),
          address: str().describe('주된 사무소 소재지'),
          tel: str().describe('연락처'),
        }).describe('사업체 정보'),
        headcount: count().describe('상시 근로자 수(사업 전체). 기간제·단시간·일용을 넣고 파견근로자는 뺀다'),
        majorityUnion: z.boolean().describe('근로자의 과반수로 조직된 노동조합이 있다'),
        indirectReason: z.string().max(200).optional().describe('간접선거를 쓰는 부득이한 사유(예: 사무직·기술직·기능직 사업장이 따로 있다). 비우면 직접선거'),
        workerMembers: count().optional().describe('근로자위원 수'),
        employerMembers: count().optional().describe('사용자위원 수'),
        grievanceMembers: z.number().int().min(1).optional().describe('고충처리위원 수(비우면 3)'),
        concurrentRep: z.boolean().optional().describe('근로자위원이 근로기준법상 근로자대표를 겸한다'),
        concurrentScope: z.array(z.string().max(100)).max(20).optional().describe('겸임 권한 범위를 하나씩(예: 탄력적 근로시간제 서면합의)'),
        electronicVoting: z.boolean().optional().describe('전자투표를 한다(선거관리규정에 본인인증·데이터 분리·접근 차단 조항을 넣는다)'),
        unit: z.enum(['사업', '사업장']).optional().describe('설치단위'),
        installDate: date('협의회 설치일(제1차 회의에서 협의회규정을 의결한 날).'),
        regulationDate: date('협의회규정 제정·변경일(비우면 제정은 설치일).'),
        regulationKind: z.enum(['제정', '변경']).optional().describe('노동포털 제출 구분(기본 제정)'),
        electionDate: date('선거일.'),
        termStart: date('근로자위원 임기 시작일.'),
        rosterDate: date('선거인명부 확정 기준일.'),
        electors: count().optional().describe('선거인 총수(선거인명부 머리에 적는다)'),
        election: electionShape.extend({
          districts: z.array(z.object({ label: z.string().max(30).optional(), electors: count(), voters: count() })).max(30).optional().describe('선거구마다 이름(부서명 등)·선거인 수·투표자 수'),
        }).optional().describe('근로자위원 선거 결과(숫자) — 05 정족수 확인서에 채운다'),
        council: z.object({
          name: str().describe('노사협의회 명칭'),
          tel: str().describe('노사협의회 연락처'),
          address: str().describe('노사협의회 소재지'),
          unitBizNo: str().describe('해당사업장 사업자등록번호'),
          unitOwnerName: str().describe('설치단위 대표자명'),
          unitHeadcount: count().optional().describe('해당사업장 상시근로자 수'),
          regularMeetings: str().describe('정기회의 개최일자(예: 3월·6월·9월·12월 둘째 주 화요일)'),
        }).optional().describe('노동포털 제출 칸 — 노사협의회 정보'),
        office: str().describe('관할 지방고용노동관서(예: 서울지방고용노동청 서울강남지청)'),
        rules: z.object({
          unionName: str().describe('과반수 노동조합 명칭(제6조② — 노동조합이 근로자위원을 위촉할 때)'),
          unitName: str().describe('설치단위 이름(예: 가상상사 본사). 비우고 설치단위가 「사업」이면 사업장명'),
          effectiveDate: date('규정 시행일(기본 규정 제정·변경일, 없으면 설치일).'),
          coChair: z.boolean().optional().describe('근로자위원·사용자위원 각 1명을 공동의장으로 한다(제7조①)'),
          chairTerm: z.string().max(30).optional().describe('의장 임기(예: 1년)'),
          employerPositions: z.array(z.string().max(40)).max(9).optional().describe('사용자위원 직위(이름 아님, 예: 인사팀장)'),
          allowanceHours: z.number().positive().max(24).optional().describe('회의 1회당 이동·자료 검토를 근로한 시간으로 보는 한도(시간)'),
          subcommitteeMembers: count().optional().describe('실무소위원회 노사 각 위원 수'),
          electionCommitteeMembers: count().optional().describe('선거관리위원회 위원 수 상한'),
          tieBreak: z.string().max(60).optional().describe('득표수가 같을 때 정하는 기준(예: 근속기간이 긴 사람)'),
          districts: z.array(z.object({ label: z.string().max(30).optional(), seats: count().optional() })).max(30).optional().describe('선거구별 선출 — 선거구 이름과 근로자위원 수(별표)'),
          arbitrationMembers: count().optional().describe('협의회 중재기구 노사 각 위원 수'),
          grievanceDesk: z.string().max(100).optional().describe('고충 신고 창구(예: 고충처리위원에게 직접 또는 전자우편)'),
        }).optional().describe('00 협의회규정 견본의 칸 — 비운 칸은 ○○ 로 남는다'),
        writtenDate: date('작성일(기본 오늘).'),
        outDir: z.string().describe('저장할 폴더(없으면 만든다)'),
        fileBase: str().describe('파일 이름 앞부분(기본 「노사협의회_」 + 작성일)'),
        formats: z.array(z.enum(['pdf', 'hwpx'])).optional().describe('만들 형식(기본 pdf·hwpx)'),
      },
      annotations: WRITES,
    },
    async (a) => {
      if (looksLikeRrn(JSON.stringify(a))) return fail('입력에 주민등록번호 모양의 숫자가 있어 만들지 않았습니다. 이 도구는 주민등록번호를 받지 않습니다.');
      const written = a.writtenDate ? isoDate(a.writtenDate) : todayKst();
      const input = {
        workplace: a.workplace ?? {}, headcount: a.headcount, majorityUnion: a.majorityUnion, indirectReason: a.indirectReason,
        workerMembers: a.workerMembers, employerMembers: a.employerMembers, grievanceMembers: a.grievanceMembers,
        concurrentRep: a.concurrentRep, concurrentScope: a.concurrentScope, electronicVoting: a.electronicVoting, unit: a.unit,
        installDate: a.installDate, regulationDate: a.regulationDate, regulationKind: a.regulationKind, electionDate: a.electionDate,
        termStart: a.termStart, rosterDate: a.rosterDate, electors: a.electors, election: a.election, council: a.council, office: a.office,
        writtenDate: written ?? a.writtenDate, rules: a.rules,
      };
      const blanks = nosaBlanks(input);
      const errors = nosaErrors(input);
      if (blanks.length || errors.length) {
        return text({ ok: false, ...(blanks.length ? { blanks } : {}), ...(errors.length ? { errors } : {}), error: '빈 칸이나 맞지 않는 칸이 있어 서류를 만들지 않았습니다. 채워서 다시 부르세요.' });
      }
      const want = new Set(a.formats?.length ? a.formats : ['pdf', 'hwpx']);
      const base = safeName((a.fileBase ?? '').trim() || `노사협의회_${written.replace(/-/g, '')}`);
      // 노동포털 첨부는 협의회규정 pdf — 14번 첨부 칸에 그 파일 이름을 적는다(hwpx 는 첨부 확장자 목록에 없다)
      const attach = want.has('pdf') ? `${base}_00_협의회규정.pdf` : `${base}_00_협의회규정.hwpx 를 한글에서 pdf 또는 hwp 로 저장한 파일`;
      const { made, skipped: skippedDocuments, assessment, election } = nosaDocs(input, { attach });
      const targets = made.flatMap((d) => ['pdf', 'hwpx'].filter((f) => want.has(f)).map((f) => ({ d, f, path: path.join(a.outDir, `${base}_${d.id}.${f}`) })));
      const exists = targets.filter((x) => fs.existsSync(x.path)).map((x) => x.path);
      if (exists.length) return fail('이미 있는 파일은 덮어쓰지 않습니다. fileBase 나 outDir 를 바꿔 주세요.', { exists });

      fs.mkdirSync(a.outDir, { recursive: true });
      const { files, skipped } = await writeForms(targets);
      const install = isoDate(input.installDate);
      const warnings = [
        ...assessment.warnings,
        ...(election && !election.workerMembers.met ? ['근로자위원 선출 정족수가 미달입니다. 당선공고(06)의 참여 인원은 비워 두었습니다. 재투표 뒤 다시 만드세요.'] : []),
        ...(!install ? ['협의회 설치일(installDate)이 없어 제출 기한을 적지 않았습니다.'] : []),
      ];
      const made2 = new Set(made.map((d) => d.id.slice(0, 2)));
      return text({
        ok: files.length > 0,
        files,
        ...(skipped.length ? { skipped } : {}),
        skippedDocuments,
        sealRequired: Object.entries(SEALS).filter(([k]) => made2.has(k)).map(([, s]) => `서명 필요 — ${s}`),
        regulation: '00 협의회규정은 견본이다. ○○ 칸을 채우고 제1차 회의에서 의결한 뒤 낸다(시행령 제5조제2항). 고쳐 쓰면 필수기재사항 7개가 남았는지 13번 점검표로 확인한다. 노동포털에는 pdf 또는 hwp 로 첨부한다(hwpx·docx 는 첨부 확장자 목록에 없다).',
        submit: {
          online: '고용노동부 노동포털 민원 「노사협의회규정 (제정/변경) 제출서」(SN012) — 입력 칸과 채울 값은 14번 서류',
          url: SN012,
          ...(install ? { deadline: addDays(install, REPORT_DAYS) } : {}),
          attach,
          paper: '관할 지방고용노동관서에 방문·우편 제출(근로자참여 및 협력증진에 관한 법률 시행규칙 제3조제1항)',
        },
        notice: `협의회규정 견본: ${RULES_SOURCE}`,
        ...(warnings.length ? { warnings } : {}),
        boundary: BOUNDARY_NOTICE,
        check: '제출 전에 파일을 열어 사업장 정보·날짜·인원을 확인하고, 빈 칸(이름·서명)을 채운 뒤 냅니다.',
      });
    },
  );

  // ── 회의 서류(로컬 전용) — 통보·자료·회의록·공지가 한 입력과 한 meetingCheck 를 쓴다(kind 로 고른다) ──
  const side = z.enum(['근로자위원', '사용자위원']);
  const position = () => z.string().max(40).optional().describe('직위(예: 생산1팀 대표, 인사팀장)');
  const realName = () => z.string().max(30).optional().describe('실명 — 사용자가 넣을 때만 싣는다');
  const long = (d) => z.string().max(2000).optional().describe(d);
  const member = z.object({ side, position: position(), name: realName() });
  server.registerTool(
    'make_council_meeting_docs',
    {
      title: '노사협의회 회의 서류 만들기(로컬 전용)',
      description:
        '노사협의회 회의 하나의 서류를 outDir 에 PDF·한글(hwpx)로 만든다. kind 로 고른다: notice = 소집 통보서(받는 위원을 주면 위원마다 한 장)·소집 공고 · materials = 회의자료(안건 목록, 정기회의 보고사항 4개 칸, 안건별 배경·현황·노사 제안·쟁점·요청 결정, 전분기 의결 이행 점검표) · ' +
        'minutes = 회의록(시행규칙 별지 제3호서식 칸 7개 그대로 + 참석위원 서명 칸)과 상세 회의록, 그리고 같은 이름의 .json(안건 ID·구분·법조문 분류·제안 측·결과·이월을 담은 구조화 원본) · resolution = 의결사항 공지. ' +
        '정족수·의결 문장은 출석·찬성 수로 넣는다(정원 기준 각 과반 출석, 출석 3분의 2 찬성 — 못 미치면 「의결되지 않음」). 통보일이 기한(개최일 − 8일)보다 늦으면 소집 통보서를 만들지 않는다. 회의가 성립하지 않아도 회의록은 만들고 알린다. ' +
        '안건 설명·발언 요지·의결 내용은 입력으로 받은 것만 싣는다. 이름은 넣을 때만 싣고 서명 칸은 비워 둔다. 주민등록번호 칸은 없다. 이미 있는 파일은 덮어쓰지 않는다. 일반 기준을 정리한 서식이며 협의회규정이 다르면 고쳐 쓴다.',
      inputSchema: {
        kind: z.enum(['notice', 'materials', 'minutes', 'resolution']).describe('만들 서류 — notice 소집 통보서·공고 / materials 회의자료 / minutes 회의록·상세 회의록·.json / resolution 의결사항 공지'),
        workplace: z.object({ name: z.string().max(100).optional().describe('사업장명(필수)') }).describe('사업장'),
        councilName: z.string().max(100).optional().describe('노사협의회 명칭(비우면 「노사협의회」)'),
        meeting: z.object({
          kind: z.enum(['정기', '임시']).describe('회의 종류'),
          number: z.number().int().min(1).optional().describe('차수(회의록에는 필수 — 회의 키 YYYY-정기|임시-N차)'),
          date: z.string().describe('개최일 YYYY-MM-DD'),
          time: z.string().max(20).optional().describe('시각(예: 14:00)'),
          place: z.string().max(100).optional().describe('장소'),
          noticeDate: date('소집 통보일(notice 는 비우면 작성일).'),
          previousRegularDate: date('직전 정기회의일.'),
        }).describe('회의'),
        seats: z.object({ worker: z.number().int().min(1), employer: z.number().int().min(1) }).describe('협의회규정상 정원(근로자위원·사용자위원)'),
        current: z.object({ worker: count().optional(), employer: count().optional() }).optional().describe('현원(결원이 있을 때 — 정족수는 정원 기준이라 알림에만 쓴다)'),
        attendance: z.object({
          worker: count().describe('출석 근로자위원 수'),
          employer: count().describe('출석 사용자위원 수'),
          members: z.array(member).max(20).optional().describe('출석위원 직위(서명 칸 줄에 적는다)'),
        }).optional().describe('출석(회의록·공지에 필수)'),
        recipients: z.array(member).max(20).optional().describe('소집 통보서를 받을 위원 — 주면 위원마다 한 장'),
        agenda: z.array(z.object({
          id: z.string().max(40).optional().describe('안건 ID — 처음 상정 때 발급된 값. 이월 안건은 그 ID 를 그대로 넣는다. 비우면 A-개최일-순번'),
          title: z.string().max(200).describe('안건 제목'),
          type: z.enum(['보고', '협의', '의결']).describe('구분'),
          article: z.enum(ARTICLE_KEYS).optional().describe('법조문 분류 — 20-1~20-17(법 제20조제1항 각 호), 21-1~21-5(법 제21조 각 호), 22-1~22-4(법 제22조제1항 각 호)'),
          proposer: side.optional().describe('제안 측'),
          carriedOver: z.boolean().optional().describe('앞선 회의에서 넘어온 안건'),
          inFavor: count().optional().describe('찬성 수(표결했을 때 — 의결 안건은 회의록·공지에 필수)'),
          background: long('배경'),
          status: long('현황'),
          laborProposal: long('근로자위원 제안'),
          managementProposal: long('사용자위원 제안'),
          issues: long('쟁점'),
          discussion: z.array(z.object({
            side: z.enum(['근로자위원', '사용자위원', '의장', '간사']),
            position: position(),
            name: realName(),
            summary: z.string().max(2000).describe('발언 요지 — 그대로 싣는다'),
          })).max(40).optional().describe('발언 요지(상세 회의록)'),
          decision: z.string().max(1000).optional().describe('의결된 내용'),
          implementation: z.object({ action: z.string().max(300).optional(), owner: z.string().max(40).optional().describe('담당 직위'), due: date('이행 기한.') }).optional().describe('이행 계획'),
        })).min(1).max(40).describe('안건 순서대로'),
        reports: z.object({ 경영계획: long('경영계획 전반 및 실적'), 생산계획: long('분기별 생산계획과 실적'), 인력계획: long('인력계획'), 재정상황: long('기업의 경제적·재정적 상황') }).optional().describe('정기회의 보고사항(법 제22조제1항) — 보고한 내용'),
        previousResolutions: z.array(z.object({
          agendaId: z.string().max(40).describe('의결 안건 ID'),
          title: z.string().max(200).optional(),
          action: z.string().max(300).optional().describe('조치'),
          due: date('기한.'),
          status: z.enum(IMPL_STATUSES).describe('상태'),
          evidence: z.string().max(300).optional().describe('근거(문서 경로·회의 ID) — 「완료」인데 비우면 「완료(근거 없음)」'),
        })).max(60).optional().describe('전분기 의결사항 이행 상황'),
        noticeDays: z.number().int().min(1).max(60).optional().describe('의결사항 공지 기한(일) — 협의회규정 값(견본 제29조 10일)'),
        otherNotes: z.string().max(1000).optional().describe('그 밖의 참고사항'),
        writtenDate: date('작성일(기본 오늘).'),
        outDir: z.string().describe('저장할 폴더(없으면 만든다)'),
        fileBase: z.string().max(80).optional().describe('파일 이름 앞부분(기본 노사협의회_개최일_정기N차)'),
        formats: z.array(z.enum(['pdf', 'hwpx'])).optional().describe('만들 형식(기본 pdf·hwpx). 회의록 .json 은 늘 만든다'),
      },
      annotations: WRITES,
    },
    async (a) => {
      if (looksLikeRrn(JSON.stringify(a))) return fail('입력에 주민등록번호 모양의 숫자가 있어 만들지 않았습니다. 이 도구는 주민등록번호를 받지 않습니다.');
      const written = a.writtenDate ? isoDate(a.writtenDate) : todayKst();
      const input = {
        workplace: a.workplace ?? {}, councilName: a.councilName, meeting: a.meeting, seats: a.seats, current: a.current, attendance: a.attendance,
        recipients: a.recipients, agenda: a.agenda ?? [], reports: a.reports, previousResolutions: a.previousResolutions, noticeDays: a.noticeDays,
        otherNotes: a.otherNotes, writtenDate: written ?? a.writtenDate,
      };
      const errors = meetingDocsErrors(input, a.kind);
      if (errors.length) return text({ ok: false, errors, error: '맞지 않는 칸이 있어 서류를 만들지 않았습니다. 고쳐서 다시 부르세요.' });
      const want = new Set(a.formats?.length ? a.formats : ['pdf', 'hwpx']);
      const m = input.meeting;
      const base = safeName((a.fileBase ?? '').trim() || `노사협의회_${m.date.replace(/-/g, '')}_${m.kind}${m.number != null ? `${m.number}차` : ''}`);
      const { made, warnings, check, agendaIds } = meetingDocs(input, a.kind);
      const targets = made.flatMap((d) => ['pdf', 'hwpx'].filter((f) => want.has(f)).map((f) => ({ d, f, path: path.join(a.outDir, `${base}_${d.id}.${f}`) })));
      const jsonPath = a.kind === 'minutes' ? path.join(a.outDir, `${base}_회의록.json`) : null;
      const exists = [...targets.map((x) => x.path), ...(jsonPath ? [jsonPath] : [])].filter((p) => fs.existsSync(p));
      if (exists.length) return fail('이미 있는 파일은 덮어쓰지 않습니다. fileBase 나 outDir 를 바꿔 주세요.', { exists });

      fs.mkdirSync(a.outDir, { recursive: true });
      const { files, skipped } = await writeForms(targets);
      let record = null;
      if (jsonPath) {
        record = minutesRecord(input);
        const body = `${JSON.stringify(record, null, 2)}\n`;
        fs.writeFileSync(jsonPath, body);
        files.push({ document: '회의록 구조화 원본', format: 'json', path: jsonPath, bytes: Buffer.byteLength(body) });
      }
      const seal = {
        notice: ['서명 필요 — 소집 통보서: 의장'],
        minutes: ['서명 필요 — 회의록(별지 제3호서식): 출석위원 전원 서명 또는 날인(시행령 제6조)'],
      }[a.kind] ?? [];
      return text({
        ok: files.some((f) => f.format !== 'json'),
        kind: a.kind,
        files,
        ...(skipped.length ? { skipped } : {}),
        agendaIds,
        check: { convene: check.convene, interval: check.interval, quorum: check.quorum, agenda: check.agenda, reports: check.reports, resolutionNotice: check.resolutionNotice },
        sealRequired: seal,
        ...(record ? { keepUntil: record.keepUntil, keep: '회의록은 작성일부터 3년 보존한다(법 제19조제2항).' } : {}),
        ...(warnings.length ? { warnings } : {}),
        boundary: BOUNDARY_NOTICE,
        review: '파일을 열어 날짜·인원·안건과 입력한 글을 확인하고, 서명 칸은 회의에서 받습니다.',
      });
    },
  );
}
