import { startServiceObservation } from '@/lib/observations/service-completion';
import { NextRequest, NextResponse } from 'next/server';
import type { DecisionResult, ReasonCategory } from '@/lib/types';
import { runSearch } from '@/lib/search/search-modes';
import type { SearchMode } from '@/lib/search/types';

function asMode(value: string | null): SearchMode {
  if (value === 'candidate' || value === 'compare') return value;
  return 'baseline';
}

export async function GET(req: NextRequest) {
  const observation = startServiceObservation('case_search', req.signal, () => 'retrieval');
  try {
    const { searchParams } = new URL(req.url);
    const mode = asMode(searchParams.get('mode'));
    const query = searchParams.get('q') || '';
    const reason = ((searchParams.get('reason') as ReasonCategory | null) || '') as ReasonCategory | '';
    const result = ((searchParams.get('result') as DecisionResult | null) || '') as DecisionResult | '';
    const page = Number(searchParams.get('page') || '0');

    let secondaryFailed = false;
    const payload = await runSearch({
      mode,
      query,
      reason,
      result,
      page: Number.isFinite(page) ? page : 0,
    }, () => { secondaryFailed = true; });

    const baselineFailed = Object.hasOwn(payload, 'baselineError');
    const candidateFailed = Object.hasOwn(payload, 'candidateError');
    const bucketErrors = Number(baselineFailed) + Number(candidateFailed);
    const expected = mode === 'compare' ? 2 : 1;
    const resultCount = (baselineFailed ? 0 : payload.baseline?.items.length ?? 0)
      + (candidateFailed ? 0 : payload.candidate?.items.length ?? 0);
    observation.finish({ stage: bucketErrors || secondaryFailed ? 'retrieval' : 'completed',
      outcome: bucketErrors === expected ? 'failure' : bucketErrors || secondaryFailed ? 'partial_failure' : 'success',
      error_code: bucketErrors || secondaryFailed ? 'search_failed' : 'none', result_count: bucketErrors === expected ? null : resultCount });
    return NextResponse.json(payload);
  } catch (error) {
    observation.finish({stage:'retrieval',outcome:'failure',error_code:'search_failed',result_count:null});
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown search error',
      },
      { status: 500 }
    );
  }
}
