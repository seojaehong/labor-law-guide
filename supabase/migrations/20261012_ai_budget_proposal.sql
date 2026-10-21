-- LOCAL PROPOSAL ONLY. NOT EXECUTED. Requires independent SQL/permission review.
-- Existing contract_check counter is a rate limit, not a monetary reservation.
CREATE TABLE public.ai_budget_limit (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  monthly_micro_usd bigint NOT NULL CHECK(monthly_micro_usd >= 0)
);
CREATE TABLE public.ai_budget_reservations (
  id text PRIMARY KEY, month date NOT NULL, model text NOT NULL,
  reserved bigint NOT NULL CHECK(reserved > 0), cost bigint NOT NULL CHECK(cost >= 0 AND cost <= reserved),
  state text NOT NULL CHECK(state IN ('pending','unknown','success','abstained')),
  input_tokens bigint, output_tokens bigint, latency_ms bigint
);
ALTER TABLE public.ai_budget_limit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_budget_reservations ENABLE ROW LEVEL SECURITY;
-- No default budget row: missing configuration fails closed.
CREATE FUNCTION public.reserve_ai_budget(p_id text,p_model text,p_amount bigint) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE cap bigint; exposure bigint; period date := date_trunc('month',now())::date;
BEGIN
  SELECT monthly_micro_usd INTO cap FROM public.ai_budget_limit WHERE singleton FOR UPDATE;
  IF cap IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'budget-unavailable'; END IF;
  IF EXISTS(SELECT 1 FROM public.ai_budget_reservations WHERE id=p_id) THEN RAISE EXCEPTION 'duplicate-request'; END IF;
  SELECT COALESCE(sum(CASE WHEN month=period THEN cost ELSE reserved END),0) INTO exposure
  FROM public.ai_budget_reservations WHERE month=period OR state IN ('pending','unknown');
  IF exposure + p_amount > cap THEN RAISE EXCEPTION 'monthly-budget-exceeded'; END IF;
  INSERT INTO public.ai_budget_reservations VALUES(p_id,period,p_model,p_amount,p_amount,'pending',NULL,NULL,NULL);
  RETURN p_id;
END $$;
CREATE FUNCTION public.settle_ai_budget(p_id text,p_cost bigint,p_input bigint,p_output bigint,p_latency bigint,p_success boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE item public.ai_budget_reservations;
BEGIN
  -- Same lock ordering as reservation prevents limit/settlement races.
  PERFORM 1 FROM public.ai_budget_limit WHERE singleton FOR UPDATE;
  SELECT * INTO item FROM public.ai_budget_reservations WHERE id=p_id FOR UPDATE;
  IF item.id IS NULL OR item.state <> 'pending' THEN RAISE EXCEPTION 'invalid-settlement'; END IF;
  IF p_cost IS NULL OR p_cost<0 OR p_cost>item.reserved OR p_input IS NULL OR p_input<0 OR p_output IS NULL OR p_output<0 THEN
    UPDATE public.ai_budget_reservations SET state='unknown' WHERE id=p_id;
  ELSE
    UPDATE public.ai_budget_reservations SET cost=p_cost,state=CASE WHEN p_success THEN 'success' ELSE 'abstained' END,
      input_tokens=p_input,output_tokens=p_output,latency_ms=p_latency WHERE id=p_id;
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON public.ai_budget_limit,public.ai_budget_reservations FROM anon,authenticated;
REVOKE ALL ON FUNCTION public.reserve_ai_budget(text,text,bigint) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.settle_ai_budget(text,bigint,bigint,bigint,bigint,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_budget(text,text,bigint),public.settle_ai_budget(text,bigint,bigint,bigint,bigint,boolean) TO service_role;
