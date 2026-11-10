// 고충처리 대장 — 고충사항 청취·처리결과 통보·협의회 부의·종결을 덧붙이기만 하는 기록으로 남긴다.
// 근거: 근참법 제28조제1항(청취일부터 10일 이내 처리결과 통보) · 제2항(처리하기 곤란한 사항은 협의회 회의에 부쳐 협의 처리)
//       시행령 제9조(고충사항 접수·처리 대장을 작성해 갖추어 두고 1년간 보존 — 기산점은 조문에 없어 날짜를 계산하지 않는다).
// ★ 고충은 근로자 개인 사정이라 이 묶음에서 가장 민감하다. 이름·사연 같은 자유 글을 받지 않는다 — 사건 번호·분류·날짜·단계·부의 안건 ID 만.
import { addDays, GRIEVANCE_NOTICE_DAYS, isoDate } from './assess';

export const GRIEVANCE_LOG = '_고충대장.jsonl';
export const GRIEVANCE_STAGES = ['청취', '통보', '회의 부의', '종결'] as const;
export type GrievanceStage = (typeof GRIEVANCE_STAGES)[number];
export const GRIEVANCE_CATEGORIES = ['임금', '근로시간·휴가', '작업환경·안전', '복리후생', '인사·배치', '대인관계', '그 밖의 사항'] as const;
export type GrievanceCategory = (typeof GRIEVANCE_CATEGORIES)[number];
export const GRIEVANCE_KEEP_NOTE = '고충사항 접수·처리 대장은 작성해 갖추어 두고 1년간 보존한다(시행령 제9조).';
const CASE_RE = /^G-[0-9A-Za-z-]{1,24}$/;

export interface GrievanceRecord {
  seq: number;
  caseId: string;
  stage: GrievanceStage;
  /** 그 단계가 일어난 날 — 청취면 청취일(기산점) */
  date: string;
  category?: GrievanceCategory;
  /** 회의 부의 — 협의회 회의 안건 ID */
  agendaId?: string;
  /** 앞 기록을 고칠 때 그 seq */
  corrects?: number;
}

export function grievanceRecordErrors(r: Partial<GrievanceRecord>, existing: readonly GrievanceRecord[]): string[] {
  const out: string[] = [];
  if (!r.caseId || !CASE_RE.test(r.caseId)) out.push('사건 번호(caseId)는 G- 로 시작하는 영문·숫자입니다(예: G-2026-001). 이름을 넣지 않습니다.');
  if (!r.stage || !GRIEVANCE_STAGES.includes(r.stage)) out.push(`단계(stage)는 ${GRIEVANCE_STAGES.join('·')} 가운데 하나입니다.`);
  if (!isoDate(r.date)) out.push(`date 는 YYYY-MM-DD 날짜입니다(받은 값: ${r.date ?? ''}).`);
  if (r.category != null && !GRIEVANCE_CATEGORIES.includes(r.category)) out.push(`분류(category)는 ${GRIEVANCE_CATEGORIES.join('·')} 가운데 하나입니다.`);
  if (r.stage === '청취' && !r.category) out.push('청취 기록에는 분류(category)를 넣습니다.');
  if (r.stage === '회의 부의' && !r.agendaId?.trim()) out.push('회의 부의 기록에는 협의회 안건 ID(agendaId)를 넣습니다(법 제28조제2항).');
  if (r.corrects != null && !existing.some((x) => x.seq === r.corrects)) out.push(`고칠 기록(corrects ${r.corrects})이 대장에 없습니다.`);
  const mine = existing.filter((x) => x.caseId === r.caseId);
  if (r.caseId && r.stage && r.stage !== '청취' && !mine.some((x) => x.stage === '청취')) out.push(`${r.caseId} 의 청취 기록이 먼저 있어야 합니다(기한의 기산점).`);
  if (r.stage === '청취' && mine.some((x) => x.stage === '청취') && r.corrects == null) out.push(`${r.caseId} 는 이미 청취 기록이 있습니다 — 고치려면 corrects 에 그 seq 를 넣습니다.`);
  const heard = [...mine].reverse().find((x) => x.stage === '청취')?.date;
  if (heard && isoDate(r.date) && r.stage !== '청취' && r.date! < heard) out.push(`${r.stage} 날짜(${r.date})가 청취일(${heard})보다 앞섭니다.`);
  return out;
}

export interface GrievanceCase {
  caseId: string;
  category: GrievanceCategory | null;
  heard: string;
  /** 처리결과 통보 기한 = 청취일 + 10일(법 제28조제1항) */
  due: string;
  notified: string | null;
  referredAgendaId: string | null;
  closed: string | null;
  /** 통보가 기한을 넘겼거나, 통보 없이 기한이 지났다 */
  late: boolean;
  status: string;
}

/** 사건마다 현재 상태 — 같은 단계는 마지막 기록(정정 포함)을 쓴다 */
export function grievanceCases(records: readonly GrievanceRecord[], today: string): GrievanceCase[] {
  const by = new Map<string, GrievanceRecord[]>();
  for (const r of [...records].sort((a, b) => a.seq - b.seq)) by.set(r.caseId, [...(by.get(r.caseId) ?? []), r]);
  const out: GrievanceCase[] = [];
  for (const [caseId, rs] of by) {
    const last = (s: GrievanceStage) => [...rs].reverse().find((x) => x.stage === s);
    const heardRec = last('청취');
    if (!heardRec) continue;
    const due = addDays(heardRec.date, GRIEVANCE_NOTICE_DAYS);
    const notified = last('통보')?.date ?? null;
    const referred = last('회의 부의')?.agendaId?.trim() || null;
    const closed = last('종결')?.date ?? null;
    const late = notified ? notified > due : today > due;
    const status = closed ? '종결' : notified ? '통보' : referred ? '회의 부의' : '청취';
    out.push({ caseId, category: heardRec.category ?? [...rs].reverse().find((x) => x.category)?.category ?? null, heard: heardRec.date, due, notified, referredAgendaId: referred, closed, late, status });
  }
  return out.sort((a, b) => a.heard.localeCompare(b.heard) || a.caseId.localeCompare(b.caseId));
}

export function appendGrievance(list: readonly GrievanceRecord[], r: Omit<GrievanceRecord, 'seq'>): GrievanceRecord[] {
  return [...list, { ...r, seq: (list.at(-1)?.seq ?? 0) + 1 }];
}
