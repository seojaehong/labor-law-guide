// 양정 사례 API — 1차는 우리만(SANCTION_API_TOKEN). 토큰이 틀리면 DB 를 부르지 않는다.
import { NextResponse } from 'next/server';
import { fetchSanctionCases } from '@/lib/sanction-cases';
import { SANCTION_TYPES, type SanctionType } from '@/lib/sanction-types';
import { sanctionAuthorized } from '@/lib/sanction-token';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const noStore = { 'cache-control': 'no-store' };

export async function GET(request: Request) {
  if (!sanctionAuthorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const p = new URL(request.url).searchParams;
  const type = p.get('type') ?? '';
  if (!(SANCTION_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: 'type', allowed: SANCTION_TYPES }, { status: 400, headers: noStore });
  }
  const sanction = p.get('sanction');
  const level = p.get('level');
  try {
    const rows = await fetchSanctionCases({
      type: type as SanctionType,
      sanction: sanction === '적정' || sanction === '과중' ? sanction : undefined,
      level: level === '중징계' || level === '경징계' ? level : undefined,
      disposition: p.get('disposition')?.slice(0, 30) || undefined,
      keyword: p.get('keyword')?.slice(0, 40) || undefined,
      fitsOnly: p.get('fits_only') !== 'false',
      withLong: p.get('with_long') === 'true',
      limit: Number(p.get('limit')) || undefined,
      offset: Math.max(Math.floor(Number(p.get('offset')) || 0), 0),
    });
    return NextResponse.json({ rows }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: 'query' }, { status: 500, headers: noStore });
  }
}
