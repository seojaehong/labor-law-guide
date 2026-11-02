import { NextRequest, NextResponse } from 'next/server';
import { extractIp, hashIp, incrRateLimit } from '@/lib/rate-limit';
import { fetchWorkplaces, normalizeBizNo } from '@/lib/workplace-lookup';
import { findBranches, loadAgencies, parseAddress, rowsFor, type AgencyKey } from '@/lib/branch-directory';

export const dynamic = 'force-dynamic';

// 주소(또는 사업자번호 → 근복 공개 사업장 주소) → 3대 공단 관할 지사·담당 번호.
// 지사 자료는 서버에만 둔다(건강보험 1만2천 행). 입력값은 저장하지 않는다.
const BIZ_DAILY_LIMIT = 60; // 공공데이터 호출 — /api/tools/workplace 와 같은 몫을 쓴다
const ADDR_DAILY_LIMIT = 300;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const ip = hashIp(extractIp(req));
  let address = (q.get('address') ?? '').trim().slice(0, 200);

  if (!address && q.get('bizNo') !== null) {
    const bizNo = normalizeBizNo(q.get('bizNo') ?? '');
    if (!bizNo) return NextResponse.json({ ok: false, reason: 'invalid' }, { status: 400 });
    const limit = await incrRateLimit('ip', `workplace:${ip}`, BIZ_DAILY_LIMIT);
    if (!limit.allowed) return NextResponse.json({ ok: false, reason: 'limit' }, { status: 429 });
    const w = await fetchWorkplaces(bizNo, process.env.DATA_GO_KR_SERVICE_KEY ?? '');
    if (!w.ok) return NextResponse.json({ ok: false, reason: w.reason });
    // 지점이 여럿이면 화면에서 고르게 한다
    if (w.rows.length > 1) return NextResponse.json({ ok: true, pick: w.rows.map(r => ({ name: r.name, address: r.address })) });
    address = w.rows[0].address;
  }
  if (!address) return NextResponse.json({ ok: false, reason: 'invalid' }, { status: 400 });

  const limit = await incrRateLimit('ip', `branch-dir:${ip}`, ADDR_DAILY_LIMIT);
  if (!limit.allowed) return NextResponse.json({ ok: false, reason: 'limit' }, { status: 429 });

  const ag = loadAgencies();
  const a = parseAddress(address);
  const result = Object.fromEntries((['comwel', 'nhis', 'nps'] as AgencyKey[]).map(k => {
    const r = findBranches(ag[k], a);
    return [k, {
      status: r.status,
      candidates: r.candidates.map(c => ({
        code: c.code, name: c.name, hq: c.branch.hq, addr: c.branch.addr, juris: c.branch.juris,
        src: c.branch.src, mo: c.branch.mo ?? '', rows: rowsFor(c, a),
      })),
    }];
  }));
  const dates = { comwel: ag.comwel.collectedAt, nhis: ag.nhis.collectedAt, nps: ag.nps.collectedAt };
  return NextResponse.json({ ok: true, address, result, dates }, { headers: { 'Cache-Control': 'no-store' } });
}
