import { NextRequest, NextResponse } from 'next/server';
import type { DecisionResult, ReasonCategory } from '@/lib/types';
import { runSearch } from '@/lib/search/search-modes';
import type { SearchMode } from '@/lib/search/types';

function asMode(value: string | null): SearchMode {
  if (value === 'candidate' || value === 'compare') return value;
  return 'baseline';
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = asMode(searchParams.get('mode'));
    const query = searchParams.get('q') || '';
    const reason = ((searchParams.get('reason') as ReasonCategory | null) || '') as ReasonCategory | '';
    const result = ((searchParams.get('result') as DecisionResult | null) || '') as DecisionResult | '';
    const page = Number(searchParams.get('page') || '0');

    const payload = await runSearch({
      mode,
      query,
      reason,
      result,
      page: Number.isFinite(page) ? page : 0,
    });

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown search error',
      },
      { status: 500 }
    );
  }
}
