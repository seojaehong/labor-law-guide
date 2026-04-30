-- 이메일 구독자 테이블 (정통망법 준수)
-- 정보통신망법 제50조: 명시적 opt-in, 발신자 정보 명시, 1-click unsubscribe 의무

CREATE TABLE IF NOT EXISTS public.subscribers (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'unsubscribed', 'bounced')),
  source TEXT,                              -- 어디서 가입 (article-footer / sidebar / contact 등)
  source_slug TEXT,                         -- 가입 시 보고 있던 글 slug
  unsubscribe_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  confirm_token TEXT DEFAULT encode(gen_random_bytes(24), 'hex'),
  ip_hash TEXT,                             -- 가입 IP 해시 (로그/스팸 방지, 정통망법 동의 증빙)
  user_agent TEXT,
  consent_at TIMESTAMPTZ,                   -- 동의 시각 (정통망법 증빙)
  consent_text TEXT,                        -- 동의 문구 스냅샷
  confirmed_at TIMESTAMPTZ,                 -- double opt-in 확인 클릭 시각
  unsubscribed_at TIMESTAMPTZ,
  bounce_count INT NOT NULL DEFAULT 0,
  last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS subscribers_email_uniq ON public.subscribers (lower(email));
CREATE INDEX IF NOT EXISTS subscribers_status_idx ON public.subscribers (status);
CREATE INDEX IF NOT EXISTS subscribers_unsub_token_idx ON public.subscribers (unsubscribe_token);
CREATE INDEX IF NOT EXISTS subscribers_confirm_token_idx ON public.subscribers (confirm_token);

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION public.trg_subscribers_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscribers_updated_at ON public.subscribers;
CREATE TRIGGER subscribers_updated_at
  BEFORE UPDATE ON public.subscribers
  FOR EACH ROW EXECUTE FUNCTION public.trg_subscribers_updated_at();

-- RLS — anon 키로는 INSERT만 가능, SELECT/UPDATE/DELETE는 service_role 전용
ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscribers_anon_insert ON public.subscribers;
CREATE POLICY subscribers_anon_insert
  ON public.subscribers
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (status = 'pending');  -- 신규 구독은 무조건 pending으로만 insert

-- 발송 통계용
CREATE TABLE IF NOT EXISTS public.subscriber_sends (
  id BIGSERIAL PRIMARY KEY,
  subscriber_id BIGINT NOT NULL REFERENCES public.subscribers(id) ON DELETE CASCADE,
  campaign_slug TEXT NOT NULL,           -- 발송 캠페인 식별자 (예: weekly-2026-W18)
  article_slug TEXT,                     -- 발송한 글
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  bounce_reason TEXT,
  provider_message_id TEXT
);

CREATE INDEX IF NOT EXISTS subscriber_sends_sub_idx ON public.subscriber_sends (subscriber_id);
CREATE INDEX IF NOT EXISTS subscriber_sends_campaign_idx ON public.subscriber_sends (campaign_slug);
CREATE INDEX IF NOT EXISTS subscriber_sends_sent_at_idx ON public.subscriber_sends (sent_at DESC);

ALTER TABLE public.subscriber_sends ENABLE ROW LEVEL SECURITY;
-- subscriber_sends는 anon 접근 차단 (service_role만)

COMMENT ON TABLE public.subscribers IS '이메일 구독자 (정통망법 준수: opt-in 동의 + unsubscribe token + IP 해시)';
COMMENT ON TABLE public.subscriber_sends IS '발송 이력 (open/click/bounce 추적용)';
