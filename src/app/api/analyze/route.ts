import { NextRequest, NextResponse } from 'next/server';
import {
  buildChecklist,
  buildFactorComparison,
  buildSummaryText,
  groupCasesByBucket,
  type AnalyzeCase,
} from '@/lib/factors';
import { supabaseAdmin } from '@/lib/supabase-server';

type AnalyzeRequestBody = {
  query?: string;
  category?: string;
  limit?: number;
};

type SimilarCaseRow = {
  id: string;
  case_number: string | null;
  title: string | null;
  decision_date: string | null;
  holding_summary: string | null;
  holding_points: string | null;
  decision_result: string | null;
};

function sanitizeLimit(limit?: number) {
  if (!Number.isFinite(limit)) {
    return 5;
  }

  return Math.min(Math.max(Math.trunc(limit as number), 1), 10);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AnalyzeRequestBody;
    const query = body.query?.trim();

    if (!query) {
      return NextResponse.json({ error: 'query는 필수이며 빈 문자열일 수 없습니다.' }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const limit = sanitizeLimit(body.limit);
    const category = body.category?.trim() || null;

    const { data, error } = await supabaseAdmin.rpc('search_similar_cases', {
      query,
      category,
      limit,
    });

    if (error) {
      return NextResponse.json(
        { error: '유사 사례 검색 RPC 호출에 실패했습니다.', details: error.message },
        { status: 502 }
      );
    }

    const normalizedCases: AnalyzeCase[] = ((data ?? []) as SimilarCaseRow[]).map((item) => ({
      id: item.id,
      case_number: item.case_number,
      title: item.title,
      decision_date: item.decision_date,
      holding_summary: item.holding_summary,
      holding_points: item.holding_points,
      decision_result: item.decision_result,
    }));

    const groupedCases = groupCasesByBucket(normalizedCases);
    const factorComparison = buildFactorComparison(groupedCases, category);
    const checklist = buildChecklist(factorComparison);
    const totalMatched = normalizedCases.length;

    return NextResponse.json({
      query,
      category,
      totalMatched,
      buckets: {
        granted: groupedCases.granted.length,
        dismissed: groupedCases.dismissed.length,
        partial: groupedCases.partial.length,
      },
      cases: {
        granted: groupedCases.granted.map(serializeCase),
        dismissed: groupedCases.dismissed.map(serializeCase),
        partial: groupedCases.partial.map(serializeCase),
      },
      factorComparison,
      checklist,
      summaryText: buildSummaryText({
        totalMatched,
        granted: groupedCases.granted.length,
        dismissed: groupedCases.dismissed.length,
        partial: groupedCases.partial.length,
        factorComparison,
      }),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

function serializeCase(item: AnalyzeCase) {
  return {
    id: item.id,
    case_number: item.case_number,
    title: item.title,
    decision_date: item.decision_date,
    holding_summary: item.holding_summary,
  };
}
