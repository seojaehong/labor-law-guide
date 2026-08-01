import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 429 분기용 — createClient를 갈아끼운다(라우트는 supabase env가 있을 때만 호출).
const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: rpcMock }),
}));

import { POST, sanitizeExtracted, extractJsonPayload } from '@/app/api/tools/contract-check/extract/route';

const fetchMock = vi.fn();

function makeRequest(files: Array<{ bytes: number; type?: string; name?: string }>): Request {
  const form = new FormData();
  for (const [i, f] of files.entries()) {
    form.append(
      'images',
      new File([new Uint8Array(f.bytes)], f.name ?? `page${i}.jpg`, { type: f.type ?? 'image/jpeg' }),
    );
  }
  return new Request('http://localhost/api/tools/contract-check/extract', {
    method: 'POST',
    body: form,
    headers: { 'x-forwarded-for': '203.0.113.9' },
  });
}

function anthropicReply(text: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: 'text', text }] }),
  };
}

const GOOD_EXTRACTION = {
  period: {
    start_date: '2026-03-02',
    end_date: null,
    indefinite: true,
    probation: { applied: true, months: 3, wage_rate_pct: 90 },
  },
  job: { location: '서울 강남구 매장', duty: '홀 서빙' },
  work_time: {
    days_per_week: 5,
    start: '09:00',
    end: '18:00',
    breaks: [{ minutes: 60 }],
    night_work: false,
  },
  wage: {
    monthly_total: '2,300,000원',
    items: [{ code: 'BASE', label: '기본급', amount: 2100000, basis_text: '계약서 기재' }],
    payday: '매월 10일',
    payment_method: '계좌이체',
  },
  holidays_leave: { weekly_rest: '일요일', weekly_rest_day_specified: true, annual_leave_clause: null },
  risk_clauses: [
    { clause_ref: '제9조', text: '위약금 100만원', tags: ['위약예정'] },
    { clause_ref: '제10조', text: '설명 없음', tags: ['해당없음'] },
  ],
  notes: ['휴게시간이 흐릿해 확인이 필요합니다'],
};

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: { allowed: true, count: 1 }, error: null });
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
  // 기본은 Supabase env 없음 = 레이트리밋 생략(로컬 동작)
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST /api/tools/contract-check/extract', () => {
  it('정상 파싱: Anthropic 응답을 스키마 규격 계약 JSON으로 돌려준다', async () => {
    fetchMock.mockResolvedValue(anthropicReply('```json\n' + JSON.stringify(GOOD_EXTRACTION) + '\n```'));

    const resp = await POST(makeRequest([{ bytes: 128 }]));
    expect(resp.status).toBe(200);

    const body = await resp.json();
    expect(body.contract.period.start_date).toBe('2026-03-02');
    expect(body.contract.period.indefinite).toBe(true);
    expect(body.contract.work_time.days_per_week).toBe(5);
    expect(body.contract.wage.monthly_total).toBe(2300000);
    expect(body.contract.wage.items).toHaveLength(1);
    expect(body.contract.holidays_leave.weekly_rest_day_specified).toBe(true);
    // 태그 사전에 없는 조항은 버려진다
    expect(body.contract.risk_clauses).toHaveLength(1);
    expect(body.contract.risk_clauses[0].tags).toEqual(['위약예정']);
    expect(body.notes).toEqual(['휴게시간이 흐릿해 확인이 필요합니다']);
    // 개인정보 필드는 애초에 응답 스키마에 없다
    expect(body.contract.employee).toBeUndefined();
    expect(body.contract.workplace).toBeUndefined();

    // 지정 모델로 1회 호출
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.model).toBe('claude-sonnet-5');
    expect(sent.messages[0].content[0].type).toBe('image');
  });

  it('앞에 text가 아닌 블록이 와도 첫 text 블록을 골라 파싱한다', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [
          { type: 'thinking', thinking: '사진 확인 중' },
          { type: 'text', text: JSON.stringify(GOOD_EXTRACTION) },
        ],
      }),
    });

    const resp = await POST(makeRequest([{ bytes: 128 }]));
    expect(resp.status).toBe(200);
    expect((await resp.json()).contract.wage.monthly_total).toBe(2300000);
  });

  it('ANTHROPIC_API_KEY가 없으면 501 + 수동 입력 안내', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');

    const resp = await POST(makeRequest([{ bytes: 128 }]));
    expect(resp.status).toBe(501);

    const body = await resp.json();
    expect(body.error).toBe('not_configured');
    expect(body.message).toContain('직접 입력');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('IP당 일 5회 초과면 429 + 상담 안내', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    // 전역 캡은 통과, IP 캡에서 막힌다
    rpcMock
      .mockResolvedValueOnce({ data: { allowed: true, count: 1 }, error: null })
      .mockResolvedValueOnce({ data: { allowed: false, count: 6, max: 5 }, error: null });

    const resp = await POST(makeRequest([{ bytes: 128 }]));
    expect(resp.status).toBe(429);

    const body = await resp.json();
    expect(body.error).toBe('rate_limited');
    expect(body.message).toContain('상담');
    expect(fetchMock).not.toHaveBeenCalled();

    // 챗과 같은 공용 RPC를 쓴다 — scope는 기존 값, key만 cc: 네임스페이스
    expect(rpcMock.mock.calls[0][0]).toBe('incr_rate_limit');
    const globalArgs = rpcMock.mock.calls[0][1];
    expect(globalArgs.p_scope).toBe('global');
    expect(globalArgs.p_key).toBe('cc_all');

    // 원본 IP가 아니라 해시가 넘어간다
    const ipArgs = rpcMock.mock.calls[1][1];
    expect(ipArgs.p_scope).toBe('ip');
    expect(ipArgs.p_max).toBe(5);
    expect(ipArgs.p_key).toMatch(/^cc:[0-9a-f]{32}$/);
    expect(ipArgs.p_key).not.toContain('203.0.113.9');
  });

  it('전역 일일 캡을 넘기면 429이고 IP 카운터를 올리지 않는다', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    rpcMock.mockResolvedValue({ data: { allowed: false, count: 301 }, error: null });

    const resp = await POST(makeRequest([{ bytes: 128 }]));
    expect(resp.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
    // 전역에서 끊겼으므로 RPC는 한 번만 불린다
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock.mock.calls[0][1].p_scope).toBe('global');
  });

  it('레이트리밋 DB 오류는 fail-open (사용자를 막지 않는다)', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    rpcMock.mockResolvedValue({ data: null, error: { message: 'function does not exist' } });
    fetchMock.mockResolvedValue(anthropicReply(JSON.stringify(GOOD_EXTRACTION)));

    const resp = await POST(makeRequest([{ bytes: 128 }]));
    expect(resp.status).toBe(200);
  });

  it('5MB 초과 이미지는 413이고 API를 호출하지 않는다', async () => {
    const resp = await POST(makeRequest([{ bytes: 5 * 1024 * 1024 + 1 }]));
    expect(resp.status).toBe(413);

    const body = await resp.json();
    expect(body.error).toBe('file_too_large');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('이미지가 없으면 400, 5장이면 400', async () => {
    expect((await POST(makeRequest([]))).status).toBe(400);
    expect((await POST(makeRequest(Array(5).fill({ bytes: 64 })))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Anthropic 오류·비JSON 응답은 502로 폴백 안내', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 529, json: async () => ({}) });
    expect((await POST(makeRequest([{ bytes: 64 }]))).status).toBe(502);

    fetchMock.mockResolvedValue(anthropicReply('사진이 흐려 읽을 수 없습니다'));
    const resp = await POST(makeRequest([{ bytes: 64 }]));
    expect(resp.status).toBe(502);
    expect((await resp.json()).error).toBe('parse_failed');
  });
});

describe('sanitizeExtracted', () => {
  it('수습 미적용/미확인이면 감액률을 버린다 (MINWAGE-PROBATION 오탐 방지)', () => {
    const off = sanitizeExtracted({ period: { probation: { applied: false, months: 3, wage_rate_pct: 90 } } });
    expect(off!.contract.period.probation).toEqual({ applied: false });

    const unknown = sanitizeExtracted({ period: { probation: { applied: null, wage_rate_pct: 90 } } });
    expect(unknown!.contract.period.probation).toBeNull();
  });

  it('빈 객체도 전 필드 null로 정규화한다', () => {
    const result = sanitizeExtracted({})!;
    expect(result.contract.period.start_date).toBeNull();
    expect(result.contract.work_time.variants).toBeNull();
    expect(result.contract.wage.items).toEqual([]);
    expect(result.contract.risk_clauses).toEqual([]);
    expect(result.notes).toEqual([]);
  });

  it('객체가 아니면 null', () => {
    expect(sanitizeExtracted('문자열')).toBeNull();
    expect(sanitizeExtracted([1, 2])).toBeNull();
  });

  it('알 수 없는 임금 항목 코드는 OTHER로, 금액 0은 버린다', () => {
    const result = sanitizeExtracted({
      wage: { items: [{ code: 'MYSTERY', amount: 50000 }, { code: 'BASE', amount: 0 }] },
    })!;
    expect(result.contract.wage.items).toEqual([
      { code: 'OTHER', label: undefined, amount: 50000, basis_hours: null, basis_text: null },
    ]);
  });
});

describe('extractJsonPayload', () => {
  it('코드펜스·앞뒤 설명을 벗겨낸다', () => {
    expect(extractJsonPayload('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJsonPayload('결과입니다: {"a":1} 이상입니다.')).toBe('{"a":1}');
    expect(extractJsonPayload('  {"a":1}  ')).toBe('{"a":1}');
  });
});
