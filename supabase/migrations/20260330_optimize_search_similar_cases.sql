-- Optimized search_similar_cases: faster category matching, no full table scan
CREATE OR REPLACE FUNCTION search_similar_cases(
  query text,
  category text DEFAULT '',
  "limit" integer DEFAULT 15
)
RETURNS TABLE(
  id text,
  title text,
  case_type text,
  reason_category text,
  decision_result text,
  holding_summary text,
  holding_points text,
  summary_short text,
  key_issue text,
  url text,
  relevance real
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  longest_token text;
  cat_parts text[];
BEGIN
  -- Extract longest meaningful token from query (strip Korean suffixes)
  SELECT t INTO longest_token
  FROM unnest(string_to_array(
    regexp_replace(query, '(했습니다|합니다|됩니다|하였다|되었다|있는|없는|하는|되는|된|을|를|이|가|에서|의|으로|로|과|와|해고|징계)', ' ', 'g'),
    ' '
  )) AS t
  WHERE length(t) >= 2
  ORDER BY length(t) DESC
  LIMIT 1;

  -- Split category by slash for matching
  IF category != '' AND category IS NOT NULL THEN
    cat_parts := string_to_array(category, '/');
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT c.*
    FROM cases c
    WHERE
      -- Category filter: match any part of slash-separated category
      (cat_parts IS NULL OR EXISTS (
        SELECT 1 FROM unnest(cat_parts) cp
        WHERE c.reason_category ILIKE '%' || cp || '%'
      ))
      -- Text filter using longest token for fast narrowing
      AND (longest_token IS NULL OR
        c.title ILIKE '%' || longest_token || '%'
        OR c.holding_summary ILIKE '%' || longest_token || '%'
        OR c.key_issue ILIKE '%' || longest_token || '%'
      )
    LIMIT 500
  )
  SELECT
    base.id,
    base.title,
    base.case_type,
    base.reason_category,
    base.decision_result,
    base.holding_summary,
    base.holding_points,
    base.summary_short,
    base.key_issue,
    base.url,
    GREATEST(
      similarity(base.title, query),
      similarity(COALESCE(base.holding_summary, ''), query),
      similarity(COALESCE(base.key_issue, ''), query)
    )::real AS relevance
  FROM base
  ORDER BY relevance DESC
  LIMIT search_similar_cases."limit";
END;
$$;
