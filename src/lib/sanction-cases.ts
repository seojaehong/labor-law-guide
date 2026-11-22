// 양정 사례 조회 — public.sanction_cases(서버 역할로만 읽는다, RLS 정책 없음).
// supabase-server 는 부를 때 불러온다 — MCP 라우트가 이 파일을 import 해도 다른 도구 요청은 DB 클라이언트를 만들지 않는다.
import type { SanctionType } from '@/lib/sanction-types';

export type SanctionQuery = {
  type: SanctionType;
  sanction?: '적정' | '과중';
  disposition?: string;
  keyword?: string;
  fitsOnly?: boolean;
  limit?: number;
};

const COLS = 'id,court,case_number,decided_on,type,kind,disposition,reason,sanction,procedure,quote,quote_fits,evidence,generated_note,also_types,related,reversed_by,block_status,block_body,long_text';

const like = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function fetchSanctionCases(q: SanctionQuery) {
  const { supabaseAdmin } = await import('@/lib/supabase-server');
  if (!supabaseAdmin) throw new Error('서버 역할 키가 없어 양정 사례를 읽지 못했습니다');
  let r = supabaseAdmin.from('sanction_cases').select(COLS).eq('type', q.type);
  if (q.sanction) r = r.eq('sanction', q.sanction);
  if (q.disposition) r = r.ilike('disposition', like(q.disposition));
  if (q.keyword) {
    const p = like(q.keyword.replace(/[,()]/g, ' '));
    r = r.or(`block_body.ilike.${p},long_text.ilike.${p},quote.ilike.${p}`);
  }
  // 기본 = 검수 블록이 있는 판결만(P5). fitsOnly=false 면 긴 판단·블록 없음까지 전부
  if (q.fitsOnly !== false) r = r.eq('block_status', 'pass');
  const { data, error } = await r.order('decided_on', { ascending: false, nullsFirst: false }).limit(Math.min(Math.max(q.limit ?? 8, 1), 30));
  if (error) throw new Error(`양정 사례 조회 오류: ${error.code ?? ''}`);
  return data ?? [];
}
