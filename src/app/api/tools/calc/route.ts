import { NextRequest, NextResponse } from 'next/server';
import {
  checkMinWage,
  calcOrdinaryWage,
  calcOvertime,
  calcSeverance,
  lookupLawArticle,
} from '@/lib/labor-calc';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const tool = body?.tool;
    const args = body?.args || {};
    let result;
    switch (tool) {
      case 'check_min_wage':
        result = checkMinWage(args);
        break;
      case 'calc_ordinary_wage':
        result = calcOrdinaryWage(args);
        break;
      case 'calc_overtime':
        result = calcOvertime(args);
        break;
      case 'calc_severance':
        result = calcSeverance(args);
        break;
      case 'lookup_law_article':
        result = await lookupLawArticle(args);
        break;
      default:
        return NextResponse.json({ error: 'unknown_tool', supported: ['check_min_wage', 'calc_ordinary_wage', 'calc_overtime', 'calc_severance', 'lookup_law_article'] }, { status: 400 });
    }
    return NextResponse.json({ tool, result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 400 });
  }
}
