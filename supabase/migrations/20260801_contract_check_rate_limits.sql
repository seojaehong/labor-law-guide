-- /tools/contract-check 사진 추출 API 레이트리밋 (US-305)
-- IP 해시 × 날짜 단위 카운터. 원본 IP·이미지·판독 결과는 저장하지 않는다(해시만).

CREATE TABLE IF NOT EXISTS public.contract_check_rate_limits (
  ip_hash TEXT NOT NULL,                    -- sha256(IP_HASH_SALT:ip) 앞 32자
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ip_hash, date)
);

-- 오래된 카운터 정리용
CREATE INDEX IF NOT EXISTS contract_check_rate_limits_date_idx
  ON public.contract_check_rate_limits (date);

ALTER TABLE public.contract_check_rate_limits ENABLE ROW LEVEL SECURITY;
-- 정책 없음 = anon/authenticated 접근 차단, service_role만 접근 (subscriber_sends와 동일)

-- 원자적 증가 + 허용 여부 판정. 라우트는 이 함수가 없어도 fail-open으로 동작한다.
CREATE OR REPLACE FUNCTION public.incr_contract_check_rate_limit(p_ip_hash TEXT, p_max INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO public.contract_check_rate_limits (ip_hash, date, count)
  VALUES (p_ip_hash, CURRENT_DATE, 1)
  ON CONFLICT (ip_hash, date)
  DO UPDATE SET count = contract_check_rate_limits.count + 1, updated_at = NOW()
  RETURNING count INTO v_count;

  RETURN jsonb_build_object(
    'count', v_count,
    'max', p_max,
    'allowed', v_count <= p_max,
    'remaining', GREATEST(p_max - v_count, 0)
  );
END;
$$;

COMMENT ON TABLE public.contract_check_rate_limits IS
  '근로계약서 자가진단 사진 추출 API 일일 레이트리밋 (IP 해시 기준, 기본 5회/일)';
