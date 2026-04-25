-- Phase 1.2: 사용자 상황 자동 수집 테이블
-- 챗봇이 대화 중 추출한 사용자 프로필(회사규모/근속/임금/직군 등)을 session 단위로 보관

CREATE TABLE IF NOT EXISTS user_situation (
  session_id text PRIMARY KEY,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  turns_observed int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 7일 이상 미사용 세션 자동 정리용 인덱스 (개인정보 최소화)
CREATE INDEX IF NOT EXISTS user_situation_updated_at_idx
  ON user_situation (updated_at DESC);

-- profile JSONB 필드 검색용 GIN
CREATE INDEX IF NOT EXISTS user_situation_profile_gin_idx
  ON user_situation USING gin (profile);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION user_situation_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_situation_updated_at_trg ON user_situation;
CREATE TRIGGER user_situation_updated_at_trg
  BEFORE UPDATE ON user_situation
  FOR EACH ROW EXECUTE FUNCTION user_situation_set_updated_at();

-- RLS: service_role만 직접 조작 가능 (Next.js API에서 supabaseAdmin로 접근)
ALTER TABLE user_situation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_situation_service_all ON user_situation;
CREATE POLICY user_situation_service_all ON user_situation
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 7일 자동 정리용 함수 (cron으로 매일 호출)
CREATE OR REPLACE FUNCTION cleanup_stale_user_situation(retention_days int DEFAULT 7)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  deleted_count int;
BEGIN
  DELETE FROM user_situation
  WHERE updated_at < now() - (retention_days || ' days')::interval
  RETURNING 1 INTO deleted_count;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION cleanup_stale_user_situation(int) TO service_role;

COMMENT ON TABLE user_situation IS 'Phase 1.2 사용자 상황 자동 수집 — session_id 단위 프로필. 7일 후 자동 삭제.';
COMMENT ON COLUMN user_situation.profile IS 'JSONB: company_size, tenure_months, monthly_salary, job_type, issue_category, employment_status, timeline 등 동적 키';
