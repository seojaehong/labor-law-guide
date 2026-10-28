import { NextRequest, NextResponse } from 'next/server';
import { extractIp, hashIp, incrRateLimit } from '@/lib/rate-limit';
import { fetchWorkplaces, normalizeBizNo } from '@/lib/workplace-lookup';

export const dynamic = 'force-dynamic';

// 공공데이터 키는 서버에서만 쓴다. 입력한 번호는 저장하지 않는다(요청 수만 IP 해시로 센다).
const IP_DAILY_LIMIT = 60;

export async function GET(req: NextRequest) {
  const bizNo = normalizeBizNo(req.nextUrl.searchParams.get('bizNo') ?? '');
  if (!bizNo) return NextResponse.json({ ok: false, reason: 'invalid' }, { status: 400 });

  const limit = await incrRateLimit('ip', `workplace:${hashIp(extractIp(req))}`, IP_DAILY_LIMIT);
  if (!limit.allowed) return NextResponse.json({ ok: false, reason: 'limit' }, { status: 429 });

  const result = await fetchWorkplaces(bizNo, process.env.DATA_GO_KR_SERVICE_KEY ?? '');
  if (!result.ok && result.reason !== 'none') console.error('[workplace] lookup failed', result.reason);
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
