// leave 묶음 — 연차유급휴가 발생일수(src/lib/leave/annual-leave)와 퇴직 때 연차 재정산(src/lib/leave/leave-ledger)을 그대로 불러 쓴다.
// 날짜와 일수만 받는다. 이름·주민등록번호를 받지 않고 파일·네트워크를 건드리지 않는다 — 원격판에 그대로 실을 수 있다(leaveRemoteSafe).
// 결과 문장은 사이트 화면(/tools/leave, /tools/leave/settlement)의 문장을 옮기고, 엔진 근거 문장 가운데 공개 문구 금지어가 든 것은 이 파일의 문장으로 바꾼다.
import { z } from 'zod';
import { calculateEntitlement } from '@/lib/leave/annual-leave';
import { settleOnTermination } from '@/lib/leave/leave-ledger';
import { todayKst } from '@/lib/tool-kit';
import { text } from '../lib/common.mjs';

export const leaveTools = ['calc_annual_leave', 'settle_leave_on_exit'];
/** 원격(HTTP)판에 실어도 되는 도구 — 전부 */
export const leaveRemoteSafe = [...leaveTools];

const SITE = 'https://yellowenvelope.kr';
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

function run(fn) {
  try {
    return fn();
  } catch (e) {
    return text({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}

/** YYYY-MM-DD 이고 달력에 있는 날인가 */
function checkDate(s, what) {
  const t = /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? Date.parse(`${s}T00:00:00Z`) : NaN;
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== s) throw new Error(`${what}을 YYYY-MM-DD 로 넣어 주세요`);
}

const NOT_COVERED = [
  '출근율 80% 미만인 해, 회사가 더 준 휴가, 육아휴직·병가 같은 특수한 출결은 계산하지 않습니다.',
  '이미 쓴 일수·이월분을 뺀 남은 일수는 계산하지 않습니다. 이 도구는 생기는 일수만 셉니다.',
  '회계연도 기준으로 운영한 회사가 퇴직자와 정산할 때는 settle_leave_on_exit 로 입사일 기준 누계와 맞대어 봅니다.',
];

const MONTHLY_NOTE =
  '근속 1년 이상이면 입사 후 1년 미만 기간에 월 단위로 생긴 연차(최대 11일)를 입사일 기준 누계에 넣을지 includeFirstYearMonthly 로 알려 주세요. 회계연도로 부여한 누계에 그 일수가 들어 있다면 넣어야 같은 기준으로 비교됩니다(최영우 『실무노동법』 산정 예 — 입사일 기준 11일 / 6일). 사용 촉진으로 이미 소멸한 일수는 넣지 않습니다.';

export function registerLeave(server) {
  // ── 연차 발생일수 ──
  server.registerTool(
    'calc_annual_leave',
    {
      title: '연차 발생일수 계산',
      description:
        '입사일 기준으로 기준일까지 생긴 연차유급휴가 일수를 계산한다(사이트 /tools/leave 와 같은 엔진, 근로기준법 제60조). 1년 미만 = 계속근로 1개월마다 1일(최대 11일), 1년 이상 = 15일, 3년 이상 = 2년마다 1일 더해 최대 25일. ' +
        '출근율 80% 미만·회계연도 기준 운영·회사가 더 준 휴가·남은 일수는 다루지 않는다.',
      inputSchema: {
        hireDate: z.string().describe('입사일 YYYY-MM-DD'),
        asOf: z.string().optional().describe('기준일 YYYY-MM-DD(기본 오늘, KST)'),
      },
      annotations: READ_ONLY,
    },
    async (a) =>
      run(() => {
        const asOf = a.asOf ?? todayKst();
        const r = calculateEntitlement({ hireDate: a.hireDate, asOf });
        const headline = [
          r.serviceYears < 1 ? `${asOf} 기준 지금까지 생긴 연차는 ${r.days}일입니다.` : `${asOf} 기준 그해 연차는 ${r.days}일입니다.`,
          r.basisLabel,
        ];
        return text({
          ok: true, asOf, headline, result: r,
          notCovered: NOT_COVERED,
          basis: ['근로기준법 제60조제1항(1년간 80% 이상 출근 15일)·제2항(1년 미만 1개월 개근 1일)·제4항(3년 이상 2년마다 1일, 최대 25일)'],
          site: `${SITE}/tools/leave`,
        });
      }),
  );

  // ── 퇴직 때 연차 재정산 ──
  server.registerTool(
    'settle_leave_on_exit',
    {
      title: '퇴직 연차 재정산',
      description:
        '회계연도 기준으로 연차를 준 회사에서 퇴직할 때, 입사일 기준 누계와 회계연도로 부여한 누계 가운데 근로자에게 유리한 쪽을 보장선으로 두고 이미 쓰거나 수당으로 받은 일수를 뺀 정산 일수를 계산한다(사이트 /tools/leave/settlement 와 같은 엔진, 근로기준과-5802). ' +
        '수당 금액은 계산하지 않는다(calc_leave_pay). 빈 칸은 0으로 보지 않고, 회계연도 쪽이 많을 때 취업규칙의 「퇴직 시 입사일 기준 재산정」 규정 유무를 모르면 확정하지 않는다.',
      inputSchema: {
        hireDate: z.string().describe('입사일 YYYY-MM-DD'),
        endDate: z.string().describe('퇴사일 YYYY-MM-DD'),
        fiscalGrantedTotal: z.number().optional().describe('회사가 회계연도 기준으로 실제 부여한 일수 합계(모르면 비운다 — 0과 다르다)'),
        usedOrPaidTotal: z.number().optional().describe('이미 쓰거나 수당으로 받은 일수 합계(모르면 비운다 — 0과 다르다)'),
        hasRecalcClause: z.boolean().optional().describe('취업규칙에 「퇴직 시 입사일 기준으로 재산정한다」는 규정이 있다(모르면 비운다)'),
        includeFirstYearMonthly: z.boolean().optional().describe('근속 1년 이상일 때 입사 첫해 월 단위 연차(최대 11일)를 입사일 기준 누계에 넣는다(모르면 비운다)'),
      },
      annotations: READ_ONLY,
    },
    async (a) =>
      run(() => {
        checkDate(a.hireDate, '입사일');
        checkDate(a.endDate, '퇴사일');
        const r = settleOnTermination(a);
        const missing = [a.fiscalGrantedTotal === undefined ? '회계연도로 부여한 누계' : null, a.usedOrPaidTotal === undefined ? '사용·수당 지급한 누계' : null].filter(Boolean);
        // 엔진의 「월차 포함 여부」 근거 문장은 공개 문구 금지어를 품어 이 파일의 문장으로 바꾼다(같은 뜻)
        const monthlyAsked = r.verdict === 'insufficient-input' && !missing.length && r.favourable === 'equal';
        const groundNote = monthlyAsked ? MONTHLY_NOTE : r.groundNote;
        const headline = r.verdict === 'shortfall'
          ? [`정산 대상 ${r.shortfallDays}일`, `보장선 ${r.guaranteedTotal}일 − 이미 쓰거나 수당으로 받은 ${r.usedOrPaidTotal}일`]
          : r.verdict === 'insufficient-input'
            ? [missing.length ? `${missing.join('·')}가 필요합니다` : monthlyAsked ? '입사 첫해 월 단위 연차를 넣을지 확인이 필요합니다' : '취업규칙 확인이 필요합니다', groundNote]
            : ['정산 대상이 없습니다', groundNote];
        return text({
          ok: true, headline,
          result: { ...r, groundNote },
          notice: '일수만 셉니다. 정산 일수의 수당 금액은 calc_leave_pay 로 계산합니다.',
          basis: ['근로기준과-5802(2009. 12. 31.) — 회계연도 기준 운영은 근로자에게 불리하지 않아야 하고, 퇴직 시 입사일 기준에 못 미치면 그 일수를 미사용수당으로 정산', '근로기준법 제60조(연차 유급휴가)'],
          site: `${SITE}/tools/leave/settlement`,
        });
      }),
  );
}
