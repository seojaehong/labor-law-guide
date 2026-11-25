// A2A 수신구가 내보내기 전에 거치는 순수 변환. 2026-11-25.
// 라우트에 두면 시험에서 가져올 수 없다 — `@/lib/supabase` 가 모듈 적재 시점에 env 를 요구한다.
// 어제 `interpretation-merge.ts` 를 뺀 것과 같은 이유다.

/** 내보내기 전에 가린다. 판정례 본문에 번호 모양이 섞여 들어오는 일이 있다. */
export function maskOut(s: string): string {
  return s
    .replace(/\b\d{6}\s*-\s*[1-4]\d{6}\b/g, '******-*******')
    .replace(/\b01[016-9]-?\d{3,4}-?\d{4}\b/g, '010-****-****')
    .replace(/\b\d{2,3}-\d{2,6}-\d{2,6}\b/g, '***-****-****');
}

export type A2AItem = {
  id: string;
  title: string;
  caseNumber: string | null;
  date: string | null;
  summary: string | null;
  holding: string | null;
  url: string | null;
};

/** RPC 가 주는 열 이름이 표마다 달라 한 모양으로 맞춘다. 가림도 여기서 걸린다. */
export function shape(r: Record<string, unknown>): A2AItem {
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = r[k];
      if (typeof v === 'string' && v.trim()) return maskOut(v.trim()).slice(0, 600);
    }
    return null;
  };
  return {
    id: String(r.id ?? ''),
    title: pick('title') ?? '',
    caseNumber: pick('doc_number', 'case_number_real', 'case_number'),
    date: typeof r.decision_date === 'string' ? r.decision_date : null,
    summary: pick('summary', 'inquiry_summary', 'holding_summary'),
    holding: pick('holding_points', 'answer_summary'),
    url: typeof r.url === 'string' ? r.url : null,
  };
}
