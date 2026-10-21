-- DRAFT ONLY. Inspect live schema/role defaults first. No production execution.
-- Collision-safe: CREATE without IF NOT EXISTS fails rather than reuses a table.
BEGIN;
CREATE TABLE public.work_rule_observations_v1 (
 id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(),
 run_id uuid NOT NULL, period_from text NOT NULL CHECK(period_from ~ '^\d{8}$'),
 period_to text NOT NULL CHECK(period_to ~ '^\d{8}$'),
 standard_article_id text NOT NULL CHECK(length(standard_article_id)<=50),
 rule_id text NOT NULL CHECK(length(rule_id)<=500),
 candidate_clause_ids text[] NOT NULL CHECK(cardinality(candidate_clause_ids)<=100),
 selected_clause_ids text[] NOT NULL CHECK(cardinality(selected_clause_ids)<=100),
 CHECK(period_from < period_to),
 CHECK(array_position(candidate_clause_ids,NULL) IS NULL AND array_position(selected_clause_ids,NULL) IS NULL),
 CHECK(array_to_string(candidate_clause_ids,',') = '' OR array_to_string(candidate_clause_ids,',') ~ '^제[0-9]{1,5}조(의[0-9]{1,5})?(,제[0-9]{1,5}조(의[0-9]{1,5})?)*$'),
 CHECK(array_to_string(selected_clause_ids,',') = '' OR array_to_string(selected_clause_ids,',') ~ '^제[0-9]{1,5}조(의[0-9]{1,5})?(,제[0-9]{1,5}조(의[0-9]{1,5})?)*$'),
 verdict text NOT NULL CHECK(verdict IN ('누락','미반영','반영됨')),
 reason text NOT NULL CHECK(reason='period_check_output'),
 missing_count integer NOT NULL CHECK(missing_count BETWEEN 0 AND 100),
 stale_count integer NOT NULL CHECK(stale_count BETWEEN 0 AND 100),
 user_false_positive boolean NOT NULL,
 matcher_version text NOT NULL CHECK(matcher_version ~ '^[0-9a-f]{64}$'),
 rule_version text NOT NULL CHECK(rule_version ~ '^[0-9a-f]{64}$'),
 review_state text NOT NULL DEFAULT 'unreviewed' CHECK(review_state IN ('unreviewed','confirmed_false_positive','expected','needs_more_evidence'))
);
CREATE INDEX work_rule_observations_v1_recent ON public.work_rule_observations_v1(created_at DESC);
CREATE TABLE public.work_rule_observation_reviews_v1 (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 observation_id uuid NOT NULL REFERENCES public.work_rule_observations_v1(id),
 reviewed_at timestamptz NOT NULL DEFAULT now(),
 previous_state text NOT NULL, review_state text NOT NULL
);
CREATE FUNCTION public.work_rule_observation_review_audit_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF (to_jsonb(NEW)-'review_state') IS DISTINCT FROM (to_jsonb(OLD)-'review_state') THEN
  RAISE EXCEPTION 'Observation metadata is immutable';
 END IF;
 IF NEW.review_state IS DISTINCT FROM OLD.review_state THEN
  INSERT INTO public.work_rule_observation_reviews_v1(observation_id,previous_state,review_state) VALUES(NEW.id,OLD.review_state,NEW.review_state);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER work_rule_observation_review_audit_v1 BEFORE UPDATE ON public.work_rule_observations_v1 FOR EACH ROW EXECUTE FUNCTION public.work_rule_observation_review_audit_v1();
-- Proposed policy/privilege scope: NEW objects only; approval required before application.
-- Current project defaults explicitly grant anon/authenticated/service_role all privileges.
ALTER TABLE public.work_rule_observations_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_rule_observation_reviews_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.work_rule_observations_v1, public.work_rule_observation_reviews_v1 FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.work_rule_observations_v1 TO service_role;
GRANT UPDATE (review_state) ON public.work_rule_observations_v1 TO service_role;
GRANT SELECT, INSERT ON public.work_rule_observation_reviews_v1 TO service_role;
REVOKE ALL ON SEQUENCE public.work_rule_observation_reviews_v1_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SEQUENCE public.work_rule_observation_reviews_v1_id_seq TO service_role;
REVOKE ALL ON FUNCTION public.work_rule_observation_review_audit_v1() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rule_observation_review_audit_v1() TO service_role;
-- No public/authenticated policy or grant, no global default-ACL change.
-- Function is SECURITY INVOKER; reviewed server API performs admin authorization.
ROLLBACK;
-- To deploy, approve access/retention and replace ROLLBACK with COMMIT separately.
-- Down migration MUST refuse populated records/reviews; preserve/export first.
