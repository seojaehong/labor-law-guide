import { NextRequest, NextResponse } from 'next/server';
import { extractDelta } from '@/lib/user-situation';
import { supabaseAdmin } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (token !== 'phase12-debug-2026') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const env = {
    has_service_role: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    has_gemini: !!process.env.GEMINI_API_KEY,
    has_openai: !!process.env.OPENAI_API_KEY,
    supabase_admin_initialized: !!supabaseAdmin,
  };

  // 1) extractDelta 실제 호출 결과
  let extractTest: unknown = null;
  let extractError: string | null = null;
  if (process.env.GEMINI_API_KEY) {
    try {
      extractTest = await extractDelta(
        '저는 5인 미만 사업장에서 3년 일했고 월급 280만원 받습니다',
        {},
        process.env.GEMINI_API_KEY
      );
    } catch (e) {
      extractError = e instanceof Error ? e.message : String(e);
    }
  }

  // 2) supabase upsert 테스트 (테스트 session_id)
  let upsertResult: unknown = null;
  let upsertError: string | null = null;
  if (supabaseAdmin) {
    try {
      const testSid = 'debug-probe-12345678';
      const { data, error } = await supabaseAdmin
        .from('user_situation')
        .upsert(
          { session_id: testSid, profile: { test: 'value', ts: Date.now() } },
          { onConflict: 'session_id' }
        )
        .select();
      upsertResult = { data, error };
    } catch (e) {
      upsertError = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json({ env, extractTest, extractError, upsertResult, upsertError });
}
