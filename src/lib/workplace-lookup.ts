// 사업자등록번호 → 근로복지공단 고용·산재보험 현황정보 → 규모별 의무
// API: 공공데이터포털 B490001/gySjbPstateInfoService/getGySjBoheomBsshItem (인증서 불필요, 사업장 단위 공개정보)
// ★ 조회 칸은 v_saeopjaDrno 다. 칸 이름이 틀리면 오류 없이 전국 목록이 오므로 돌아온 번호를 전부 대조한다.
// 상시인원(sangsiInwonCnt)은 공단 보험 기준 값이다 — 근로기준법 시행령 제7조의2 산정과 같지 않다.

import { DUTIES, TIERS, type Duty, type TierMin } from '@/content/duties-data';

export const API_URL = 'https://apis.data.go.kr/B490001/gySjbPstateInfoService/getGySjBoheomBsshItem';

export interface Workplace {
  bizNo: string;
  name: string;
  address: string;
  headcount: number;
  since: string | null; // YYYY-MM-DD
  industry: string | null;
}

export type LookupFail = 'no-key' | 'upstream' | 'none' | 'mismatch';
export type LookupResult = { ok: true; rows: Workplace[] } | { ok: false; reason: LookupFail };

const WEIGHTS = [1, 3, 7, 1, 3, 7, 1, 3, 5];

/** 하이픈·공백을 지운 10자리. 국세청 검증 숫자가 틀리면 null */
export function normalizeBizNo(input: string): string | null {
  const s = input.replace(/[\s-]/g, '');
  if (!/^\d{10}$/.test(s)) return null;
  const d = s.split('').map(Number);
  let sum = WEIGHTS.reduce((acc, w, i) => acc + d[i] * w, 0);
  sum += Math.floor((d[8] * 5) / 10);
  return (10 - (sum % 10)) % 10 === d[9] ? s : null;
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|apos);/g, m => ENTITIES[m]);

function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1].trim()) : null;
}

function isoDate(ymd: string | null): string | null {
  return ymd && /^\d{8}$/.test(ymd) ? `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6)}` : null;
}

/** 응답 한 줄 = 보험 하나. 같은 사업장이 고용(gyEopjong)·산재(sjEopjong) 두 줄로 온다 */
export interface InsuranceRow extends Workplace {
  employmentIndustry: string | null;
}

export function parseWorkplaceXml(xml: string): { ok: true; rows: InsuranceRow[] } | { ok: false; reason: 'upstream' } {
  if (tag(xml, 'resultCode') !== '00') return { ok: false, reason: 'upstream' };
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const rows = items.map(it => ({
    bizNo: tag(it, 'saeopjaDrno') ?? '',
    name: tag(it, 'saeopjangNm') ?? '',
    address: tag(it, 'addr') ?? '',
    headcount: Number(tag(it, 'sangsiInwonCnt') ?? 0) || 0,
    since: isoDate(tag(it, 'seongripDt')),
    industry: tag(it, 'gyEopjongNm') ?? tag(it, 'sjEopjongNm'),
    employmentIndustry: tag(it, 'gyEopjongNm'),
  }));
  return { ok: true, rows };
}

/** 이름·주소가 같은 줄을 한 사업장으로 — 인원은 큰 쪽, 성립일은 이른 쪽, 업종은 고용 쪽 */
function mergeRows(rows: InsuranceRow[]): Workplace[] {
  const byPlace = new Map<string, InsuranceRow[]>();
  for (const r of rows) {
    const k = `${r.name}|${r.address}`;
    byPlace.set(k, [...(byPlace.get(k) ?? []), r]);
  }
  return [...byPlace.values()].map(rs => ({
    bizNo: rs[0].bizNo,
    name: rs[0].name,
    address: rs[0].address,
    headcount: Math.max(...rs.map(r => r.headcount)),
    since: rs.map(r => r.since).filter((d): d is string => !!d).sort()[0] ?? null,
    industry: rs.find(r => r.employmentIndustry)?.employmentIndustry ?? rs[0].industry,
  }));
}

export async function fetchWorkplaces(
  bizNo: string,
  key: string,
  fetchImpl: (url: string) => Promise<Response> = (url) => fetch(url, { cache: 'no-store' }),
): Promise<LookupResult> {
  if (!key) return { ok: false, reason: 'no-key' };
  const url = `${API_URL}?serviceKey=${encodeURIComponent(key)}&pageNo=1&numOfRows=50&v_saeopjaDrno=${bizNo}`;
  let xml: string;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return { ok: false, reason: 'upstream' };
    xml = await res.text();
  } catch {
    return { ok: false, reason: 'upstream' };
  }
  const parsed = parseWorkplaceXml(xml);
  if (!parsed.ok) return parsed;
  if (parsed.rows.length === 0) return { ok: false, reason: 'none' };
  if (parsed.rows.some(r => r.bizNo !== bizNo)) return { ok: false, reason: 'mismatch' };
  return { ok: true, rows: mergeRows(parsed.rows) };
}

export interface Profile {
  headcount: number;
  tier: TierMin;
  total: number; // 이 구간에서 지키는 의무 수
  fresh: Duty[]; // 이 구간에서 새로 생긴 의무
  next: { min: TierMin; gap: number; added: number } | null;
}

export function profileFor(headcount: number): Profile {
  const n = Math.max(0, Math.floor(headcount));
  const tier = [...TIERS].reverse().find(t => n >= t.min)?.min ?? 1;
  const nextTier = TIERS.find(t => t.min > tier);
  return {
    headcount: n,
    tier,
    total: DUTIES.filter(d => d.min <= tier).length,
    fresh: tier === 1 ? [] : DUTIES.filter(d => d.min === tier),
    next: nextTier
      ? { min: nextTier.min, gap: nextTier.min - n, added: DUTIES.filter(d => d.min === nextTier.min).length }
      : null,
  };
}
